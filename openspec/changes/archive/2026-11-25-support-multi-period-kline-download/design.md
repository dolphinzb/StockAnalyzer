## Context

当前手动 K 线下载有两条入口，二者共享同一套下载链路，周期参数在整条链路上都是**单值**：

- **单只下载**：`StockItem` 行内「下载K线」→ `KlineDownloadDialog.vue`（`DateRangePicker` + 周期单选 + 复权类型复选）→ `WatchlistView.handleKlineDownload()` → `store.downloadKline()` → preload `window.klineAPI.downloadKline()` → IPC `kline:download` → `assertKlinePeriod()` + `validateDownloadInput()` + `downloadKline()` → 逐复权类型调用 `sdk.getHistoryKline({ period })` → `saveKlineData(stockCode, klines, adjust, period)` → 成功后广播 `kline:updated`
- **批量下载**：右上角「下载K线」→ `KlineBatchDownloadDialog.vue`（股票多选 + 日期 + 周期单选 + 复权复选）→ `store.downloadKlineBatch()` → IPC `kline:download-batch`（经 `ipcValidation.ts` 的 `SCHEMAS.klineDownloadBatch` 校验）→ `downloadBatch()` 串行逐只 `downloadKline()` → `kline:batch-progress` 推送逐只进度 → 汇总 `KlineBatchDownloadSummary`

**关键约束**：

- Electron 三进程模型：渲染进程只能经 preload `contextBridge` 暴露的 `KlineAPI` 访问主进程；`stock-sdk` 调用与 `sql.js` 写库都在主进程。
- 数据源存在限流风险，现有实现全部串行；`batchDownloading` 单例标志保证同一时刻只有一个批量任务（手动批量与每日 15:10 自动下载共享）。
- 自动下载（`performAutoDownload`）本身已按「日线 → 周线 → 月线」逐周期调用 `downloadBatch()`，周期参数天然是"一次一个"；多选改造后该路径行为必须保持不变。
- `kline:updated` 事件的 `periods: KlinePeriod[]` 已是数组形态，多周期下载可直接复用，消费方（`KlineChartDialog`、`patternScan`）无需改动。
- 结果展示只有两处消费条数：`WatchlistView.handleKlineDownload()` 的 Toast 与 `KlineBatchDownloadDialog.buildCountParts()` 的逐只状态文案。
- 质量门禁：`npm run typecheck`、`npm run lint`、`npm test`。

**涉及代码**：

- `src/components/KlineDownloadDialog.vue` / `src/components/KlineBatchDownloadDialog.vue`
- `src/views/WatchlistView.vue`、`src/stores/watchlist.ts`
- `shared/types/index.ts`、`preload/index.ts`
- `electron/index.ts`、`electron/ipcValidation.ts`、`electron/services/klineDownloadService.ts`
- `tests/unit/ipcValidation.test.ts`、`tests/unit/ipcChannelContracts.test.ts`、`tests/unit/klineIncrementalDownload.test.ts`

## Goals / Non-Goals

**Goals:**

1. 单只下载弹窗与批量下载弹窗的周期控件改为复选框多选，提供「全选」复选框（部分勾选显示半选）与已选数量提示，未选中任何周期时禁止提交。
2. 默认勾选「日线」，保持与现状一致的单周期默认行为；用户可手动增选或一键「全选」。
3. 周期参数在整条链路上改为数组（`periods: KlinePeriod[]`），执行顺序固定为「股票顺序 → 周期顺序（日→周→月）→ 复权类型顺序」全串行。
4. 单只结果按周期拆分，逐只状态与 Toast 能展示每个周期的下载条数或失败原因；单只股票的成功判定为「所有所选周期均成功」。
5. 自动下载路径按 `periods: [period]` 调用，行为与现状一致。

**Non-Goals:**

1. 不实现并发下载、不改变整批互斥语义（多周期不增加并发度，只增加串行请求数）。
2. 不改变日期范围默认值（仍为当日），不为周线/月线自动扩日期或回退周期。
3. 不改变图表展示口径：`kline:get-chart-data` / `getChartData()` 仍为单周期。
4. 不新增周期级子进度事件（进度仍按股票粒度推送），不改 `kline:batch-progress` 的状态机。
5. 不改造 `saveKlineData` 与三张 K 线表结构，不做数据迁移。
6. 不做 `period`（旧单值字段）与 `periods` 的长期双轨兼容。

