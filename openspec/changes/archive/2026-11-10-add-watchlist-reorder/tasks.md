## 1. 数据层与迁移

- [x] 1.1 在 `sql/init.sql` 的 `watchlist_stocks` 建表语句中新增 `sort_order INTEGER NOT NULL DEFAULT 0`
- [x] 1.2 修改 `electron/database.ts`：`WatchlistStock` 接口新增 `sortOrder: number`，`rowToWatchlistStock` 增加对应列映射（`sort_order` 统一追加在 SELECT 列清单末尾，避免既有下标错位）
- [x] 1.3 更新 `getWatchlist`、`getWatchlistById`、`getEnabledStocks`、`getStockByCode` 的 SELECT 列清单追加 `sort_order`；`getWatchlist` 改为 `ORDER BY sort_order ASC, id ASC`，`getEnabledStocks` 补同样的 `ORDER BY`
- [x] 1.4 新增 `migrateWatchlistSortOrder(database)`：表不存在则跳过并记 warn；用 `PRAGMA table_info(watchlist_stocks)` 判断列是否存在（存在即返回 false，保证幂等）；缺失时 `ALTER TABLE ... ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`，再按 `monitor_enabled DESC, updated_at DESC, id ASC` 查出 id 顺序循环回填，返回 true
- [x] 1.5 在 `initDatabase()` 中调用 `migrateWatchlistSortOrder`，与 `migrateKlineTables` 的结果合并后再统一 `saveDatabase()`（迁移只在内存完成、全部成功才落盘）
- [x] 1.6 修改 `addStock` 的 INSERT：列清单加入 `sort_order`，取值 `(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM watchlist_stocks)`，保持 `monitor_enabled` 现有取值不变
- [x] 1.7 新增 `reorderWatchlist(orderedIds: number[])`：`BEGIN` 后在事务内循环 `UPDATE watchlist_stocks SET sort_order = ? WHERE id = ?`（不改写 `updated_at`），成功 `COMMIT` + 一次 `saveDatabase()`，异常 `ROLLBACK` 后抛出，最终返回 `getWatchlist()`

## 2. IPC 与类型契约

- [x] 2.1 在 `shared/types/index.ts` 的 `StockWatcherAPI` 中新增 `reorderWatchlist(orderedIds: number[]): Promise<any[]>`
- [x] 2.2 在 `electron/index.ts` 新增 `ipcMain.handle('watchlist:reorder', ...)`：校验入参为非空数组、元素为正整数、无重复，且 id 集合与 `getWatchlist()` 现有 id 集合完全一致；不一致时抛出「自选股列表已变化，请刷新后重试」，成功返回重排后的完整列表
- [x] 2.3 在 `preload/index.ts` 同步本地 `WatchlistStock` 接口副本（新增 `sortOrder`）与本地 `StockWatcherAPI` 接口，并在 `stockWatcherAPI` 中暴露 `reorderWatchlist: (orderedIds) => ipcRenderer.invoke('watchlist:reorder', orderedIds)`
- [x] 2.4 在 `src/types.ts` 的 `WatchlistStock` 中新增 `sortOrder: number`
- [x] 2.5 安装拖拽依赖：`sortablejs` 加入 `dependencies`，`@types/sortablejs` 加入 `devDependencies`，确认 `package-lock.json` 同步更新

## 3. 前端顺序状态

- [x] 3.1 新增 `src/utils/stockOrder.ts`：导出 `moveArrayItem<T>(items, from, to)`（越界/原地返回原数组副本）与 `applyOrder<T extends { id: number }>(items, orderedIds)`（按 id 重排，未出现在 orderedIds 中的项按原相对顺序追加到末尾），补充中文 JSDoc
- [x] 3.2 修改 `src/stores/watchlist.ts` 的 `sortedStocks`：改为直接返回 `stocks`（保留名称以减少视图改动），JSDoc 说明顺序由后端 `sort_order` 决定、前端不再二次排序
- [x] 3.3 在 `watchlist` store 新增 `isReordering` 状态与 `reorderStocks(orderedIds)` action：先备份并按 `applyOrder` 乐观更新 `stocks` → 置 `isReordering` → 调用 `reorderWatchlist` → 成功用返回值覆盖 `stocks`；失败时先 `fetchStocks()` 恢复，重拉失败则回填备份并向调用方抛出；`finally` 复位 `isReordering`
- [x] 3.4 在 store 的返回对象中暴露 `isReordering` 与 `reorderStocks`

