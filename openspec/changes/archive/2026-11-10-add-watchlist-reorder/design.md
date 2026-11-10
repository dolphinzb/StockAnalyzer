## Context

自选股列表的数据链路是 Electron 主进程 + 渲染进程：

- 表结构定义在 `sql/init.sql` 的 `watchlist_stocks`（`id`、`stock_code`、`stock_name`、`buy_threshold`、`sell_threshold`、`monitor_enabled`、`created_at`、`updated_at`），由 `scripts/init-database.ts` 首次建库。
- 运行时数据库是 sql.js 的内存实例（`electron/database.ts`），任何写操作后调用 `saveDatabase()` 把整库导出写回 `~/.stockanalyzer/stockanalyzer.db`。
- 读取链路：`watchlist:get` IPC（`electron/index.ts`）→ `getWatchlist()`（`electron/database.ts`）→ `src/stores/watchlist.ts` 的 `stocks` → `sortedStocks` computed → `WatchlistView.vue` → `StockList.vue` → `StockItem.vue`。
- 顺序当前由两处派生：SQL 的 `ORDER BY monitor_enabled DESC, updated_at DESC` 与前端 `sortedStocks` 中的同规则排序。`updateStock` 每次都会强制写入 `updated_at`，因此编辑阈值或切换监控都会让该行跳到最前。
- `src/components/StockList.vue` 与 `src/components/StockItem.vue` 各自硬编码了一份 12 列 `grid-template-columns`，行是 grid 平铺而非表格。
- 渲染进程无 UI 组件库、无拖拽库；状态用 Pinia setup store；项目已有 `src/composables/`（如 `useNavigation`、`useToast`）与 `src/utils/`（纯函数放置处）。
- 打包约束：`sql/init.sql` 不在 electron-builder 的 `files` 白名单内，主进程运行时读不到，因此**存量库的结构变更必须写在主进程代码里**（参考 `migrateKlineTables` 的幂等模式），`init.sql` 只对新建库生效。

## Goals / Non-Goals

**Goals:**

- 用单一持久化字段 `sort_order` 取代「监控 + 更新时间」派生排序，顺序在重启后保持
- 存量数据库零感知升级：迁移后列表外观与升级前一致，且迁移幂等
- 拖拽交互只通过独立手柄触发，不影响行内既有点击与按钮
- 顺序保存为「整表顺序一次性提交」，失败可回滚，不出现界面与数据库不一致
- 排序规则只保留一个来源，避免前后端规则漂移

**Non-Goals:**

- 不提供按代码/名称/涨跌幅等字段的自动排序或一键整理入口
- 不提供排序模式切换开关（手动是唯一模式）
- 不做拖拽的跨分组语义（监控中/未监控分组排序彻底取消）
- 不引入虚拟滚动；自选股数量维持在几十只量级
- 不为顺序字段增加离线迁移脚本：应用启动必经 `initDatabase()`，运行时迁移已覆盖全部升级路径

## Decisions

### 决策 1：用 `sort_order` 整型列，全量重写而非间隙插入

`watchlist_stocks` 新增 `sort_order INTEGER NOT NULL DEFAULT 0`，drag 结束后把当前顺序写成连续的 `0..N-1`。

- 理由：列表规模是几十条，一次重排 N 条 `UPDATE` + 一次 `saveDatabase()` 的开销可忽略；连续值让排序语义最简单，也顺带压缩删除产生的空洞。
- 备选方案 A（间隙 1000 + 取中间值）：只在「单条插入」场景有优势，本项目每次拖拽都要重写多条，收益为零却引入「间隙耗尽需重排」的额外分支。
- 备选方案 B（REAL 浮点 fractional indexing）：并发与协作场景才有价值，单机单窗口不需要。
- 备选方案 C（不落库，顺序存 localStorage/配置文件）：与「数据库是唯一事实源」的现有架构冲突，且脱离备份体系，直接排除。
- 不新增 `sort_order` 索引：几十行数据的全表排序无收益，避免无意义的结构噪音。

### 决策 2：排序规则收敛到数据访问层，前端不再排序

`getWatchlist()` 改为 `ORDER BY sort_order ASC, id ASC`；`getEnabledStocks()` 同步补上同样的 `ORDER BY`（保证监控轮询顺序与界面一致）。

前端 `sortedStocks` **保留原有名称**（`WatchlistView.vue` 的批量下载入参、编辑回填、空状态判断都引用它），但实现改为直接返回 `stocks`，并补 JSDoc 说明顺序由后端决定。

