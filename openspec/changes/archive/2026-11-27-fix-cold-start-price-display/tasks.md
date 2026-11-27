## 1. 业务库回退查询

- [x] 1.1 在 `electron/database.ts` 增加批量查询：给定股票代码数组，返回每只股票各自最新一根日 K（不复权优先，缺失时取前复权），字段含 `trade_date`、`open`、`high`、`low`、`close`、`change_amount`、`change_percent`，单条 SQL 完成，表名经 `tableOf('d')` 取得
- [x] 1.2 在 `electron/database.ts`（或复用既有交易日工具）增加「前一交易日」取得方法：调用 `getLastTradingDay(昨日)` 并把 `YYYYMMDD` 转为 `YYYY-MM-DD`；日历不可用时沿用其内部的工作日回退
- [x] 1.3 为 1.1 / 1.2 补单元测试：多股票多复权取最新、仅前复权存在、无数据股票、空库、`trade_date` 等于/早于前一交易日的边界

## 2. 主进程取价与回退合并

- [x] 2.1 `electron/services/priceFetcher.ts`：`refreshAllEnabledStocks` 去掉 `filter(s => s.monitorEnabled)`，取价范围改为传入的全部自选股；函数按语义重命名（或在注释中明确新语义），同步更新调用点
- [x] 2.2 `requestSnapshots` 的 `fetch` 增加 5 秒超时（`AbortSignal.timeout` 或等价实现），超时按整批失败返回
- [x] 2.3 新增回退合并逻辑：逐只判定实时价是否有效（`success` 且 `price > 0`），无效时用最新日 K 补齐整行字段，映射见 design D4；`close` 无效或不满足新鲜度条件时不加入下发结果
- [x] 2.4 回退项同样进入 `checkAndTriggerAlert` 调用链（告警内部已按 `monitorEnabled` 拦截），确认未监控股不产生告警
- [x] 2.5 下发逻辑去掉 `filter(r => r.success)` 的二次过滤，改为按 2.3 的结果逐只下发；不可用股票既不下发 `price: 0` 也不下发该 code
- [x] 2.6 补单元测试：实时成功优先、实时失败走回退、回退陈旧被丢弃、整批失败全部不可用时的下发结果为空

## 3. 调度与 IPC 接线

- [x] 3.1 `electron/index.ts`：`startScheduler(getWatchlist)`、`prices:refresh` handler 改传 `getWatchlist()`
- [x] 3.2 `prices:refresh` handler 返回值改为本轮 `PriceUpdate[]`；`preload/index.ts` 与 `shared/types/index.ts` 的类型同步为返回 `Promise<PriceUpdate[]>`
- [x] 3.3 定时轮询仍走 `prices:update` 事件推送，行为与交易时段限制保持不变（回归确认）
- [x] 3.4 放宽 `src/types.ts` 中 `PriceUpdate` 的价格类字段为 `number | null`，并核对 `StockItem.vue`、`position` store、告警模块的消费点均安全

## 4. 渲染进程冷启动刷新

- [x] 4.1 `src/App.vue`：`onMounted` 中先 `setupEventListeners()`，随后立即 `void watchlistStore.refreshPrices()`
- [x] 4.2 `src/stores/watchlist.ts`：`refreshPrices()` 用 IPC 返回值直接写入 `priceMap`，异常时保留现有价格且不抛出到 UI
- [x] 4.3 确认首帧时序：刷新结果返回前列表显示 `-`，返回后立即填充；不回退价行不出现任何标记

## 5. 验收与回归

- [x] 5.1 `npm test` 全部通过（含新增测试）
- [x] 5.2 `npm run typecheck` 与 `npm run build:electron` 通过
- [x] 5.3 手工验证：交易时段启动立即有价；盘外启动立即有价或回退昨收；拔网线启动 5 秒后回退；新加自选（未监控）立即可见价格且不告警；停牌股显示 `-`；持仓页行为与改动前一致
