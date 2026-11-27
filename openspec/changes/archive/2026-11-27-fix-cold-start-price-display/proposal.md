## Why

应用每次冷启动时，自选股列表的今开、最高、最低、现价、涨跌额、涨跌幅全部显示 `-`，直到第一次定时轮询（默认 1 分钟后）才可能出现数据；盘外启动则因整轮跳过交易时段判断而始终为空白。根因有三：启动时不立即取价、数据库没有任何价格快照、以及未开启监控的股票被排除在取价范围之外（新加自选默认 `monitor_enabled = 0`，因此永远没有价格）。

## What Changes

- **冷启动立即取价**：应用启动后立即发起一次全量行情请求，不等待轮询间隔，也不受交易时段限制；结果通过 IPC 返回值直接交给渲染进程，不依赖事件推送，避免监听尚未注册导致的丢包。
- **取价范围改为全部自选股**：批量请求包含全部自选股 + 三项指数；`monitor_enabled` 只决定是否告警，不再决定是否取价。
- **实时价格缺失时回退到本地日 K**：整批请求失败、或单只返回现价 `0`/`"-"`/空时，从业务库 `stockanalyzer.db` 的 `kline_daily` 读取该股最近一根日 K，用 `close` 作为现价，并由 `open`/`high`/`low`/`change_amount`/`change_percent` 补齐其余列。
- **陈旧 K 线不显示**：回退仅在该股最新日 K 的交易日不早于前一交易日（由交易日历推导，含当日已入库数据）时生效；无法确定前一交易日或 K 线库为空时全部不可用，否则该股价格保持 `-`。
- **回退价与实时价同权**：回退价参与阈值高亮、参与价格告警，界面上不做任何特殊标记（不加角标、不改变颜色、不加 tooltip）。
- **上游请求加超时**：行情请求增加超时控制，超时即按失败处理并进入日 K 回退，避免网络异常时长期空白。
- **不改动持仓页**：`position:fetch-prices` 链路的行为保持不变，不纳入回退。
- 不修改日志文案；不涉及 `market_data.db` 的任何表。

## Capabilities

### New Capabilities
- `kline-price-fallback`: 实时行情缺失时以业务库最近日 K 补齐自选股展示价，包含回退字段映射、回退价的展示与告警语义、以及陈旧 K 线不可用的判定。

### Modified Capabilities
- `quote-data-source`: 「批量请求语义」由「所有开启监控的自选股 + 三项指数」改为「全部自选股 + 三项指数」；新增「启动即刷新」与「请求超时」两项要求。

## Impact

- `electron/services/priceFetcher.ts`：取价范围、失败项下发、日 K 回退合并、请求超时；启动首拉由渲染进程触发。
- `electron/database.ts`：新增批量查询「各股最近一根日 K」；新鲜度基准复用既有交易日历工具取得前一交易日。
- `electron/index.ts`：`startScheduler` / `prices:refresh` 改传全部自选股；`prices:refresh` 返回刷新结果。
- `src/App.vue`、`src/stores/watchlist.ts`：启动时触发一次刷新并直接应用返回值。
- `shared/types/index.ts`：新增 `PriceUpdate` 定义（价格类字段可空）及 `prices:refresh` 的返回类型。
- 规格：`openspec/specs/quote-data-source/spec.md`（修改），新增 `openspec/specs/kline-price-fallback/spec.md`。
- 不影响：`watchlist_stocks` 表结构、持仓页、告警去抖规则、K 线下载流程。