- 理由：重命名会波及视图模板与多个 computed，收益仅是命名更准确；保留名称 + 注释的改动面最小。若后续要清理，可另开一次纯重构。
- 备选方案：直接删除 `sortedStocks`，视图改用 `store.stocks`。会让本次 diff 扩散到 `WatchlistView` 多处，且容易漏改批量下载与编辑回填，风险大于收益。

### 决策 3：整表顺序一次性提交，主进程校验集合一致性

新增 IPC `watchlist:reorder`，入参是**完整的有序 id 数组**（`number[]`），返回重排后的完整列表。

- 主进程校验：非空数组、元素为正整数、无重复、且 id 集合与库中现有 id 集合完全一致。不一致（例如期间有新增强删）时拒绝并抛出「自选股列表已变化，请刷新后重试」，由前端重拉。
- DAO 新增 `reorderWatchlist(orderedIds: number[])`：单个事务内循环 `UPDATE watchlist_stocks SET sort_order = ? WHERE id = ?`，**不改写 `updated_at`**（重排不是数据内容变更，也避免任何残留逻辑误读），提交成功后调用一次 `saveDatabase()`；异常则 `ROLLBACK` 并向上抛。
- 返回完整列表而非布尔值：前端用后端返回值覆盖本地状态，天然消除「本地顺序与服务端顺序漂移」的可能。
- 备选方案（逐条拖动就发一次 IPC）：产生大量写盘，且中途失败会留下半截顺序。

### 决策 4：拖拽库选 `sortablejs`，并用纯函数承接数组重排

渲染进程新增依赖 `sortablejs`（+ `@types/sortablejs`），在 `StockList.vue` 的列表容器上初始化一个实例，配置：

- `handle: '.drag-handle'`：只有手柄可拖动
- `animation: 150`、`ghostClass` / `chosenClass`：提供落点占位与拖起态视觉反馈
- `onEnd`：`oldIndex === newIndex` 直接返回；否则按索引计算新数组并 `emit('reorder', orderedIds)`

- 理由：SortableJS 是同类需求的事实标准，支持 handle、动画、滚动容器内自动滚动，体积小且无框架绑定。项目无 UI 库、风格克制，手写原生 HTML5 DnD 需自行处理插入位置计算、自动滚动、拖影样式，代码量与坑都更多；`vue-draggable-plus`/`vuedraggable` 多一层封装，对本次单一场景没有额外收益。
- 数组重排与「按 id 应用顺序」抽成 `src/utils/stockOrder.ts` 的纯函数（`moveArrayItem`、`applyOrder`），便于单元测试，也让 store 与组件共用同一套逻辑。

**Vue 与 SortableJS 的同步要点**：SortableJS 直接移动 DOM，必须在 `onEnd` 中**同步**更新响应式数组（`arrayMove` 语义），使 Vue 的下一次 patch 结果与已移动的 DOM 一致；否则 Vue 会用旧顺序重渲染，出现回跳闪烁。持久化是 `onEnd` 之后的异步动作，不阻塞本地顺序更新。

### 决策 5：乐观更新 + 失败回滚，提交期间禁用再次拖拽

store 新增 `reorderStocks(orderedIds)`：

1. 备份当前数组 → 用 `applyOrder` 立即重排本地 `stocks`（界面即时生效）
2. 置 `isReordering = true`，调用 `watchlist:reorder`
3. 成功：用返回值覆盖 `stocks`
4. 失败：先尝试 `fetchStocks()` 从后端恢复；若重拉也失败则回填备份数组，并向上抛错由视图 toast 提示
5. `finally` 中复位 `isReordering`

`StockList` 接收 `reordering` 属性，为真时把 Sortable 实例置为 `disabled`，避免提交未完成时二次拖拽交叉覆盖。

### 决策 6：拖拽手柄作为新的首列，grid 列定义抽成共享 sass 变量

`StockList.vue` 表头与 `StockItem.vue` 行各自硬编码 12 列，新增手柄列会变成两处 13 列的手工同步。本次新增 `src/styles/_stock-grid.scss` 定义 `$stock-list-columns`，两个组件的 scoped 样式通过 `@use` 复用。

列宽按「默认 1200px 窗口不出现横向滚动」重新分配，最终取值为 `22px 56px 90px 72px 72px 72px 72px 72px 80px 80px 80px 56px 168px`：手柄列 22px、名称列放宽到 90px、列间距收窄到 0.375rem。列总宽 992px，含间距与内边距约 1064px，处于行内可用宽（约 1070px）之内。

