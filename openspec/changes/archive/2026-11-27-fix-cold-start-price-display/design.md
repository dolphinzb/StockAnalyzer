## Context

当前价格链路（`electron/services/priceFetcher.ts`）：

- 调度器只做 `setInterval`，首轮要等满 `polling.interval`，且回调内先判 `isWithinTradingHours()`，盘外直接 return；
- `refreshAllEnabledStocks` 内部再 `filter(s => s.monitorEnabled)`，请求体只含监控股 + 三项指数；
- 仅 `filter(r => r.success)` 的结果会通过 `prices:update` 下发，失败项连失败信息都不到前端；
- 渲染进程 `priceMap` 是纯内存 `Map`，无持久化；`watchlist_stocks` 表无价格字段；
- `src/App.vue` 在 `onMounted` 才注册事件监听，子组件 `onMounted` 早于父组件，任何「渲染进程一挂载就发请求 + 依赖事件回传」的方案都存在丢包窗口；
- 业务库 `stockanalyzer.db` 的 `kline_daily` 已由每日 15:10 自动下载覆盖全部自选股（双复权），含 `change_amount` / `change_percent`，是现成的兜底数据源。

约束：`market_data.db` 初始化失败时自选股功能必须不受影响，因此兜底不能强依赖行情库；告警必须只针对 `monitor_enabled = 1` 的股票。

## Goals / Non-Goals

**Goals:**

- 冷启动后首次可见价格不再依赖定时器是否到点、是否处于交易时段。
- 所有自选股（无论是否开启监控）都有价格；未开启监控的股票不产生告警。
- 实时价格缺失（整批失败 / 单只无效）时，用业务库最近日 K 补齐整行价格，且仅限「前一交易日或当日已入库」的新鲜数据。
- 回退价与实时价完全同权：参与阈值高亮、参与告警、界面不标记。

**Non-Goals:**

- 不改 `watchlist_stocks` 表结构，不新增价格快照表或本地持久化缓存。
- 不改持仓页 `position:fetch-prices` 的返回内容与前端过滤逻辑。
- 不改告警去抖规则、不改 K 线下载/同步流程、不改日志文案。
- 不引入 `market_data.db` 的新读取路径。
- 不为超长自选股列表做分批请求（当前量级几十只，留作后续演进）。

## Decisions

### D1：取价集合与告警集合解耦

取价改为全部自选股 + 三项指数；告警判据保持 `checkAndTriggerAlert` 内部已有的 `if (!stock.monitorEnabled) return;`（`alertService.ts:63-66`）。

- **理由**：`monitor_enabled` 的产品语义是「是否告警」，不是「是否显示价格」。列表渲染的是全量自选股，取价集合与之不一致是空白价的直接原因；而 `addStock` 默认写入 `monitor_enabled = 0`，新加股票在旧逻辑下永远无价。
- **备选（已否决）**：只给未监控股走日 K 回退。会让同一列表出现「实时价 + 昨收价」混排，而回退价又不做标记，用户无法分辨。
- **影响点**：`refreshAllEnabledStocks` 不再内部过滤；`startScheduler(getWatchlist)`；`prices:refresh` handler 改传 `getWatchlist()`。函数名建议改为 `refreshWatchlistQuotes` 以准确表达语义（保留旧名亦可，不作为验收条件）。

### D2：启动首拉由渲染进程触发，并改为「请求-响应」取数

`src/App.vue` 的 `onMounted` 中，先 `setupEventListeners()`，紧接着调用一次 `watchlistStore.refreshPrices()`；同时把 `prices:refresh` 的 IPC handler 改为**返回**本轮 `PriceUpdate[]`，`store.refreshPrices()` 用返回值直接写入 `priceMap`。定时轮询继续走 `prices:update` 事件推送。

- **理由**：只靠事件推送时，首拉与监听注册的先后顺序不可控（Vue 子组件 mounted 先于父组件，主进程 `did-finish-load` 与 Vue 挂载也没有稳定先后）。返回值的通路不依赖任何时序假设。
- **备选（已否决）**：主进程在 `did-finish-load` 立即推送。仍需保证渲染进程已注册监听，本质上还是竞态；且主进程无法确认渲染进程是否已就绪。
- **注意**：首拉要绕过 `isWithinTradingHours()`，定时轮询保持现有交易时段限制不变。

### D3：回退合并在主进程完成，一次批量 SQL

在 `electron/database.ts` 新增批量查询：一次取出给定代码集合中「每只股票各自最新一根日 K」，结果中每行的 `trade_date` 即为该股自己的 `MAX(trade_date)`。这里的 `MAX(trade_date)` 指**按股票代码分组后的组内最大值**（每只股票各自的最新交易日），由取最新行的 `GROUP BY` / 窗口查询自然带出，不需要额外再查一次；新鲜度判定不以这个最大值为基准，而是按 D5 用 `getLastTradingDay` 推出的前一交易日，逐股比较各自的 `trade_date`。回退合并发生在 `priceFetcher` 构造下发结果时，推送与 IPC 返回值走同一份数据。