## Decisions

### Decision 1: 周期控件为「复选框组 + 全选 + 已选数量」，默认仅日线

**选择**：把两个弹窗中的 `.radio-group`（`v-for="p in KLINE_PERIODS"` + `type="radio"`）替换为 `.checkbox-group`，每个周期一个 `checkbox` 绑定 `periods: KlinePeriod[]`；上方与复权类型控件并列的「全选」复选框 (`:checked="allPeriodsSelected"` / `:indeterminate.prop="partiallySelected"`) 在「全选三周期」与「清空」之间切换；控件下方展示「已选 n / 共 3」。打开弹窗时 `periods = ['d']`。

**Rationale**：

- 复用弹窗内既有的「股票全选」交互模式（`KlineBatchDownloadDialog` 的 `.stock-select-header`），用户无需学习新范式。
- 多选周期时 3 个选项全不选是合法中间态，因此 `canSubmit` 增加「至少选择一个周期」，点击「确定」时提示「请至少选择一个周期」（与复权类型校验文案同构）。
- **默认不全选**：默认从 1 个周期变 3 个周期会让所有用户的首屏下载请求数与耗时静默×3；保持「日线」默认既符合现状，也让"想看多周期"的人显式操作。备选「默认全选」会让批量弹窗在默认参数下对每只股票发起 6 次请求，与"轻量手动补数"的直觉冲突，否决。
- 提交前按 `KLINE_PERIODS` 的固定顺序过滤/去重，保证执行顺序与界面展示顺序一致（不依赖用户点击顺序）。

### Decision 2: IPC 契约以 `periods: KlinePeriod[]` 替换 `period`，入口做白名单校验

**选择**：

```ts
// shared/types
export interface KlineDownloadInput {
  stockCode: string;
  startDate: string;
  endDate: string;
  adjustTypes?: ('' | 'qfq')[];
  periods?: KlinePeriod[];   // 缺省 ['d']；非空；元素 ∈ {d,w,m}
}
export interface KlineBatchDownloadInput {
  stockCodes: string[];
  startDate: string;
  endDate: string;
  adjustTypes?: ('' | 'qfq')[];
  periods?: KlinePeriod[];   // 同上
}
```

- `electron/ipcValidation.ts` 的 `SCHEMAS.klineDownloadBatch` 增加
  `periods: v.optional(v.arrayOf('input.periods', v.enumOf('periods[]', KLINE_PERIODS), { minLength: 1, maxLength: 3 }), undefined)`。
- `electron/index.ts` 把 `assertKlinePeriod()` 扩展为 `assertKlinePeriods(value)`：`undefined` → `['d']`；空数组、非数组、含非 `d|w|m` 元素 → 抛 `INVALID_PERIOD`（空数组代表「未选周期」，不静默兜底）；合法输入按 `['d','w','m']` 固定顺序规范化并去重。
- 旧字段 `period` 直接下线（不双读）。由于 preload、渲染进程、主进程随应用一起打包发布，不存在外部调用方；类型改动会让残留调用点在 `npm run typecheck` 阶段立即暴露。

**Rationale**：

- 数组是唯一能表达"多选"的形态，且 `kline:updated.periods` 已是数组，事件侧零改动。
- 校验放在主进程入口（`assertKlinePeriods` + `ipcValidation`）而非只依赖前端，符合 `ipc-input-validation` 规格的既有约束。
- **不做双轨兼容**：同时接受 `period` 与 `periods` 会让"到底按哪个执行"出现歧义，且这个 IPC 通道没有第三方消费者。备选「保留 `period` 并把 `periods` 作为覆盖字段」纯属历史包袱，否决。

### Decision 3: 服务层按「股票 → 周期 → 复权类型」三级串行，重试下沉到周期粒度

**选择**：