- 理由：消除已经存在的「两处必须同步」隐患，成本仅一个 partial 文件（`sass` 已是 devDependency）。
- 手柄渲染为 `⋮⋮` 字符，`cursor: grab`、`user-select: none`、`title="拖拽调整顺序"`，hover 时高亮以提升可发现性。
- 整行不加 `draggable`，避免与 `.col-name` 的点击（打开K线图）和按钮冲突。

### 决策 7：新增股票追加到末尾

`addStock` 的 INSERT 增加 `sort_order`，取值 `(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM watchlist_stocks)`，与现有 `monitor_enabled` 固定为 0 的写法并列。

- 理由：现有行为下新股票（未监控）本就排在列表底部，追加末尾与用户既有预期一致，也避免新股票插入到自定义顺序中间。
- 删除不压缩顺序值：空洞不影响排序，下一次拖拽全量重写时自然收敛。

### 决策 8：迁移在内存库中完成后再落盘

在 `initDatabase()` 中新增 `migrateWatchlistSortOrder(database)`，与 `migrateKlineTables` 并列：

1. `hasDbObject(database, 'table', 'watchlist_stocks')` 为假则跳过（记 warn）
2. 用 `PRAGMA table_info(watchlist_stocks)` 判断 `sort_order` 是否存在，存在则直接返回 `false`（幂等）
3. 缺失则 `ALTER TABLE watchlist_stocks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`
4. 按 `monitor_enabled DESC, updated_at DESC, id ASC` 查出 id 顺序，循环 `UPDATE ... SET sort_order = ?`
5. 返回 `true`，由 `initDatabase()` 统一 `saveDatabase()`

- 理由：sql.js 的所有变更先作用于内存实例，只有显式 `saveDatabase()` 才写文件。把加列与回填都放在落盘之前，任一步抛错都不会留下「有列无顺序」的半迁移文件，重试即重来，天然原子。
- `sql/init.sql` 同步新增列，保证新建库结构一致。
- 不新增 `scripts/migrate-*.ts`：应用每次启动都会执行 `initDatabase()`，离线脚本只是重复实现。
- 迁移后 `updated_at` 保持原值，不参与任何排序。

## Risks / Trade-offs

- [升级后「开启监控自动置顶」的行为消失，老用户感知为顺序变了] → 迁移回填严格按升级前的可见顺序，升级瞬间外观不变；只有用户后续切换监控时才不再置顶，需在 proposal/发布说明中明确该行为变更。
- [拖拽与后台 `fetchStocks()` 竞态] → `addStock` 成功后整表重拉会覆盖本地顺序。通过「`isReordering` 期间禁用拖拽」与「保存返回完整列表覆盖本地」降低窗口；极端并发下后端集合校验会拒绝脏顺序并触发重拉，收敛到数据库状态。
- [SortableJS 操作 DOM 与 Vue patch 冲突导致回跳闪烁] → `onEnd` 内同步重排数组，禁止只依赖异步 IPC 结果更新界面。
- [拖拽期间价格推送（约 1 秒/次）触发 `StockItem` 重渲染] → 价格更新只改文本节点、不重建行节点，不影响 Sortable 的 DOM 引用；若未来行内出现结构性 `v-if`（整行替换），需改为拖拽期间冻结行情渲染。
- [sql.js 全库导出写文件的固有风险（写一半断电）] → 本次不改变落盘机制，属于既有风险；重排只写 `sort_order`，即使文件损坏也只影响顺序字段。
- [新增手柄列导致 1200px 窗口横向溢出] → 压缩既有列宽并把列间距收窄到 0.375rem，手柄列取 22px、名称列放宽到 90px，列总占用约 1064px，低于行内可用宽约 1070px；代码/名称列用 `ellipsis` 防止长文本挤压相邻列。窗口缩小到最小宽（800px）时仍会出现横向滚动，属宽表格的兜底行为。

## Migration Plan

1. 发布新版本并在 `sql/init.sql` 中同步新列（仅影响新建库）。
2. 应用启动 → `initDatabase()` 检测 `sort_order` 缺失 → 内存库加列 + 按当前可见顺序回填 → `saveDatabase()` 落盘。
3. 迁移幂等：第二次启动检测到列已存在，直接跳过，不触碰已有顺序值。
4. 回滚策略：还原代码即可。旧代码不读取 `sort_order`，多出的列不会造成写入失败；旧版本仍按 `monitor_enabled`/`updated_at` 排序，功能可正常使用。无需 down migration。

## Open Questions

无。拖拽库、存储形态、失败处理与迁移方式均已确定，可直接进入任务拆分。