- **理由**：SQLite 只在主进程可达；避免每只股票一次 IPC（几十次往返）；避免推送路径与返回值路径逻辑分叉。
- **备选（已否决）**：渲染进程逐股调用 `kline:get-chart-data` 再本地兜底。请求次数随列表线性增长，且无法影响 `prices:update` 推送内容。
- **不做缓存**：每轮刷新一条批量 SQL，几十行数据的开销可忽略；缓存反而要处理「K 线下载完成后失效」的复杂度。

### D4：回退字段映射与可空字段

回退行的字段映射：

| 展示列 | 来源 |
|---|---|
| 现价 `price` | `kline_daily.close` |
| 今开 / 最高 / 最低 | `open` / `high` / `low` |
| 涨跌额 | `change_amount`（已有存储值，不前端反算） |
| 涨跌幅 | `change_percent` |
| 昨收 | `close - change_amount`（`change_amount` 缺失时为 `null`） |

- 复权类型：`adjust_type = ''`（不复权）优先，缺失时用 `qfq`；两者都没有则该股不回退。最新交易日前复权价与实际价一致，仅作为次选。
- 上述任一字段在库中为 `NULL` 时，对应字段下发 `null`，渲染层沿用既有 `formatPrice(null) → '-'`，**不**用 `0` 顶替（否则会显示 `¥0.00`）。为此把 `src/types.ts` 的 `PriceUpdate` 中价格类字段放宽为 `number | null`，主进程下发结构与之一致；`price` 本身必须为有效正数才会下发回退。
- 回退不可用的股票**不下发**该 code（而不是下发 `price: 0`），以保留前端已有价格，符合「全部失败时不清空」的既有语义。

### D5：新鲜度判定基准取「前一交易日」，而非「今天」

回退仅在个股日 K 的最新 `trade_date` ≥ 前一交易日时生效。前一交易日由现有 `klineDownloadService.getLastTradingDay(昨日)` 取得（内部已优先用交易日历、失败回退排除周末规则，返回 `YYYYMMDD`，需转 `YYYY-MM-DD` 比较）。

- **理由**：不使用「今天」是因为盘前/盘中的最新日 K 必然是昨天；不使用「全库 `MAX(trade_date)`」是因为当全部自选股下载连续失败时，全库最新日期会退化到几天前，等于把陈旧数据当新鲜数据放行。允许「≥ 前一交易日」而非「=」是为了兼容 15:10 自动下载完成当日 K 线后、回退改用当日收盘价的场景（此时数据比昨收更新，语义正确）。
- **日历不可用时**：`getLastTradingDay` 内部回退到工作日规则，节假日可能误判并导致回退暂时不可用（显示 `-`），属可接受降级，不影响应用可用性，也不引入对 `market_data.db` 读取的硬依赖。
- **空库**：`kline_daily` 无任何数据时判定不可用，全部保持 `-`。

### D6：失败项不再被过滤，但只下发「有值」的项

`refreshAllEnabledStocks` 的下发逻辑改为：逐只判断 → 实时成功且有正价则用实时值；否则查日 K 回退；回退不可用则跳过该 code。告警检查也用同一份合并结果（回退价同样参与）。

- 保持「整批失败不清空界面、不弹全局错误」的既有行为。

### D7：行情请求增加超时

`requestSnapshots` 的 `fetch` 增加 `AbortSignal.timeout(5000)`（或等价 `AbortController`），超时按整批失败处理并进入日 K 回退。

- **理由**：当前 `fetch` 无超时（`priceFetcher.ts:92`），冷启动首拉遇弱网会长时间挂起，界面持续空白，等同于需求未实现。
- 5 秒为经验值：三家接口正常响应在 1 秒内。

## Risks / Trade-offs

- [取价范围扩大导致 URL 变长，极端大量自选股时可能触发服务端/代理长度限制] → 现阶段自选股为几十只量级，单次批量仍远低于限制；若未来超过约 80 只，再引入分批（同一轮内多次请求），不影响规格语义。
- [回退价参与告警后，盘外启动时可能用昨收价触发一次告警] → 这是用户明确确认的产品行为；告警去抖仍为 5 分钟，不会重复轰炸。
- [前复权回退价在除权日与真实价格存在偏差] → 仅在完全不复权数据缺失时使用，且除权日后最新日前复权价通常已对齐实际价。
- [节假日首日、交易日历不可用时回退暂时失效] → 只影响展示为 `-`，不影响实时链路；实时价在盘外通常仍能取到节前收盘价，需求仍被满足。
- [放宽 `PriceUpdate` 字段为可空] → 需核对所有消费方；当前仅 `StockItem.vue` 读值展示、`position` store 只取 `price`、`alertService` 只取 `price`，风险可控。

## Migration Plan

无数据库结构与配置迁移。上线即生效；回滚仅需回退代码。旧版本数据库可直接被新代码读取（仅新增只读查询）。

## Open Questions

无。
