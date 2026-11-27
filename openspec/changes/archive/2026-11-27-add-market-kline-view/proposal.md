## Why

全市场历史 K 线已经回填到 `market_data.db`，证券名录页也只能看到代码与名称，用户无法直接查看任意股票的历史走势。现有 K 线弹窗只读取业务库 `stockanalyzer.db`，仅覆盖已下载股票且不支持后复权，缺少面向全市场行情库的只读查看入口。

## What Changes

- 新增只读 IPC `market:kline:query`：按股票代码、周期（日/周/月）与复权类型（不复权/前复权/后复权）返回完整历史 K 线，含参数校验与主进程侧涨跌字段计算。
- `marketRepository` 增加日线复权读取，并复用既有周/月派生与复权聚合函数；日线不复权仍直接读取已存储字段，不在渲染进程计算涨跌。
- 新增独立页面「K线查看」（`ViewId = 'market-kline'`）：证券搜索选股、日/周/月切换、三种复权切换、Canvas 图表、滚轮缩放、拖动平移与悬停 tooltip。
- 复用 `useKlineChart` 完成交互，不修改自选股 K 线弹窗和业务库读取路径；切股/切周期时全历史一次加载并用请求序号防竞态。
- 「股票列表」页每行增加「查看K线」操作，带股票代码跳转到新页面并自动选股。

## Capabilities

### New Capabilities

- `market-kline-query`: 全市场行情库 K 线只读查询能力——周期与复权口径、涨跌字段来源、参数校验、空数据与错误处理。
- `market-kline-view`: 「K线查看」页面能力——入口、选股、周期/复权切换、图表交互复用、tooltip 字段与状态呈现。

### Modified Capabilities

- `securities-directory-ui`: 名录行新增「查看K线」操作及其跳转行为。

## Impact

- 主进程：`electron/index.ts`（新增 IPC handler）、`electron/services/marketRepository.ts`（新增日线复权读取与统一返回结构）、`electron/ipcValidation.ts`（新增 SCHEMAS 条目）。
- 预加载与共享层：`preload/index.ts`、`shared/types/index.ts`（`MarketDataAPI` 扩展、查询入参与返回体类型）。
- 渲染进程：新增 `src/views/MarketKlineView.vue`，修改 `src/composables/useNavigation.ts`、`src/App.vue`、`src/components/SideNav.vue`、`src/views/SecuritiesDirectoryView.vue`。
- 数据层：不新增数据库迁移，不写库；仅读取 `kline_daily_raw`、`adjust_factors`、`kline_weekly_raw`、`kline_monthly_raw`。
- 不影响行情同步调度、自选股轮询、K 线下载与现有 K 线弹窗。
