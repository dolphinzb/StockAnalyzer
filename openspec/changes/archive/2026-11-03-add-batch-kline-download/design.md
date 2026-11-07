## Context

当前K线下载能力由 `electron/services/klineDownloadService.ts` 提供，两条使用路径共享同一套下载实现：

- **手动单只下载**：`WatchlistView` 行内「下载K线」按钮 → `KlineDownloadDialog`（`DateRangePicker` + 复权类型）→ `store.downloadKline()` → IPC `kline:download` → `validateDownloadInput()` + `downloadKline()`（逐复权类型调用 stock-sdk，`saveKlineData()` 落库，成功后广播 `kline:updated`）
- **定时自动下载**：`startKlineDownloadScheduler()` 每日 15:10 触发 `performAutoDownload()` → 交易日判断 → `getWatchlist()` 取全部自选股 → **串行** `downloadWithRetry()`（失败重试1次）→ 按复权类型统计成功/失败并写日志

即"批量串行下载 + 重试 + 统计"能力已存在，但被写死在 `performAutoDownload()` 内部，无法被用户手动触发；UI 侧也没有多选入口。渲染进程侧 `store.downloadStatusMap` 已支持按股票代码标记"下载中"状态（`StockItem` 的按钮文案），`kline:updated` 事件已被形态检测（`patternScan`）与K线图消费。

**技术约束**:
- Electron 三进程模型：渲染进程通过 preload 的 `contextBridge` 暴露的 `window.klineAPI` 调用主进程，不可直接访问 Node/DB
- 下载只能走主进程：`stock-sdk` 调用与 `sql.js` 写库都在主进程
- 数据源存在限流风险，现有实现全部为串行请求，无并发下载
- 弹窗基础组件 `Modal.vue`（含 `closeOnOverlayClick`）、日期组件 `DateRangePicker.vue`、Toast（`useToast`）均已存在
- 类型集中在 `shared/types/index.ts`，`KlineAPI` 与全局 `Window` 扩展已在该文件声明；preload 需同步暴露新方法
- 质量门禁：`npm run typecheck`、`npm run lint`、`npm test`

**相关代码**:
- `electron/services/klineDownloadService.ts` - 下载与调度核心（本次主要改动）
- `electron/index.ts` - IPC 注册（`kline:download` 附近）
- `preload/index.ts` - `klineAPI` 暴露（第 291-306 行）
- `src/stores/watchlist.ts` - `downloadStatusMap` / `downloadKline()` / `setupEventListeners()`
- `src/views/WatchlistView.vue` - 页面头部按钮区与弹窗挂载
- `src/components/KlineDownloadDialog.vue` - 单只下载弹窗（参数校验与样式可复用）

## Goals / Non-Goals

**Goals:**
1. 自选股页面右上角新增「下载K线」按钮，打开批量下载弹窗
2. 弹窗列出全部自选股并支持多选（全选/取消全选、已选数量、默认全选），同时提供日期范围与复权类型选择（校验规则与单只下载一致）
3. 确认后弹窗保持打开，逐只显示 等待 / 下载中 / 成功（各复权类型条数）/ 失败原因，完成后展示成功与失败只数汇总
4. 主进程提供批量下载函数，串行执行、复用失败重试1次策略，并被每日自动下载复用（单一实现）
5. 通过 `kline:batch-progress` 事件向渲染进程推送逐只进度；每只股票成功后沿用现有 `kline:updated` 广播
6. 批量任务互斥：手动批量与定时自动下载同一时刻只允许一个在跑，避免并发请求与重复写库
7. 批量下载部分失败不影响其余股票，失败原因逐只可见、可重试

**Non-Goals:**
1. 不实现并发/多线程下载（保持串行，规避数据源限流）
2. 不实现下载任务取消、暂停/恢复（关闭弹窗即结束本轮交互，任务在后台跑完）
3. 不修改单只下载弹窗与行内下载按钮的行为
4. 不新增下载进度持久化（不写数据库任务表，进度仅存于内存）
5. 不扩展数据源或新增复权类型（仍为 `''` 不复权 / `'qfq'` 前复权）
6. 不重构 `saveKlineData` 与 K线表结构

## Decisions

### Decision 1: 新增独立弹窗组件 `KlineBatchDownloadDialog.vue`，不改造单只下载弹窗

**选择**: 新建批量下载弹窗组件，复用 `Modal`、`DateRangePicker` 与单只弹窗的复权类型控件样式；`KlineDownloadDialog.vue` 保持原样。

