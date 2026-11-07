## Why

当前自选股页面的手动下载K线数据只支持在操作列逐只股票触发，用户需要为每只关心的股票重复「点击下载 → 选日期 → 选复权 → 确定」四步操作，自选股较多时效率很低。系统其实已具备串行批量下载能力（每日 15:10 自动任务会遍历全部自选股下载当日K线），只是没有暴露给用户手动触发。将这一能力以「勾选多只股票」的方式开放出来，可在不新增下载管线的同时显著降低批量补数据的操作成本。

## What Changes

- 在自选股页面右上角按钮区域（刷新与「添加股票」之间）新增「下载K线」按钮，点击打开批量下载弹窗
- 新增批量下载弹窗：列出自选股全部股票并支持复选框勾选（含全选/取消全选、已选数量提示）；同时复用单只下载弹窗的日期范围选择与复权类型（不复权/前复权）控件
- 确认后保持弹窗打开，逐只展示下载状态（等待/下载中/成功条数/失败原因），全部完成后汇总成功与失败只数，用户手动关闭
- 主进程新增批量下载入口 `kline:download-batch`：校验参数与证券代码后，按自选股顺序串行逐只下载，每完成一只通过 `kline:batch-progress` 事件向渲染进程推送进度
- 抽取主进程批量下载函数，供手动批量下载与每日自动下载共用，避免重复实现串行下载、失败重试与统计逻辑
- 新增批量任务互斥保护：同一时刻只允许一个批量下载任务（手动或定时），避免并发请求数据源导致限流与数据错乱
- 批量下载中每只股票成功后沿用现有 `kline:updated` 广播，形态检测与K线图等消费方自动刷新

## Capabilities

### New Capabilities
<!-- 无新增能力：批量下载属于既有 kline-download 能力的扩展 -->

### Modified Capabilities
- `kline-download`: 新增自选股页面批量K线下载入口、批量下载弹窗与股票选择、批量参数校验、串行执行与逐只进度反馈、批量任务互斥、批量结果汇总等要求；原有单只手动下载与定时自动下载行为保持不变

## Impact

**受影响的文件**:
- `shared/types/index.ts` - 新增 `KlineBatchDownloadInput` / `KlineBatchStockResult` / `KlineBatchDownloadSummary` / `KlineBatchProgressPayload` 类型，扩展 `KlineAPI`
- `preload/index.ts` - 暴露 `downloadKlineBatch()` 与 `onBatchDownloadProgress()` 订阅
- `electron/services/klineDownloadService.ts` - 抽取 `downloadBatch()` 串行批量下载函数（含进度回调与失败重试），`performAutoDownload()` 改为复用之
- `electron/index.ts` - 注册 `kline:download-batch` IPC handler（参数校验 + 互斥保护）
- `src/stores/watchlist.ts` - 批量下载状态（逐只状态/汇总）与 `downloadKlineBatch()` action，订阅批量进度事件
- `src/components/KlineBatchDownloadDialog.vue` - 新增批量下载弹窗组件（股票勾选列表 + 日期范围 + 复权类型 + 逐只状态）
- `src/views/WatchlistView.vue` - 右上角「下载K线」按钮、弹窗挂载与下载触发
- `tests/unit/` - 批量下载编排逻辑（串行顺序、进度回调、部分失败汇总）单元测试

**API影响**:
- 新增 IPC 通道 `kline:download-batch`（invoke）与 `kline:batch-progress`（事件推送）
- 现有 `kline:download`、`kline:get-chart-data`、`kline:updated` 行为不变

**依赖影响**: 无新增依赖，复用现有 `stock-sdk`、`sql.js` 与 Electron IPC 机制

**用户体验影响**:
- 正面: 一次勾选即可批量下载多只股票历史K线，进度与失败原因可见
- 风险: 自选股较多且日期范围较长时下载耗时较长，需通过逐只进度与互斥保护避免用户误以为卡死或重复触发
