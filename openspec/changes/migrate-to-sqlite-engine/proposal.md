## Why

当前持久化使用 sql.js（内存库）+ 「写临时文件 → rename 覆盖」的落盘方式（`electron/database.ts:237-264`）。这在 Windows 上有结构性缺陷：

1. **rename 需要目标文件的 DELETE 权限**。只要有任何进程持有 `stockanalyzer.db`（DBeaver 连接、安全软件扫描、第二个应用实例），`renameSync` 就报 `EPERM`，导致：自动下载整批 reject（日线失败连带周/月线不跑）、手动下载数据只在内存、退出时 `closeDatabase` 静默丢数据。
2. **每次落盘都是全库序列化**（6.9MB `db.export()` + 写盘），21 处调用点都在触发整文件重写。
3. 该模式与「外部工具同时打开数据库改数据」根本冲突：用户长期用 DBeaver 直接修改数据，无法通过「记得关掉 DBeaver」规避。

实测确认：DBeaver 停止后文件锁立即释放，证明持有者是其 SQLite 连接；`rename` 是唯一失败点（读取与启动加载均不受影响）。

**前置依赖（暂停原因）**：本 change 依赖 `upgrade-electron-to-35`。POC 实测表明 `better-sqlite3@13` 在 Electron 28（Node 18）下 `new Database()` 直接崩溃，而文件型 WASM 候选（`node-sqlite3-wasm`）不支持 WAL 且与外部 SQLite 客户端的锁互斥不成立，无法满足「DBeaver 直接改数据」的需求。Electron 升级完成前，本 change 的实现阶段暂停。

## What Changes

- **持久化改用嵌入式 SQLite 引擎就地写页**：事务提交即持久，MUST NOT 再整文件替换。首选 `better-sqlite3`（同步 API，业务层无需异步化）；若 POC 证明 Node/Electron 双 ABI 不可行，退到文件型 WASM SQLite（同为同步 API）。
- **启用 WAL**：允许 DBeaver 与应用同时读写（写写仍串行由 SQLite 锁协调），配合 `busy_timeout` 等待而非直接失败。
- **取消显式落盘**：`saveDatabase()` 语义消失，21 处调用点在阶段一保留为空实现、阶段四删除。
- **备份改用引擎一致性快照**（`db.backup()` / `VACUUM INTO`）：WAL 下直接拷 `.db` 会遗漏 `-wal` 中尚未 checkpoint 的最近事务。
- **数据访问收敛为四个原语**（`queryAll` / `execute` / `transaction` / `backupTo`），替换全仓 85 处 `exec/run`，并修正「按行下标取值」为具名列映射。
- **迁移脚本方言不变**：仍是 SQLite 方言，只调整执行方式与 `PRAGMA user_version` 台账读取。

## Capabilities

### New Capabilities

- `database-engine-persistence`：嵌入式 SQLite 引擎的直接读写、事务持久化边界、与外部进程（DBeaver 等）的并发访问与锁等待、WAL 模式下的一致性备份、现有库文件兼容。

### Modified Capabilities

- `database-schema-migration`：原「数据库落盘具备原子性（先写临时文件再重命名）」改为「原子性由引擎事务保证，禁止整文件替换」。

## Impact

- **主进程**：`electron/database.ts`（打开方式、查询/执行、事务、落盘）、`electron/migrations.ts`（台账读写、脚本执行）、`electron/services/backupService.ts`（快照备份）、`electron/services/fundService.ts`（类型）、`electron/index.ts`（移除落盘调用与事务封装）
- **依赖**：新增 SQLite 引擎依赖，移除 `sql.js` 与 `@types/sql.js`
- **打包**：`electron-builder` 需处理原生模块（`asarUnpack` + rebuild）或改为无原生依赖的 WASM 方案
- **测试**：8 个直接构造 `sql.js` 内存库的测试文件改用引擎内存库
- **数据**：无需迁移，现有 `.db` 可直接被引擎打开；保留一次迁移前备份

## Non-Goals

- 不改变任何业务表结构与数据库文件格式。
- 不改变 IPC 契约、界面、手动下载与自动下载的行为。
- 不做同步→异步改造（引擎为同步 API，`getWatchlist` 等接口签名保持不变）。
- 不引入 PG / 外部数据库服务，不引入 ORM。
- 不新增多实例支持（单实例锁作为独立事项另行评估）。
- 不在此 change 内修复「落盘失败阻断批次」「退出静默丢数据」等表现问题——换引擎后这些路径自然消失。
