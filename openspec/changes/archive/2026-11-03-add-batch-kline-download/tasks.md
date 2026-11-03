## 1. 共享类型与接口契约

- [x] 1.1 在 `shared/types/index.ts` 中新增 `KlineBatchDownloadInput`（`stockCodes: string[]`、`startDate`、`endDate`、`adjustTypes?`）与 `KlineBatchStockResult`（`stockCode`、`stockName`、`success`、`unadjustedCount?`、`adjustedCount?`、`unadjustedError?`、`adjustedError?`、`error?`）
- [x] 1.2 在 `shared/types/index.ts` 中新增 `KlineBatchDownloadSummary`（`success`、`total`、`successCount`、`failedCount`、`results`、`error?`）与 `KlineBatchProgressPayload`（`phase: 'started' | 'completed'`、`index`、`total`、`stockCode`、`stockName?`、`result?`）
- [x] 1.3 扩展 `KlineAPI`：新增 `downloadKlineBatch(input): Promise<KlineBatchDownloadSummary>` 与 `onBatchDownloadProgress(callback): () => void`

## 2. 主进程批量下载服务

- [x] 2.1 在 `electron/services/klineDownloadService.ts` 中抽取 `validateDateRange(startDate, endDate)` 纯函数，`validateDownloadInput()` 改为复用之（单只下载行为不变）
- [x] 2.2 为 `downloadWithRetry()` 增加可选 `adjustTypes?: ('' | 'qfq')[]` 参数并透传给 `downloadKline()`（不传时保持默认双复权）
- [x] 2.3 新增纯函数 `buildBatchStockResult(downloadResult, stockCode, stockName, adjustTypes)`：按「所选复权类型中至少一种条数 > 0」判定成功，全为 0 时标记失败并给出「未获取到K线数据」，保留各复权类型条数与错误
- [x] 2.4 新增纯函数 `buildBatchSummary(results)`：计算 `total` / `successCount` / `failedCount`，`success` 为 `failedCount === 0`
- [x] 2.5 新增导出函数 `downloadBatch(stocks, startDate, endDate, adjustTypes, options?)`：整批预校验（日期、复权类型非空、逐只证券代码）→ 按顺序串行下载（`options.retry` 为真时用 `downloadWithRetry`）→ 每只开始/完成时调用 `options.onProgress` → 返回 `KlineBatchDownloadSummary`
- [x] 2.6 在 `klineDownloadService.ts` 中增加模块级互斥标志：`downloadBatch` 入口若已存在进行中的批量任务则抛出 `BATCH_DOWNLOAD_IN_PROGRESS: 已有批量下载任务正在进行中`，`try/finally` 中复位
- [x] 2.7 重构 `performAutoDownload()` 复用 `downloadBatch()`（当日、双复权、`retry: true`），保留原有汇总日志结构（总数、不复权/前复权成功失败数、失败明细），捕获互斥错误时记录「跳过本次自动下载」

## 3. IPC 与 preload

- [x] 3.1 在 `electron/index.ts` 中注册 `kline:download-batch` handler：调用 `downloadBatch()`，`onProgress` 中通过 `getMainWindow()` 的 `isDestroyed()` 守卫向渲染进程发送 `kline:batch-progress`；参数/互斥错误返回 `{ success: false, total: 0, successCount: 0, failedCount: 0, results: [], error }`
- [x] 3.2 在 `preload/index.ts` 的 `klineAPI` 中暴露 `downloadKlineBatch(input)`（`ipcRenderer.invoke('kline:download-batch', input)`）与 `onBatchDownloadProgress(callback)`（监听 `kline:batch-progress`，返回取消订阅函数）

## 4. 渲染层状态（Pinia store）

- [x] 4.1 在 `src/stores/watchlist.ts` 中新增 `batchDownloadState`：`{ isRunning, total, completed, items: Map<stockCode, { status: 'pending' | 'downloading' | 'success' | 'failed', result?, error? }>, summary }`，并导出 `isBatchDownloading` 计算属性
- [x] 4.2 实现 `downloadKlineBatch(input)`：初始化 items 为全部 `pending` 并置 `isRunning`，调用 `window.klineAPI.downloadKlineBatch()`，结束后用返回的 `summary.results` 覆盖 items（兜底事件丢失），设置 `isRunning=false` 并返回 summary
- [x] 4.3 实现 `handleBatchProgress(payload)`：`started` 时将该股票置为 `downloading` 并同步 `downloadStatusMap`（行内按钮显示「下载中」），`completed` 时置成功/失败并累计 `completed`
- [x] 4.4 在 `setupEventListeners()` 中订阅 `onBatchDownloadProgress`，并将取消订阅纳入返回的清理函数

## 5. 批量下载弹窗与页面入口

- [x] 5.1 新建 `src/components/KlineBatchDownloadDialog.vue`：基于 `Modal`（运行中 `closeOnOverlayClick=false`），props 为 `modelValue`、`stocks`、`state`，emits 为 `update:modelValue`、`download`
- [x] 5.2 实现股票勾选列表：代码+名称+复选框、「全选」半选状态、「已选 n / 共 m」、默认全部勾选；未勾选任何股票时「确定」禁用
- [x] 5.3 复用 `DateRangePicker` 与复权类型复选框，默认当日与双复权，校验规则与 `KlineDownloadDialog` 一致（开始不晚于结束、结束不晚于当日、至少一种复权）
- [x] 5.4 实现逐只状态列：等待 / 下载中 / 成功（不复权 N 条，前复权 M 条）/ 失败原因；运行中「确定」显示 `下载中…(k/N)` 并禁用、「取消」禁用，完成后显示「成功 x 只，失败 y 只」并恢复可关闭
- [x] 5.5 在 `src/views/WatchlistView.vue` 头部按钮区（刷新与「添加股票」之间）新增「下载K线」按钮：自选股为空或批量下载进行中时禁用；点击打开弹窗
- [x] 5.6 在 `WatchlistView.vue` 中挂载弹窗并处理 `download` 事件：调用 `store.downloadKlineBatch()`，完成后用 Toast 汇总提示（全部成功为 success，部分/全部失败为 error 并保留弹窗内逐只原因）

## 6. 单元测试

- [x] 6.1 新建 `tests/unit/klineBatchDownload.test.ts`：覆盖 `buildBatchStockResult()`（条数 > 0 成功、全 0 失败、部分复权失败、错误原因透传）
- [x] 6.2 覆盖 `buildBatchSummary()`（全部成功、部分失败、全部失败、空结果）与批量参数校验（日期非法、复权类型为空、含非法证券代码整批拒绝）

## 7. 质量门禁与手动验证

- [x] 7.1 运行 `npm run typecheck` 通过
- [x] 7.2 运行 `npm run lint` 通过（改动文件零新增问题）
- [x] 7.3 运行 `npm test` 确认无新增失败（存量失败需与改动前基线一致）
- [x] 7.4 手动验证：打开弹窗默认全选、全选/取消全选与数量提示正确
- [x] 7.5 手动验证：勾选 2 只股票 + 最近 10 天 + 双复权，确认逐只状态依次流转且汇总正确，完成后K线图数据已更新
- [x] 7.6 手动验证：取消全部勾选、结束日期设为明天、取消全部复权类型时「确定」均不可用
- [x] 7.7 手动验证：下载中点击取消/关闭/遮罩无法关闭弹窗；批量进行中右上角「下载K线」按钮禁用
- [x] 7.8 手动验证：构造一只下载失败的自选股（如已退市代码），确认重试 1 次后显示失败原因且其余股票继续下载