## 4. 拖拽交互与样式

- [x] 4.1 新增 `src/styles/_stock-grid.scss` 定义 `$stock-list-columns`（手柄列 32px + 原有 12 列），`StockList.vue` 表头与 `StockItem.vue` 行改用该变量，移除两处硬编码的 `grid-template-columns`
- [x] 4.2 在 `StockItem.vue` 行首新增 `.drag-handle` 列（`⋮⋮` 文本、`cursor: grab`、`user-select: none`、`title="拖拽调整顺序"`、hover 高亮），不改变行内既有元素的点击行为
- [x] 4.3 在 `StockList.vue` 表头新增与手柄同宽的首列表头单元格；为 `.stock-list-body` 初始化 SortableJS 实例（`handle: '.drag-handle'`、`animation: 150`、`ghostClass`/`chosenClass`），`onEnd` 中 `oldIndex === newIndex` 直接返回、否则用 `moveArrayItem` 计算新数组并 `emit('reorder', orderedIds)`
- [x] 4.4 在 `StockList.vue` 中处理生命周期与禁用：`onBeforeUnmount` 销毁实例；新增 `reordering` 布尔属性，变化时同步 `sortable.option('disabled', value)`；新增 `reorder: [orderedIds: number[]]` 事件声明
- [x] 4.5 在 `WatchlistView.vue` 绑定 `@reorder` 与 `:reordering="store.isReordering"`，处理函数调用 `store.reorderStocks`，捕获异常后用 `useToast().showToast('顺序保存失败，已恢复原顺序', 'error')` 提示
- [x] 4.6 补充拖拽相关的 scoped 样式（拖起行、落点占位、手柄 hover），确认与现有 `.stock-item` 边框/背景色主题变量一致

## 5. 测试与验证

- [x] 5.1 新增 `tests/unit/stockOrder.test.ts`：覆盖 `moveArrayItem` 的上移、下移、原地、from/to 越界，以及 `applyOrder` 的正常重排、orderedIds 缺少某些 id 时按其原相对顺序追加、orderedIds 含未知 id 时忽略
- [x] 5.2 执行 `npm run typecheck` 与 `npm run build:electron`，确认新增字段与 API 签名（含 preload 本地副本、shared 声明、Window 类型）无类型错误
- [x] 5.3 执行 `npm run lint` 检查本次改动文件，新增代码 0 error（仓库既有 `dist-electron/` 构建产物与 `vite.config.ts` 三斜线引用报错与本次无关）
- [x] 5.4 执行 `npm test`，46 个测试文件、218 个用例全部通过，含新增 `stockOrder` 9 例与 `watchlistSortMigration` 5 例
- [x] 5.5 迁移验证（自动化覆盖）：`tests/unit/watchlistSortMigration.test.ts` 在临时目录构造旧版数据库文件，走真实 `initDatabase()` 验证顺序回填、二次启动幂等、重排后 `updated_at` 不变、新增追加末尾、删除后相对顺序不变
- [x] 5.6 GUI 验证（已验证通过）：拖拽调整顺序后重启应用顺序保持；切换监控开关、编辑阈值后行位置不变；拖拽失败场景列表恢复原顺序并提示
- [x] 5.7 交互验证（已验证通过）：点击股票名称、监控开关、下载K线/编辑/删除按钮不触发拖拽；拖拽中价格刷新不打断拖拽、不出现行顺序回跳闪烁
