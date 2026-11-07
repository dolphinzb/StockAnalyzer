## 1. 共享类型与常量

- [x] 1.1 在 `shared/types/index.ts` 新增 `KlinePeriod = 'd' | 'w' | 'm'`，以及 `KLINE_PERIODS`、`KLINE_PERIOD_LABELS`（日线/周线/月线）常量
- [x] 1.2 `KlineDownloadInput` 增加 `period?: KlinePeriod`；`KlineBatchDownloadInput` 增加 `period?: KlinePeriod`（单选，缺省为日线）；`KlineBatchProgressPayload` 增加周期信息；`KlineBatchStockResult` 结果字段保持按复权类型区分，并携带本次任务周期
- [x] 1.3 `KlineAPI` 中 `getChartData` 签名改为 `(stockCode, adjustType, period: KlinePeriod)`，`downloadKlineBatch` 入参含 `period`；`kline:updated` payload 增加 `periods: KlinePeriod[]`（单元素）
- [x] 1.4 `src/types.ts` 确认新增类型已 re-export，`Window.klineAPI` 声明同步

## 2. 数据库表结构与映射

- [x] 2.1 `sql/init.sql` 将 `kline_data` DDL 改为 `kline_daily`，并复制出 `kline_weekly`、`kline_monthly`（字段与唯一键完全一致），索引按周期分别命名 `idx_kline_<period>_code` / `_date` / `_code_date_adjust`
- [x] 2.2 在 `electron/database.ts` 新增 `KLINE_TABLES` 映射与 `tableOf(period)` 白名单校验（非法抛 `INVALID_PERIOD`）
- [x] 2.3 `saveKlineData(stockCode, klines, adjustType, period)` 改为按 `tableOf(period)` 写目标表
- [x] 2.4 `getKlineData(stockCode, period, startDate?, endDate?)` 改为按周期选表查询
- [x] 2.5 `getChartData(stockCode, adjustType, period)` 改为按周期选表并按 `trade_date` 升序返回
- [x] 2.6 `electron/services/fundService.ts` 两处 `SELECT close FROM kline_data` 改为显式查询 `kline_daily` 并补注释「估值固定使用日线」
- [x] 2.7 周线/月线写库前清除当前周期（本周一 / 本月 1 号起）内旧记录，避免未完成周期按不同 `trade_date` 堆出多行；仅在批次包含当前周期记录时清理，防止历史区间下载误删；新增 `getCurrentPeriodStart()`
- [x] 2.8 补单元测试：`klineCurrentPeriod.test.ts`（周期起始日计算）+ `klinePeriodOverwrite.test.ts`（同周期覆盖、跨周期保留、历史区间不误删、日线不受影响）

## 3. 存量库迁移脚本

- [x] 3.1 新建 `scripts/migrate-split-kline-tables.ts`：检测 `kline_data`/`kline_daily` 存在状态，判定是否需要迁移
- [x] 3.2 迁移前整库文件级备份为 `stockanalyzer.db.bak-<ts>`
- [x] 3.3 执行 `ALTER TABLE kline_data RENAME TO kline_daily`，`DROP INDEX IF EXISTS idx_kline_data_*`，创建三表索引（幂等）
- [x] 3.4 创建 `kline_weekly`、`kline_monthly`（`IF NOT EXISTS`）
- [x] 3.5 迁移后核对 `kline_daily` 行数与备份中 `kline_data` 行数，不一致则还原备份并以非零状态退出；一致则打印日线行数
- [x] 3.6 已迁移状态下重复执行仅补建缺表与索引，不报错
- [x] 3.7 `scripts/init-database.ts` 中 `kline_data` 相关的字段探测、备份、重建、恢复逻辑改为 `kline_daily`，并确保初始化时三表齐备
- [x] 3.8 增加三表列一致性检查（比较 `PRAGMA table_info` 列名集合），不一致时打印告警
- [x] 3.9 在 `electron/database.ts` 的 `initDatabase()` 中内置幂等自动迁移（改名 + 清理旧索引 + 补齐三表与索引 + 行数校验），旧库升级后无需手动执行脚本

## 4. 下载服务支持周期

- [x] 4.1 `klineDownloadService.ts` 新增 `SDK_PERIODS = { d: 'daily', w: 'weekly', m: 'monthly' }` 映射
- [x] 4.2 `downloadSingleAdjust` 增加 `period` 参数，替换硬编码 `period: 'daily'`，并写入对应表
- [x] 4.3 `downloadKline` 增加 `period` 入参（默认 `'d'`），循环中透传，结果统计按周期区分
- [x] 4.4 `downloadWithRetry` / `downloadBatch` 增加单值 `period` 支持，按「所选周期 × 复权类型」串行处理，进度回调携带周期
- [x] 4.5 `performAutoDownload` 在日线完成后追加近 30 天周线与近 90 天月线的覆盖下载；周/月线失败仅记日志，不影响日线成功判定
- [x] 4.6 `getChartData`（服务层）与 `kline:updated` 广播补充周期信息

## 5. IPC 与 preload

- [x] 5.1 `electron/index.ts` 的 `kline:download` / `kline:download-batch` handler 接收并校验单值 `period`（缺省按日线处理）
- [x] 5.2 `kline:get-chart-data` handler 增加必填 `period`，缺省或非法返回 `INVALID_PERIOD`，不得回落到日线
- [x] 5.3 `preload/index.ts` 的 `klineAPI` 各方法签名与类型同步更新

## 6. 前端周期切换与展示

- [x] 6.1 `KlineChartDialog.vue` 新增周期分段控件（日/周/月），默认 `'d'`，样式复用 `.adjust-switcher`
- [x] 6.2 数据请求改为 `(stockCode, adjustType, period)`，周期与复权切换均触发重新加载
- [x] 6.3 空数据回滚逻辑扩展：周期切换无数据时回滚周期并提示「暂无{周期}{复权}数据，请先下载」
- [x] 6.4 `useKlineChart.ts` 日期轴标签按周期切换：月线 `YYYY-MM`，日线/周线 `MM-DD`
- [x] 6.5 `drawTradeMarkers` 改为按周期归集：日线精确匹配，周/月线映射到「第一根 `tradeDate >= 交易日`」的K线，同柱多笔合并；超出末根时跳过不报错
- [x] 6.6 周线/月线视图下不渲染形态标记；`src/stores/patternScan.ts` 固定以 `period='d'` 取数

## 7. 下载弹窗

- [x] 7.1 `KlineDownloadDialog.vue` 增加周期单选控件，默认日线，日期范围默认值保持当日且不随周期变化，提交时携带 `period`
- [x] 7.2 `KlineBatchDownloadDialog.vue` 增加周期单选控件（日/周/月互斥），默认日线，日期范围默认值保持当日
- [x] 7.3 批量逐只状态按复权类型展示写入条数，未获取到数据时显示「未获取到K线数据」提示

## 8. 验证

- [x] 8.1 在存量库副本上执行迁移脚本，确认日线行数一致、三表齐备、重复执行无副作用
- [ ] 8.2 下载同一股票的日/周/月三周期数据，确认互不覆盖且各自可查询（当前环境数据源网络不可达，待联网后执行）
- [ ] 8.3 前端验证周期切换、日期轴格式、交易标记归集、空数据回滚提示（需人工在应用内验证）
- [ ] 8.4 验证持仓市值计算在存在周/月线数据时结果不变（需真实持仓数据，人工验证）
- [x] 8.5 运行类型检查与构建，确认无类型错误