```ts
type KlineDownloadPeriodResult = {
  period: KlinePeriod;
  success: boolean;
  unadjustedCount?: number;
  adjustedCount?: number;
  unadjustedError?: string;
  adjustedError?: string;
  error?: string;
};

downloadKline(stockCode, startDate, endDate, adjustTypes, periods: KlinePeriod[] = ['d']): Promise<KlineDownloadResult>
downloadWithRetry(stockCode, startDate, endDate, adjustTypes, periods: KlinePeriod[] = ['d']): Promise<KlineDownloadResult>
downloadBatch(stocks, startDate, endDate, adjustTypes, periods: KlinePeriod[] = ['d'], options): Promise<KlineBatchDownloadSummary>
```

`downloadKline()` 内部对 `periods` 逐个调用新增的 `downloadPeriod()`（周期内仍按 `adjustTypes` 顺序调用 `downloadSingleAdjust()`），把每个周期的结果收进 `byPeriod`；`downloadWithRetry()` 改为**只对失败的周期重试 1 次**，已成功周期不重复请求。

**Rationale**：

- 三级顺序与自动下载现有的「周期外层、股票内层」不冲突：批量任务对每只股票跑完 3 个周期再换下一只，靠 `batchDownloading` 互斥保持全局串行，限流风险与现状同级（只是请求数变多）。
- 周期级重试避免"日线已成功、周线失败 → 整只重下（日线重复请求 + 重复 UPSERT）"，也让失败原因归属更清晰。
- **备选**：保留整只重试（实现更省事）——会产生无意义重复请求，日志与耗时都被放大，否决。
- **备选**：把周期放到股票外层（先跑完所有股票的日线，再跑周线）——进度语义会变成"逐只完成"不再成立，弹窗逐只状态无法表达，否决。

### Decision 4: 结果模型按周期拆分，顶层聚合字段保留为"合计"

**选择**：

- `KlineDownloadResult` 新增 `periods?: KlinePeriod[]` 与 `byPeriod?: KlineDownloadPeriodResult[]`；原有 `unadjustedCount` / `adjustedCount` / `unadjustedError` / `adjustedError` / `error` 保留，语义改为**所有所选周期的合计**（条数求和，错误按周期前缀拼接）。
- `KlineBatchStockResult` 同样新增 `periods?: KlinePeriod[]` 与 `byPeriod?: KlineDownloadPeriodResult[]`；`period?: KlinePeriod` 保留为"本次任务周期的回显"字段以便旧数据/日志阅读，不再参与判定。
- `KlineBatchProgressPayload.period?: KlinePeriod` 替换为 `periods: KlinePeriod[]`。

**Rationale**：

- 顶层字段被 `WatchlistView` Toast 与批量弹窗逐只文案消费，直接删除会把"聚合数字 + 明细"两件事混在一次重构里；保留合计、以 `byPeriod` 为准，改动面更小且向下兼容。
- 文案实现集中在纯函数 `formatPeriodCounts()`（推荐放在 `src/utils/klinePeriodSummary.ts`，单测友好）：成功形如 `日线 不复权 5 条 · 前复权 5 条；周线 不复权 1 条 · 前复权 1 条`，失败时该周期替换为 `周线 失败：未获取到K线数据`。
- 逐只状态文案过长时用 `title` 展示完整文本，行内保持单行省略（沿用现有 `.stock-status` 的 `ellipsis` 样式）。

### Decision 5: 成功判定按周期，股票级"全周期成功才算成功"

**选择**：

- 周期级：该周期所选复权类型中**至少一种**返回条数 > 0 → 该周期成功（沿用现状口径）。
- 股票级：所有所选周期都成功 → `success: true`；任一周期失败 → `success: false`，`error` 为失败周期的原因拼接（如 `周线: 未获取到K线数据`）。
- 汇总 `KlineBatchDownloadSummary` 的 `successCount` / `failedCount` 仍按股票粒度统计；逐只结果里的 `byPeriod` 说明是哪个周期拖累了该股。

**Rationale**：

- 若改为"任一周期成功即算成功"，用户看到"成功"却可能缺了周线数据，而周线缺失的后果（形态检测、图表空窗）不会立刻可见，属于静默失败。
- 现状中"当日无数据的周线/月线"在正常交易日通常仍能拿到当前未完成周期的 1 条记录，严格判定不会造成大面积误报；极端情况（停牌、非交易日手动下载）失败原因明确可见，属可接受取舍。