**Rationale**:
- **方案A（采用）**: 独立组件
  - ✅ 单只/批量两套 props 与事件结构差异大（单只传 `stockCode/stockName`，批量传 `stocks[]` 与逐只状态），独立组件避免大量 `v-if` 分支
  - ✅ 单只下载路径零回归风险
  - ❌ 日期范围与复权类型控件代码有少量重复（约 40 行模板与校验逻辑），可后续再抽公共子组件
- **方案B**: 给 `KlineDownloadDialog` 增加 `mode: 'single' | 'batch'` prop
  - ✅ 参数控件不重复
  - ❌ 弹窗需同时承载"单股票信息条"与"股票勾选列表 + 逐只状态表"，模板与状态机混合，可读性差；单只下载回归风险变高

**决策**: 采用方案A。批量弹窗内部维护勾选集合、日期范围、复权类型与校验错误；逐只下载状态由父组件传入的 props 驱动（弹窗保持"哑组件"）。

### Decision 2: 主进程抽取 `downloadBatch()`，手动批量与自动任务共用

**选择**: 在 `klineDownloadService.ts` 新增导出函数：

```ts
downloadBatch(
  stocks: { stockCode: string; stockName: string }[],
  startDate: string,
  endDate: string,
  adjustTypes: ('' | 'qfq')[],
  options?: { retry?: boolean; onProgress?: (payload: KlineBatchProgressPayload) => void }
): Promise<KlineBatchDownloadSummary>
```

内部按数组顺序串行执行：`onProgress({ phase: 'started', index, total, stockCode })` → `downloadKline()`（`retry` 为 true 时改用 `downloadWithRetry()`）→ `onProgress({ phase: 'completed', index, total, stockCode, result })`。`performAutoDownload()` 改为调用该函数（`retry: true`，`onProgress` 留空，仅用返回结果写日志统计）。

**Rationale**:
- **方案A（采用）**: 主进程批量函数
  - ✅ 串行、重试、单只成功判定、结果汇总只有一份实现，自动任务与手动批量行为天然一致（用户要求的"复用已有能力"）
  - ✅ 互斥保护可集中在一处（主进程单例标志），避免渲染层误开多份批量
  - ✅ 渲染进程只需一次 IPC 调用 + 事件订阅，无需自己编排 N 次请求与中断处理
  - ❌ `performAutoDownload` 需小幅重构（统计改为从返回结果派生），回归面略增
- **方案B**: 渲染进程循环调用现有 `klineAPI.downloadKline`
  - ✅ 主进程零改动，逐只状态直接由返回值驱动
  - ❌ 批量编排（顺序、重试、汇总）落在 store 中，与自动任务实现重复；窗口刷新/关闭时渲染进程的中断会打断批次；无法在主进程层面与定时任务互斥

**决策**: 采用方案A。`downloadWithRetry()` 增加可选 `adjustTypes` 参数以便复用（不传时沿用现有默认双复权）。

### Decision 3: 逐只进度通过 `kline:batch-progress` 事件推送

**选择**: 主进程在每只股票开始与完成时，向主窗口 `webContents.send('kline:batch-progress', payload)`：

```ts
interface KlineBatchProgressPayload {
  phase: 'started' | 'completed';
  index: number;          // 1-based，当前是第几只
  total: number;
  stockCode: string;
  stockName?: string;
  result?: KlineBatchStockResult;  // phase === 'completed' 时提供
}
```

渲染进程在 `store.setupEventListeners()` 中订阅（与 `prices:update` / `index:update` 同一模式），`destroy/unmount` 时取消订阅。`started` 用于把该股票置为"下载中"，`completed` 用于置为成功/失败并累计完成数。

**Rationale**:
- 单次 IPC `invoke` 只在整批结束时返回，无法满足"逐只显示状态"；事件是 Electron 既有模式（`kline:updated` 已这样做）
- 备选轮询主进程状态（`kline:batch-status` 定时拉取）会产生无用 IPC 且时序粗糙，否决
- 重试不额外发事件：`started` 只在首次尝试前发一次，避免重试导致状态回跳闪烁；失败重试后的最终结果由 `completed` 一次性给出

### Decision 4: 任务互斥 —— 主进程单例标志

**选择**: 服务模块内维护 `let batchDownloading = false`；`downloadBatch()` 入口若发现为 true 立即抛出 `BATCH_DOWNLOAD_IN_PROGRESS: 已有批量下载任务正在进行中`，`try/finally` 中复位。IPC 捕获后返回 `{ success: false, total: 0, successCount: 0, failedCount: 0, results: [], error: '已有批量下载任务正在进行中，请稍后再试' }`。`performAutoDownload()` 捕获该错误并记日志跳过本次自动下载。

