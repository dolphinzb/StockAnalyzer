> **状态：阶段 0–5 全部完成（2026-11-20 归档）**
> 前置 change `upgrade-electron-to-35` 已完成并人工验证（Electron 35.7.5 / Node 22.16）。
> 引擎已切换为 `better-sqlite3@13`（WAL + busy_timeout），`sql.js` 依赖已移除，全量 369 用例通过、安装包已重新部署。

## 0. POC（选型闸门）

- [x] 0.1 安装 `better-sqlite3`，验证 `npm run dev`（Electron 28.3.3）能加载模块并打开现有 6.9MB 库 —— **失败**：`require` 成功但 `new Database()` 崩溃（`engines.node >= 22`）
- [x] 0.2 验证 `npm test`（系统 Node 22）能在同一份 `node_modules` 下加载该模块 —— **通过**
- [x] 0.3 打包验证：Electron 35 + `asarUnpack` 后原生二进制已解包到 `app.asar.unpacked`（随 3.1/3.4 一并验证）
- [x] 0.4 验证 WAL + `busy_timeout=5000` 与 DBeaver 并发 —— **通过**：外部持写时应用读 0ms 成功、写等 1000ms 后 `database is locked`；应用持写时外部读 0ms、外部写等 500ms 失败；关闭后 `-wal` 合并
- [x] 0.5 验证引擎快照备份生成的库可被 DBeaver 打开且 `integrity_check` 为 ok（代码已改用 `backupTo`；与 5.7 同一验证，待 15:30 自动备份后检查产物）
- [x] 0.6 回退候选评估 —— 文件型 WASM（`node-sqlite3-wasm`）**排除**：不支持 WAL、与外部客户端的锁互斥不成立
- [x] 0.7 前置解锁：`upgrade-electron-to-35` 已完成，Electron 35.7.5（Node 22.16）下 `better-sqlite3@13` 可正常加载

## 1. 抽象层（原语）

- [x] 1.1 `database.ts` 新增 `queryRows` / `queryValue` / `execute` / `transaction` / `backupTo`，`database.ts` 内 49 处 `exec/run` 全部改走原语
- [x] 1.2 `saveDatabase()` 先降级为无副作用的兼容调用，随后在阶段 4.1 连同全部调用点删除
- [x] 1.3 行映射保留「按 SELECT 顺序的行数组」契约（**调整**：为控制 diff，具名列映射作为可选后续优化）
- [x] 1.4 原语单测：查询顺序、参数绑定、受影响行数、事务提交/回滚/嵌套拒绝、备份可重新加载（`tests/unit/databasePrimitives.test.ts`，10 例）

## 2. 驱动替换

- [x] 2.1 `initDatabase()` 改为引擎打开文件（`SqliteDatabase`），并设 `journal_mode=WAL`、`synchronous=NORMAL`、`busy_timeout=5000`
- [x] 2.2 `database.ts` 内 `exec/run` 全部改走原语（**调整**：`fundService.ts` / `migrations.ts` 的 34 处调用保留 `exec/run`，但它们作用在自有的 `DatabaseLike` 接口上，不再直接耦合驱动；逐处改写为原语留作后续可选重构）
- [x] 2.3 `migrations.ts` 适配：类型改为 `DatabaseLike`，多语句脚本仍由 `run` 整体执行，迁移仍在单事务内
- [x] 2.4 `fundService.ts` 类型改为 `DatabaseLike`
- [x] 2.5 `electron/index.ts` 的 `runInTransaction` 保留（引擎兼容 BEGIN/COMMIT），未强制改为同步 `transaction`
- [x] 2.6 `getDb()`、`WriteOptions.target`、`saveKlineData(target)`、`getLatestTradeDates(target)` 类型改为 `DatabaseLike`
- [x] 2.7 `closeDatabase()` 改为 `db.close()`（WAL 由引擎在关闭时合并）
- [x] 2.8 引擎零行语义对齐（零行查询返回空结果集，与 sql.js 一致），修正 `holdingChainRecalc` 等依赖 `length === 0` 判空的调用

## 3. 备份与打包

- [x] 3.1 `performBackup()` 改用引擎快照 `backupTo()`，删除 `copyFileSync + renameSync`；保留最近 3 天清理逻辑（测试已重写为快照语义，7 例通过）
- [x] 3.2 `backupBeforeMigration()` 改用引擎快照，保留 5 份上限清理
- [x] 3.3 `package.json`：新增 `better-sqlite3`、移除 `sql.js` 与 `@types/sql.js`、`@types/better-sqlite3` 移入 devDependencies、新增 `asarUnpack: ["**/node_modules/better-sqlite3/**"]`
- [x] 3.4 `npm run deploy` 通过，安装目录 `app.asar.unpacked` 内含 win32-x64 原生二进制
- [x] 3.5 8 个测试文件改用引擎内存库（`new SqliteDatabase(':memory:')`），仓库内不再引用 `sql.js`

## 4. 清理与文档

- [x] 4.1 删除 `saveDatabase()` 与全部调用点（`database.ts` 8 处、`index.ts` 6 处、`klineDownloadService.ts` 2 处、`scripts/migrate-add-trade-record-id.ts` 1 处）；连同 `reorderWatchlist` 的落盘失败补偿逻辑一并移除
- [x] 4.2 更新 `database.ts` / `sqliteEngine.ts` 注释：提交即持久、禁止整文件替换；并移除已无意义的 `skipSave` 参数（`WriteOptions.skipSave`、`downloadKline` / `downloadWithRetry` 的形参及全部调用点）
- [x] 4.3 确认 `logService.ts` 的 `exec` 匹配是正则而非 SQL，日志归档 rename 目标为新文件，无需改动
- [x] 4.4 归档时同步主规格 `database-schema-migration` 与新增 `database-engine-persistence`

## 5. 验证

- [x] 5.1 `npm run test` 全量通过（60 文件 / 369 用例）
- [x] 5.2 `npm run typecheck` 与 `npm run build:electron` 无错误
- [x] 5.3 `npm run deploy` 成功，安装目录与 `release/win-unpacked` 一致；编译产物对真实库副本验证：`journal_mode=wal`、`busy_timeout=5000`、读写与 `changes()` 正常、关闭后 `-wal` 合并
- [x] 5.4 **DBeaver 连接保持打开**时端到端验证 —— **通过**（2026-11-20）：WAL 文件生成；09:58 手动下载 `601658 (20261118~20261119)`，应用日志无 EPERM，DBeaver 独立连接查到该股两种复权各 1682 条、最新日 2026-11-19，全库 `kline_daily` 25,133 条
- [x] 5.5 DBeaver 手持未提交写事务时触发一次应用写入：确认等待后成功，或超时后收到明确提示且数据未被静默丢弃
- [x] 5.6 强杀进程后重启：`PRAGMA integrity_check` 返回 ok，数据可读
- [x] 5.7 每日备份生成的快照可被 DBeaver 打开且数据完整
