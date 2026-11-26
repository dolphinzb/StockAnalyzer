## Why

当前全市场行情库的全量回填与增量下载依赖 `stock-sdk` 背后的东方财富历史 K 线接口，数据源单一且复权因子完全依赖服务端返回的 raw/qfq/hfq 三类价格。为了增加可替换的历史行情来源，并验证搜狐 `hisHq` 能否承担全市场日线回填与增量补跑，需要在不改变自选股现有下载链路的前提下，将行情库 K 线数据源切换为搜狐，并在本地推导复权因子。

## What Changes

- 行情库全量回填与增量下载的 K 线请求改走搜狐 `hisHq`；证券池、交易日历、名称补全和搜索仍保留 `stock-sdk`。
- `MarketSdkLike` 继续作为上层契约；其实现改为混合客户端：非 K 线方法委托 `StockSDK`，`getHistoryKline()` 委托新的搜狐适配器。
- 保留现有 `raw_daily / qfq_daily / hfq_daily` 三类同步任务、任务键、断点续跑、失败重试、限速和质量检查语义。
- 本次同步路径只使用搜狐原始日线价格；服务适配器利用搜狐返回的涨跌额/涨跌幅在本地推导前复权与后复权因子，并按 `adjust` 参数返回对应序列。
- 原始日线数据源标识改为 `sohu_hisHq`。**BREAKING（数据口径）**：已有行情库若含东方财富数据，不应与搜狐数据混用，需要重新执行一次全量回填后再使用增量更新。
- 不新增 npm 依赖；使用现有 `fetch` 与 Node 的 GBK 解码能力解析搜狐响应。
- 自选股页面手动下载、每日 15:10 自动下载、图表展示、资金估值和形态识别的读取路径保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `market-data-sync`: 行情库全量/增量 K 线请求改用搜狐 `hisHq`；raw/qfq/hfq 三类任务语义不变，但 qfq/hfq 由本地因子推导；失败不回退东方财富；数据源标识与验证要求随之调整。
- `market-data-storage`: `adjust_factors` 的因子来源从“数据源真实 qfq/hfq 收盘价”调整为“搜狐原始日线 + 搜狐涨跌额/涨跌幅推导”；原始日线来源标识改为 `sohu_hisHq`。

## Impact

- 新增：`electron/services/sohuKlineClient.ts`、`electron/services/sohuAdjustment.ts` 及对应单元测试。
- 修改：`electron/services/marketSdkClient.ts`（混合客户端）、`electron/services/marketDataSyncService.ts`（数据源常量与单例 wiring）、相关 mock 与集成验证。
- 不修改：`electron/services/klineDownloadService.ts`、IPC 通道、前端页面、数据库表结构与迁移文件。
- 数据迁移：切换后建议重新执行全量回填；增量更新仍要求全量任务完成后才可用。
- 风险：搜狐为非官方接口，需验证长区间请求、成交额单位、字段数量变化以及除权除息日的因子推导准确性。