**Rationale**:
- 数据源限流与小内存环境下并发写 `sql.js` 都存在风险，串行是既有策略
- 前端按钮在批量进行中禁用只是 UX 兜底，真正的互斥必须在主进程（定时任务与手动任务可能同时到达）
- 备选：主进程队列串行排队执行 —— 用户体验上"点了没反应"，且排队批次可能使用过期日期参数，否决

### Decision 5: 单只成功判定沿用自动下载口径（按条数，而非仅"接口未抛错"）

**选择**: 单只股票的 `KlineBatchStockResult.success` 判定为：所选复权类型中**至少一种**返回条数 `> 0`；若接口未抛错但条数为 0（如区间内无交易日、代码停牌），标记失败，`error` 取 `未获取到K线数据`（保留各复权类型的 `unadjustedError/adjustedError`）。整批 `summary.success` 为 `failedCount === 0`。

**Rationale**:
- `downloadKline()` 的 `success` 语义是"至少一种复权类型调用未抛错"，条数为 0 时仍为 true，但用户视角"下载成功 0 条"等同于失败，且与 `performAutoDownload` 既有统计口径（`count > 0` 才计成功）不一致
- 备选：直接沿用 `downloadKline().success` —— 会导致弹窗显示绿色"成功"却无数据，误导用户

### Decision 6: 参数校验 —— 先整批预校验，任一非法则整批不启动

**选择**: 抽取 `validateDateRange(startDate, endDate)` 纯函数（原 `validateDownloadInput` 中的日期校验逻辑），批量入口先校验日期范围与"至少选择一种复权类型"，再逐只校验证券代码（复用 `isValidSecurityCode`）；任一股票代码非法 → 整批不发起任何下载，返回 `error` 说明第一处非法代码。单只路径的 `validateDownloadInput()` 改为调用同一日期校验函数，行为不变。

**Rationale**:
- 自选股在新增时已做代码校验，正常情况下不会出现非法代码；一旦出现，说明数据被外部修改，整批拒绝比"悄悄跳过"更易发现问题
- 备选：跳过非法代码继续下载其余股票 —— 用户难以察觉哪只被跳过，且需额外返回"跳过列表"，复杂度不划算

### Decision 7: 弹窗交互 —— 默认全选、运行中锁定关闭、结束后手动关闭

**选择**:
- 打开弹窗时：勾选集合初始化为全部自选股，日期范围默认当日（与单只弹窗一致），复权类型默认 `['', 'qfq']`，逐只状态清空
- 顶部提供"全选"复选框（部分勾选时显示 indeterminate），并展示"已选 n / 共 m"
- 未勾选任何股票或日期/复权校验不通过时「确定」禁用
- 下载中：「确定」变为"下载中…(k/N)"且禁用；「取消」禁用；遮罩点击与右上角关闭不生效（`Modal` 的 `closeOnOverlayClick=false` 且关闭按钮在运行中拦截），避免用户误以为任务已中止
- 全部完成后：底部显示"成功 x 只，失败 y 只"，「取消」恢复为"关闭"，用户手动关闭
- 关闭弹窗后再次打开会重置选择与状态

**Rationale**:
- 默认全选贴合"批量补当日K线"的主场景；如需补历史可选择日期范围后再取消个别勾选
- 运行中锁定关闭避免"关了以为停了"的认知落差（任务实际在主进程继续跑）；不实现取消是本次 Non-goal
- 逐只状态行内展示可定位到具体失败股票，优于只给一条汇总 Toast

### Decision 8: 渲染层状态归属 store，弹窗只负责展示

**选择**: `src/stores/watchlist.ts` 新增：

```ts
batchDownloadState = ref<{
  isRunning: boolean;
  total: number;
  completed: number;
  items: Map<string, BatchItemState>;  // stockCode -> { status, result?, error? }
  summary?: KlineBatchDownloadSummary | null;
}>(...)
```

并提供 `downloadKlineBatch(input)`（置 all items 为 pending → 调用 `window.klineAPI.downloadKlineBatch` → 写入 summary）与 `handleBatchProgress(payload)`（按 `phase` 更新 items）。`setupEventListeners()` 增加 `onBatchDownloadProgress` 订阅并纳入返回的清理函数。`WatchlistView` 把 `batchDownloadState` 作为 prop 传给弹窗，弹窗仅触发 `download` 事件。

**Rationale**:
- 与现有 `downloadStatusMap`、`setupEventListeners` 模式一致；批量状态在切页/弹窗重开时仍可复用
- 同时按股票代码写入 `downloadStatusMap`（`isDownloading`），使自选股列表行内按钮同步显示"下载中"，复用 `StockItem` 既有渲染逻辑
- 备选：状态放弹窗组件内部 —— 弹窗卸载后进度丢失，与"主进程仍在下载"的事实不符

