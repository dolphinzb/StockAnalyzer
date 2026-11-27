## Context

`market_data.db` 已保存全市场证券的原始日线、复权因子与周/月派生表，但当前渲染层只有「行情库」同步管理页与「股票列表」名录页，没有查看 K 线的界面。现有自选股 K 线弹窗经 `window.klineAPI.getChartData` 读取 `stockanalyzer.db`，只覆盖用户已下载的股票，且仅支持不复权/前复权。项目为 Electron 35 + Vue 3 + TypeScript，无 vue-router，视图切换通过 `ViewId` + 动态组件；Canvas K 线由 `useKlineChart` 提供绘制、缩放、拖动与 tooltip。

## Goals / Non-Goals

**Goals:**

- 用户能从侧边栏进入独立页面，搜索任意证券并查看其完整历史 K 线。
- 支持日/周/月周期与不复权/前复权/后复权切换。
- 复用既有 Canvas 交互：滚轮缩放、拖动平移、悬停 tooltip（日期/开高低收/涨跌额/涨跌幅）。
- 查询通道只读，不改动行情同步、自选股图表与业务库 K 线路径。

**Non-Goals:**

- 不提供 K 线编辑、交易标注、形态识别标注或下载功能。
- 不新增日期筛选或分页加载；全历史一次返回。
- 不引入第三方图表库，不修改 `useKlineChart` 的既有实现。
- 不在行情同步完成后自动刷新当前图表。

## Decisions

### D1: 新增独立的全市场 K 线只读 IPC

主进程新增 `market:kline:query`，经 preload 暴露为 `window.marketDataAPI.queryKline()`，只读取 `market_data.db`。参数校验复用 `ipcValidation.ts` 的 SCHEMAS 机制：`stockCode` 非空、周期限定 `d|w|m`、复权限定 `none|qfq|hfq`。非法参数直接 reject，返回可读错误。

替代方案：扩展 `klineAPI.getChartData` 支持新库——会污染业务库路径并破坏现有规格边界，不采用。

### D2: 主进程统一返回结构，渲染进程做展示映射

新增 `MarketKlineBar`（`tradeDate/open/high/low/close/volume/amount/turnoverRate/amplitude/changePercent/changeAmount`），由仓储层统一产出；渲染页把它映射为 `useKlineChart` 所需的 `KlineData[]`，其中 `id` 用序号、`adjustType` 只作类型占位（图表实际只依赖 `stockCode` 决定价格精度）。

替代方案：把 `useKlineChart` 泛型化为通用 K 线结构——需要改动现有弹窗与多个测试，回归面大，不采用。

### D3: 涨跌字段口径

- 日线不复权：直接使用 `kline_daily_raw` 已存储的 `change_amount/change_percent`，不在渲染进程重算。
- 日线复权：新增 `readAdjustedDaily`，按 `readAdjustFactors` 逐日乘因子到 OHLC；涨跌额/涨跌幅/振幅在主进程按复权价与前一个交易日收盘价计算。
- 周/月不复权：用 `readDerivedPeriods`，以 `periodEndDate` 作为展示日期；派生表不存涨跌字段，按相邻周期收盘价在主进程补齐，首根为 `null`。
- 周/月复权：复用 `readAdjustedPeriodKline`，其结果已按日线逐日应用因子再聚合，并已计算涨跌字段。

因子完全缺失时返回空数组并提示，禁止退化为不复权数据，与 `market-data-storage` 既有口径一致。

### D4: 一次加载全历史 + 请求序号防竞态

每次切股、切周期或切复权发起一次查询，返回后一次性 `setData`。快速连续操作时用递增请求序号丢弃过期响应，避免旧数据覆盖当前选择。缩放、拖动完全在 Canvas 本地完成，不额外请求。

替代方案：按需增量加载——需要改造图表的偏移量边界与数据拼接，收益不明显，不采用。

### D5: 导航与选股

`useNavigation.ts` 增加 `ViewId = 'market-kline'` 和一个轻量的选中证券代码状态；`App.vue` 注册 `MarketKlineView.vue`；`SideNav.vue` 在「股票列表」后增加「K线查看」入口。新页面内用 `marketDataAPI.listSecurities` 做 300ms 防抖搜索并下拉选股；「股票列表」行的「查看K线」按钮写入选中代码后跳转，页面加载后自动查询。

### D6: Tooltip 与交互直接复用

页面只负责数据加载与工具栏，Canvas 事件与 tooltip 模板沿用 `useKlineChart` 与现有弹窗的模板写法：涨跌额/涨跌幅为 `null` 时显示 `—`，价格精度由 `getPricePrecision(stockCode)` 决定，涨跌着色与现有规格一致。

## Risks / Trade-offs

- [全历史响应体较大，单只股票可达数千至上万根 K 线] → IPC 采用结构化克隆且只传必要字段；若实测卡顿再评估分页或二进制传输，本期不引入。
- [复权因子缺失导致复权视图为空] → 明确提示「暂无该复权数据」，不静默回退不复权，避免误导。
- [周/月派生表缺涨跌字段，需读取时计算] → 计算统一放在主进程，渲染层仍只读字段；首根周期显示占位符。
- [全历史一次加载在切换周期时有等待] → 显示 loading 态并用请求序号防竞态；切换期间保留上一次图面，成功后再替换。
- [映射层 `adjustType` 为占位值] → 在代码注释中明确其仅用于满足图表类型约束，后续若图表依赖该字段需重新评估映射。

## Migration Plan

无需数据库迁移，新增查询不写任何库表。上线即新增 IPC、页面与导航项；「股票列表」新增按钮为纯前端增量。回滚时移除 change 对应代码即可，既有自选股图表与行情同步不受影响。归档时新能力同步进 `openspec/specs/`，`securities-directory-ui` 的 delta 合并进主规格。

## Open Questions

无。