### Decision 6: 进度事件仍按股票粒度，`kline:updated` 携带完整周期数组

**选择**：`kline:batch-progress` 的 `started` / `completed` 仍每只股票各发一次，只把 payload 里的 `period` 换成 `periods: KlinePeriod[]`（该股票本次要跑的周期集合）；`downloadKline()` 成功后广播 `kline:updated` 时 `periods` 直接使用本次实际下载的周期数组（此前恒为单元素）。

**Rationale**：

- 周期级子进度需要给 `BatchDownloadState` 增加"当前周期"维度并处理周期失败回滚，收益只是"下载中…"旁边多一行文字，与复杂度不成比例；逐只行内已有 spinner + 「下载中…」。
- 消费方（图表、形态检测）只关心"这只股票哪些周期变了"，数组形态正好表达多周期；一次下载一个周期的事件流仍是单元素，行为不变。

### Decision 7: 自动下载与增量起点逻辑零改动

**选择**：`performAutoDownload()` 中 `downloadBatch(pending, endDate, endDate, ['', 'qfq'], [period], { retry: true })`；`collectPendingStocks()` / `computeIncrementalStartDate()` / `isPeriodComplete()` 等按单周期判定的辅助函数保持签名不变。

**Rationale**：自动下载的完整性判定与起点计算本来就是"逐周期"的（外层 `for (const period of AUTO_DOWNLOAD_PERIODS)`），多选语义只属于手动入口；包成单元素数组即可复用同一套 `downloadBatch()`，避免出现第二套下载实现。

## Risks / Trade-offs

- **[请求量与耗时放大]** 全选周期时单只股票请求数由 2 次（2 复权）变为最多 6 次，批量 N 只时线性放大 → 保持全局串行不变、默认只选日线、弹窗内「确定」按钮显示「下载中…(已完成/总数)」；若出现限流，仍沿用现有「失败重试 1 次」兜底，不引入并发。
- **[逐只结果文案过长]** 三个周期各两种复权拼起来超出一行 → 行内单行省略 + `title` 展示完整文本；失败周期优先展示（截断时先保住失败信息）。
- **[成功率下降带来的体感]** 严格判定后"成功只数"可能比过去低（某个周期 0 条） → 逐只结果明确标注失败周期与原因，用户在弹窗内即可判断是数据问题还是代码问题；不因失败自动放宽判定。
- **[契约变更破坏残留调用方]** `period` → `periods` 属内部 breaking → 全量 `npm run typecheck` + 检查 `tests/unit/ipcValidation.test.ts`、`ipcChannelContracts.test.ts`；测试里显式覆盖 `periods` 合法/非法/缺省三种情形。
- **[重复提交]** 多选让"点全选再点确定"更容易触发大批量 → 沿用 `batchDownloading` 互斥 + 弹窗下载中禁止关闭/重复提交，不新增队列。
- **[单只弹窗状态不复位]** 单只下载弹窗组件在 `WatchlistView` 中常驻挂载，`periods` 与日期一样在多次打开之间保留 → 与现状（日期保留）一致，不改重置行为；批量弹窗保持"每次打开重置为 `['d']`"。

## Migration Plan

1. 先改 `shared/types` 与 `electron/ipcValidation.ts`，让类型/校验层暴露所有编译错误点。
2. 再改主进程服务层（`downloadPeriod` / `downloadKline` / `downloadWithRetry` / `downloadBatch` / `buildBatchStockResult`）与 IPC 处理器，最后改 preload 与渲染层（store、两个弹窗、`WatchlistView`）。
3. 无数据库迁移、无持久化字段变更；回滚即回退本次提交（`periods` 只存在于运行时契约中）。
4. 验证：`npm run typecheck`、`npm run lint`、`npm test`；手工验证单只多周期、批量全选周期、自动下载日志仍为三周期逐个执行。

## Open Questions

- 默认值是否要改成「全选」？（当前设计取"仅日线"，若产品上更希望默认补齐三周期，只需把两个弹窗打开时的 `periods` 初值改为 `[...KLINE_PERIODS]`。）
- 是否需要周期级子进度（逐只行内显示「周线 下载中」）？（当前设计明确不做，若后续下载时长成为痛点再单独立项。）