## Risks / Trade-offs

### Risk 1: `performAutoDownload` 重构导致定时任务统计回归

**风险**: 改为复用 `downloadBatch()` 后，按复权类型的成功/失败计数与日志格式需从返回结果重新派生，可能出现漏计。
**缓解**:
- `downloadBatch` 的内部执行顺序与原循环逐字等价（同一 `downloadWithRetry`、同一成功判定）
- `performAutoDownload` 保留原有日志文案结构（总数、不复权/前复权成功失败数、失败明细），仅数据来源改为 `results`
- 单元测试覆盖结果汇总（部分失败、0 条、全部失败）

### Risk 2: 大量自选股 + 长日期范围导致下载耗时过长

**风险**: 串行下载 N 只 × 2 种复权 × 重试，可能持续数分钟，用户可能重复点击或强行关闭。
**缓解**:
- 事件驱动逐只进度 + "下载中 (k/N)" 文案，让等待可见
- 主进程互斥拒绝重复批次，前端按钮禁用
- 首次尝试前对整批做参数校验，避免跑一半才因参数错误失败
- 单只数据落库独立，中途关闭应用只丢失未完成的股票，可再次批量补齐

### Risk 3: 主窗口关闭/销毁时进度事件发送失败

**风险**: 用户在下载中关闭主窗口（应用可能仍在托盘），`webContents.send` 目标消失。
**缓解**:
- 复用 `getMainWindow()` 的 `windows.length` 与 `isDestroyed()` 守卫（与 `kline:updated` 广播一致）
- 事件发送失败不影响下载与落库；重新打开窗口后数据已写入数据库，K线图可直接读取

### Risk 4: 进度事件与 store 状态不同步（事件丢失）

**风险**: 渲染进程订阅晚于主进程开始推送（用户在弹窗打开前无订阅；实际订阅在 App 启动时已建立），或事件乱序导致状态卡在"下载中"。
**缓解**:
- 订阅在应用启动时建立一次（`App.vue` → `store.setupEventListeners()`），早于任何用户触发
- `downloadKlineBatch()` 的 Promise 返回值作为最终事实来源：结束后用 `summary.results` 覆盖 items 状态，事件只用于过程中的即时反馈
- 结束后强制 `isRunning = false`

### Trade-off: 不做取消

**权衡**: 用户无法中止正在进行的批量下载。
**理由**: 取消需中断 stock-sdk 请求并处理半写状态，本次以进度可见 + 互斥保护替代；后续如有需要可独立提出 change。

## Migration Plan

**部署步骤**:
1. `shared/types/index.ts`: 新增 `KlineBatchDownloadInput` / `KlineBatchStockResult` / `KlineBatchDownloadSummary` / `KlineBatchProgressPayload`，扩展 `KlineAPI`（`downloadKlineBatch`、`onBatchDownloadProgress`）
2. `electron/services/klineDownloadService.ts`: 抽取 `validateDateRange()`；`downloadWithRetry()` 支持 `adjustTypes`；新增 `downloadBatch()` 与互斥标志；`performAutoDownload()` 改为复用并保留日志统计
3. `electron/index.ts`: 注册 `kline:download-batch`（校验 → 互斥 → 带 `onProgress` 广播的 `downloadBatch`）
4. `preload/index.ts`: 暴露 `downloadKlineBatch()` 与 `onBatchDownloadProgress()`（返回取消订阅函数）
5. `src/stores/watchlist.ts`: 批量状态、`downloadKlineBatch()`、`handleBatchProgress()`、事件订阅与清理
6. `src/components/KlineBatchDownloadDialog.vue`: 新建弹窗（勾选列表 + 全选 + 日期范围 + 复权类型 + 逐只状态 + 汇总）
7. `src/views/WatchlistView.vue`: 头部按钮区新增「下载K线」按钮（自选股为空或批量运行中禁用），挂载弹窗并转发 `download` 事件
8. `tests/unit/klineBatchDownload.test.ts`: 覆盖参数校验与结果汇总
9. 运行 `npm run typecheck`、`npm run lint`、`npm test`；开发环境手动验证

**回滚策略**:
- 变更完全增量（新增 IPC/类型/组件/按钮），无数据库结构变更与数据迁移
- 回滚即还原上述文件；已下载的K线数据仍有效（与单只下载写库路径一致）

## Open Questions

**无** —— 交互已与用户确认（弹窗含日期范围与复权类型；弹窗内逐只显示状态），可直接进入实现阶段。
