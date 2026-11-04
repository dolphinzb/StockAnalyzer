## Why

当前系统只能下载和查看日K线，周期在 `electron/services/klineDownloadService.ts` 中被硬编码为 `period: 'daily'`，而 `stock-sdk` 的 `getHistoryKline()` 原生支持 `weekly` / `monthly`。用户需要按周、月维度观察趋势，却只能对日线做心算或借助外部工具。同时，现有 `kline_data` 表的唯一键 `(stock_code, trade_date, adjust_type)` 无法容纳多周期数据（周线日期与日线日期必然重合会互相覆盖），需要先解决存储模型。

## What Changes

- **BREAKING**: 日线表 `kline_data` 重命名为 `kline_daily`，并新增 `kline_weekly`、`kline_monthly` 两张同构表；三表各自保留 `UNIQUE(stock_code, trade_date, adjust_type)`，不引入 `period` 列。
- **BREAKING**: 数据访问层（`saveKlineData` / `getKlineData` / `getChartData`）与 IPC 契约新增 `period` 参数，取值 `'d' | 'w' | 'm'`，内部经白名单映射到具体表名，禁止拼接外部输入。
- 存量用户数据库通过幂等迁移脚本完成 `kline_data → kline_daily` 改名与索引重建，已有日线数据不重新下载、不丢失。
- 下载服务支持按周期下载：单只下载与批量下载均可选择日线/周线/月线（单选），默认为日线以保持现有行为，日期范围默认沿用当日；自动下载任务固定下载当日日线，并按周期覆盖重下近端周线/月线最新一根。
- K线图弹窗新增「日 / 周 / 月」周期切换器，与现有「不复权 / 前复权」切换并存；切换后无数据时回滚并提示先下载对应周期数据。
- 日期轴标签按周期自适应：日线/周线显示 `MM-DD`，月线显示 `YYYY-MM`；交易记录标记按所选周期把交易日归档到所属周/月后对齐。
- 持仓估值、形态检测等下游消费方显式固定使用 `kline_daily`，避免被周线/月线数据污染。

## Capabilities

### New Capabilities
- `kline-period-storage`: 日/周/月三表存储模型、周期到表名的映射规则、存量库迁移与索引重建、写入幂等与查询隔离。
- `kline-period-switch`: K线图周期切换交互、按周期请求数据、日期轴标签格式、交易标记与形态标记的周期对齐、空数据回滚提示。

### Modified Capabilities
- `kline-download`: 下载入口与批量下载弹窗新增周期选择，服务层与 IPC 契约透传 `period`，自动下载任务按周期分别处理。

## Impact

- **数据库**：`sql/init.sql`（建表与索引）、新增 `scripts/migrate-split-kline-tables.ts`、`scripts/init-database.ts`（表名校验与备份恢复逻辑）、用户的 `~/.stockanalyzer/stockanalyzer.db`
- **主进程**：`electron/services/klineDownloadService.ts`（周期透传、自动下载）、`electron/database.ts`（三表读写、表名映射）、`electron/services/fundService.ts`（固定日线表）、`electron/index.ts`（IPC 参数与事件 payload）
- **共享类型**：`shared/types/index.ts`（`KlineData`、`KlineDownloadInput`、`KlineBatchDownloadInput`、`KlineBatchProgressPayload`、`KlineAPI`、`Window` 声明）、新增 `KlinePeriod` 枚举
- **渲染进程**：`preload/index.ts`、`src/components/KlineChartDialog.vue`、`src/components/KlineDownloadDialog.vue`、`src/components/KlineBatchDownloadDialog.vue`、`src/composables/useKlineChart.ts`（日期轴与标记对齐）、`src/stores/patternScan.ts`（固定日线）
- **非目标**：不实现 `kline_all` 聚合视图；不新增后复权 `hfq`；不从日线本地聚合生成周线/月线（一律走数据源原生周期）；不改变现有复权类型选择模型
