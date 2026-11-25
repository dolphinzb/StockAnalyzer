## Why

自选股的两处手动下载入口（行内单只「下载K线」弹窗、右上角「下载K线」批量弹窗）目前对 K 线周期使用单选控件，用户想同时补齐日线、周线、月线时必须反复打开弹窗三次、重复选日期与复权类型，操作成本高且容易漏下载某个周期。

## What Changes

- 单只下载弹窗（`KlineDownloadDialog.vue`）的「周期」由单选（`radio`）改为多选（`checkbox`），并提供「全选」复选框（部分勾选显示半选状态）与已选数量提示；未选择任何周期时「确定」按钮禁用。
- 批量下载弹窗（`KlineBatchDownloadDialog.vue`）的「周期」同样改为多选 + 「全选」；逐只结果展示改为按周期分组（每个周期展示不复权/前复权条数，或该周期的失败原因）。
- 默认值保持不变：打开弹窗时只勾选「日线」，用户可手动勾选或点「全选」。**BREAKING**（内部 IPC 契约）：`kline:download` 与 `kline:download-batch` 入参的 `period: KlinePeriod` 单值字段替换为 `periods: KlinePeriod[]`；下载服务、结果类型、进度负载、`kline:updated` 广播同步改为数组口径。
- 下载执行顺序确定为：按股票顺序串行，单只股票内按周期顺序（日线 → 周线 → 月线）、周期内按复权类型串行，继续持有整批互斥锁。
- 单只股票的成败判定改为「按周期分别判定，所有所选周期都成功才计为成功」；失败原因按周期列出，避免某个周期静默失败被汇总掩盖。
- 每日 15:10 自动下载与启动补跑的内部调用改为传入单元素周期数组，行为与现状完全一致（不含多选语义）。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `kline-download`: 手动下载（单只/批量）的周期由「单选」改为「多选 + 全选」；相应更新周期参数透传契约（`periods` 数组）、逐只结果与进度的事件口径、单只股票按周期判定的成败规则。

## Impact

- 渲染进程：`src/components/KlineDownloadDialog.vue`、`src/components/KlineBatchDownloadDialog.vue`、`src/views/WatchlistView.vue`、`src/stores/watchlist.ts`
- 共享类型：`shared/types/index.ts`（`KlineDownloadInput`、`KlineBatchDownloadInput`、`KlineDownloadResult`、`KlineBatchStockResult`、`KlineBatchProgressPayload`）
- 主进程：`preload/index.ts`、`electron/index.ts`（`kline:download` 处理器）、`electron/ipcValidation.ts`（`klineDownloadBatch` schema）、`electron/services/klineDownloadService.ts`（`downloadKline`、`downloadWithRetry`、`downloadBatch`、`buildBatchStockResult`、`performAutoDownload`）
- 测试：`tests/unit/ipcValidation.test.ts`、`tests/unit/ipcChannelContracts.test.ts`、`tests/unit/klineIncrementalDownload.test.ts` 等涉及周期入参的用例
- 数据层（`kline_daily` / `kline_weekly` / `kline_monthly`）与 `saveKlineData` 无需改动
