## Why

当前 K 线能力围绕“自选股、小规模、每日增量缓存”设计，无法支撑沪深北全部 A 股（含退市股）从上市之日起的全历史日/周/月行情库。为了给后续全市场选股、回测和横截面扫描提供统一、可重建的本地事实源，本期先建立独立的数据下载与存储底座。

## What Changes

- 新增独立的本地行情库 `~/.stockanalyzer/market_data.db`，与现有 `stockanalyzer.db` 双轨运行；本期不切换现有自选股下载与图表读取路径。
- 新增全市场证券主数据同步：覆盖沪市、深市、北交所全部 A 股普通股，包含已退市股票；不含 B 股、基金、可转债和指数。在市股票以交易所官方名录为主，`stock-sdk` 代码列表作为交叉校验与兜底；退市股票由补充清单合并，按来源去重并记录 `code_source`。
- 新增交易日历持久化：源文件全部交易日（含未来已公布交易日）整表替换，源级来源与抓取时间记录在 `meta`，用于判断最新交易日、派生周/月周期边界和轻量缺口检查。
- 新增原始日线事实表 `kline_daily_raw`。全量回填统一从 `19900101` 发起，由数据源仅返回上市后的交易日数据；原始价作为唯一事实源，保留数据源口径的涨跌额、涨跌幅、振幅和换手率。
- 新增复权因子表 `adjust_factors`。使用数据源真实 `'' / qfq / hfq` 日线推导前复权与后复权因子，按股票全量替换；前/后复权价格后续由原始价与因子计算或物化，不再作为一等事实重复入库。
- 新增由日线派生的 `kline_weekly_raw` 与 `kline_monthly_raw` 缓存表，只保存不复权聚合，带 `is_final / source / generated_at`；前/后复权周/月线读取时由日线逐日应用因子后计算，周/月线不再直接向数据源请求。
- 新增 `sync_state` 与 `data_quality_issues`，支持全量回填、手动增量补跑、断点续跑、失败重试、指数退避、限速以及轻量质量异常记录。
- 新增后台同步服务、控制 IPC 与独立“行情库”管理页面；页面提供全量回填、增量更新、失败重试和状态刷新；部分股票或数据类型失败时只重试失败任务，不影响已完成下载的股票；首次启动不自动开始全量回填，全市场每日增量也不自动执行；增量从最早缺失交易日补到最新交易日；默认并发 3/上限 5，RPS 3/上限 5，单任务最多自动重试 3 次。
- 扩展数据库结构迁移机制，允许 `market_data.db` 使用独立的版本化迁移目录与版本台账；现有业务库迁移规则保持不变。
- 本期不引入 DuckDB/Parquet，不实现选股、回测、横截面扫描和多数据源交叉校验。

## Capabilities

### New Capabilities

- `market-data-universe`: 全市场证券主数据与交易日历的发现、合并、去重、状态维护和来源追踪。
- `market-data-storage`: 全市场全历史原始日线事实、复权因子及派生周/月线的 SQLite 存储模型与版本化迁移。
- `market-data-sync`: 全量回填、手动增量补跑、任务状态、断点续跑、失败重试、限速与数据质量记录。
- `market-data-management-ui`: 独立的“行情库”管理页面，同页触发全量回填和增量更新，展示同步状态并支持失败重试。

### Modified Capabilities

- `database-schema-migration`: 扩展版本化迁移机制，支持 `market_data.db` 使用独立迁移目录与版本台账，并定义其初始化规则；`market_data.db` 不做迁移前整库备份，`stockanalyzer.db` 的既有迁移与备份行为保持不变。
- `kline-period-storage`: 将现有“三张同构表 + 唯一约束 + 无跨周期聚合视图”的约束明确限定为既有自选股 K 线库；全市场库采用“原始日线 + 复权因子 + 派生周/月线”模型，新增例外不视为违反该能力。

## Impact

- 新增目录与文件：`sql/market-migrations/`、`electron/marketDatabase.ts`、`electron/services/marketDataSyncService.ts`、`src/views/MarketDataView.vue`、`src/composables/useMarketDataSync.ts`，以及对应类型、IPC 通道和侧边栏入口。
- 复用现有 `stock-sdk`：其 `getHistoryKline` 已确认支持 `'' / qfq / hfq`；`getAShareCodeList` 已确认包含北交所代码但不包含退市股票，因此需增加退市代码补充来源。
- `securities.name / list_date` 以交易所官方名录为主：上交所 `commonQuery.do`、深交所 `/api/report/ShowReport/data` JSON 分页、北交所 `nqxxCnzq.do` POST；沪深退市清单补齐已退市股票，北交所退市用人工/静态兜底。`stock-sdk search/quotes` 与东财 F10 仅作为字段补充，不引入 AKShare 或 xlsx 解析依赖。
- 现有自选股手动/自动 K 线下载、图表读取、资金估值、形态识别等功能本期保持不变。
- 新增数据库预计 10～15 GB 量级，`market_data.db` 不生成迁移前或每日整库备份，仅做元数据轻量快照与 WAL checkpoint；行情事实可从数据源重建。
- 数据源请求量约为“股票数 × 3 套日线”；并发 3/5、RPS 3/5 与最多 3 次指数退避用于降低限流和封禁风险。
