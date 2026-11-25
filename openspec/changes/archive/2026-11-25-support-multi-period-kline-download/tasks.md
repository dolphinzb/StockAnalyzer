## 1. 共享类型与校验契约

- [x] 1.1 `shared/types/index.ts`：`KlineDownloadInput.period?: KlinePeriod` 改为 `periods?: KlinePeriod[]`；`KlineBatchDownloadInput` 同步替换
- [x] 1.2 `shared/types/index.ts`：新增 `KlineDownloadPeriodResult`（`period` / `success` / `unadjustedCount` / `adjustedCount` / `unadjustedError` / `adjustedError` / `error`）
- [x] 1.3 `shared/types/index.ts`：`KlineDownloadResult` 增加 `periods?: KlinePeriod[]`、`byPeriod?: KlineDownloadPeriodResult[]`，并把原有条数/错误字段注释改为「所有所选周期的合计」
- [x] 1.4 `shared/types/index.ts`：`KlineBatchStockResult` 增加 `periods?: KlinePeriod[]`、`byPeriod?: KlineDownloadPeriodResult[]`；`KlineBatchProgressPayload.period` 改为 `periods: KlinePeriod[]`
- [x] 1.5 `electron/ipcValidation.ts`：`SCHEMAS.klineDownloadBatch` 增加 `periods`（`arrayOf` + `enumOf(KLINE_PERIODS)`，`minLength: 1`、`maxLength: 3`，可选）
- [x] 1.6 `electron/index.ts`：`assertKlinePeriod()` 改造为 `assertKlinePeriods()`（缺省/空数组 → `['d']`；非法元素或空数组拒绝并返回 `INVALID_PERIOD`；按 `d→w→m` 去重排序），`kline:download` 与 `kline:download-batch` 处理器改用该函数

## 2. 主进程下载服务

- [x] 2.1 `klineDownloadService.ts`：抽出 `downloadPeriod(stockCode, startDate, endDate, adjustTypes, period): Promise<KlineDownloadPeriodResult>`，承载原 `downloadKline()` 内「遍历复权类型 + 统计 + 成功判定」的逻辑
- [x] 2.2 `downloadKline()` 签名改为 `periods: KlinePeriod[] = ['d']`，按周期顺序逐个调用 `downloadPeriod()`，聚合顶层合计字段并填充 `periods` / `byPeriod`
- [x] 2.3 `downloadWithRetry()` 改为仅对失败的周期重试 1 次（已成功周期不重复请求），保持原有日志风格
- [x] 2.4 `kline:updated` 广播改为使用本次实际下载的周期数组（多周期时长度为 2 或 3）
- [x] 2.5 `downloadBatch()` 签名改为 `periods: KlinePeriod[] = ['d']`，进度 payload 携带 `periods`，逐只调用 `downloadKline()` / `downloadWithRetry()` 时传入完整周期数组
- [x] 2.6 `buildBatchStockResult()` 改为按 `byPeriod` 判定单只整体成功（所有所选周期均成功），失败原因按周期拼接；`buildBatchSummary()` 统计口径不变
- [x] 2.7 `performAutoDownload()` 调用改为传入 `[period]`，确认自动下载仍是「日线 → 周线 → 月线 × 逐只」的原有顺序，增量起点逻辑不变

## 3. 渲染进程数据与展示工具

- [x] 3.1 新增 `src/utils/klinePeriodSummary.ts`：`formatPeriodCounts(byPeriod)` 输出「日线 不复权 5 条 · 前复权 5 条；周线 失败：未获取到K线数据」形态文案，并对超长文本提供截断/完整文本两个返回值
- [x] 3.2 `src/stores/watchlist.ts`：`downloadKline()` 参数改为 `periods: KlinePeriod[]` 并透传 `periods`；`handleBatchProgress()` 适配 payload 的 `periods`（写入逐只状态用于展示）
- [x] 3.3 `src/views/WatchlistView.vue`：`handleKlineDownload()` / `handleBatchDownload()` 的 payload 类型与 store 调用改为 `periods`，单只成功 Toast 改用 `formatPeriodCounts()` 按周期展示

## 4. 弹窗交互改造

- [x] 4.1 `src/components/KlineDownloadDialog.vue`：周期单选组改为复选框组 + 「全选」复选框（含半选状态）与「已选 n / 共 3」提示，默认 `['d']`；`canSubmit` 增加「至少选择一个周期」，提交时按 `KLINE_PERIODS` 顺序过滤去重后发出 `periods`
- [x] 4.2 `src/components/KlineBatchDownloadDialog.vue`：周期控件同样改为复选框组 + 「全选」，打开时重置为 `['d']`；`canSubmit` 增加周期非空校验，提交 payload 改为 `periods`
- [x] 4.3 `src/components/KlineBatchDownloadDialog.vue`：逐只成功文案改用 `formatPeriodCounts()` 按周期展示各复权类型条数，失败文案带失败周期；行内单行省略、`title` 展示完整文案

## 5. 测试与验证

- [x] 5.1 新增 `tests/unit/klineMultiPeriodDownload.test.ts`：覆盖 `downloadPeriod` 判定口径、`downloadKline` 多周期聚合、`downloadWithRetry` 只重试失败周期、`buildBatchStockResult` 全周期成功判定
- [x] 5.2 更新 `tests/unit/ipcValidation.test.ts` 与 `tests/unit/ipcChannelContracts.test.ts`：`periods` 缺省、合法多元素、空数组、非法元素四类用例
- [x] 5.3 更新 `tests/unit/klineBatchDownload.test.ts` 等直接调用 `buildBatchStockResult` / `downloadBatch` 的用例，改为按 `byPeriod` 构造（自动下载路径使用 `[period]`）
- [x] 5.4 运行 `npm run typecheck`、`npm run lint`、`npm test`，修复全部告警与失败用例（本次改动文件 0 error；全量 62 文件 / 408 用例通过）
- [x] 5.5 手工验证：单只多周期下载 Toast 文案、批量全选周期逐只状态与汇总、下载中禁止关闭、自动下载日志仍为三周期逐个执行（用户已人工验证通过）
