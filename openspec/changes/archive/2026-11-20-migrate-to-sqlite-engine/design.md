## Context

**现状持久化链路**

- 打开：`initDatabase()` 用 `readFileSync(dbPath)` 全量读入并构造 `new SQL.Database(buffer)`（`electron/database.ts:200-208`），此后全部读写都在内存里。
- 落盘：`saveDatabase()` 执行 `writeFileSync(db.tmp)` → `renameSync(tmp → stockanalyzer.db)`（`:237-264`），21 处调用点显式触发。
- 事务：`runInTransaction(fn)` 手动 `BEGIN/COMMIT/ROLLBACK` + `inTransaction` 标志禁止落盘（`:276-...`），3 处调用（`electron/index.ts:467/534/546`）。
- 备份：`performBackup()` 先 `saveDatabase()` 再 `copyFileSync(db → backup.tmp)` + `rename`（`backupService.ts:68/88-89`）。
- 迁移：`runMigrations(db)` 用 sql.js 执行 `sql/migrations/*.sql`，台账是 `PRAGMA user_version`。
- 规模：库文件 6.9MB；全仓 `exec/run` 85 处（`database.ts` 内 23 + 26），`prepare` 0 处；11 个文件 `import sql.js`（3 个生产文件 + 8 个测试文件）。

**四类 rename / 文件替换点**

| # | 位置 | 目标 | 是否会被外部占用 |
|---|---|---|---|
| 1 | `database.ts:250-251` 落盘 | **活动库** | 是，系统性失败 |
| 2 | `database.ts:181` 迁移前备份 | `.bak-<时间戳>`（新文件） | 否 |
| 3 | `backupService.ts:88-89` 每日备份 | 备份文件（通常新文件） | 仅当该备份被 DBeaver 打开 |
| 4 | `logService.ts:189` 日志归档 | 新文件 | 否 |

**实测约束**：DBeaver 连接期间，`rename` 报 `EPERM`；停止 DBeaver 后锁立即释放。读与启动加载不受影响。用户长期用 DBeaver 直接修改数据，无法靠「记得关闭」规避。

**约束**

- 单机单进程桌面应用，无服务端组件，安装目录需自包含。
- 业务层大量同步调用（`getWatchlist`、`saveKlineData`、`getLatestTradeDates`），不能为了换库引入全链异步化。
- 现有 `.db` 是标准 SQLite 文件，schema 由 `sql/migrations` 管理。

## Goals / Non-Goals

**Goals：**

- 消除 #1 的整文件替换：写入走引擎页级事务，外部进程持锁时最多等待，不再 EPERM。
- 让 DBeaver 的读与写都能与应用并存（读写并行、写写串行排队）。
- 保持所有对外函数签名与手动/自动下载行为不变。
- 备份在 WAL 下仍是「备份时刻的完整一致快照」。

**Non-Goals：**

- 不改表结构、不改 IPC、不引入 ORM、不换 PG。
- 不做同步→异步改造。
- 不在此 change 内解决多实例问题（单实例锁另行评估）。

## Decisions

### D1：引擎选型 —— better-sqlite3 13（已由 POC 定案，前置依赖 Electron 35）

**决策**：采用 `better-sqlite3@13`（同步 API，`prepare().all()/get()/run()`、`db.transaction()`、`db.backup()`）。**前置依赖**：需先完成 change `upgrade-electron-to-35`（该引擎要求 Node ≥ 22，当前 Electron 28 内置 Node 18.18）。

**POC 结论（2026-11-19 实测）**：

| 组合 | 结果 |
|---|---|
| better-sqlite3 13 + Electron 28.3.3（Node 18.18） | `require` 成功，`new Database()` 进程崩溃（`engines.node >= 22`） |
| better-sqlite3 13 + Node 22.20 | 通过：打开 6.7MB 副本、`integrity_check ok`、WAL 切换、25,131 条日线读取、写入正常 |
| better-sqlite3 13 + Electron 35.7.5（Node 22.16） | 通过：`new Database()` 正常 |
| better-sqlite3 11.x | 无 Node 22 预编译产物，本机无 MSVC，安装失败 |
| better-sqlite3 12.x | `engines.node` 为 20+，Electron 28 不满足 |
| 文件型 WASM（`node-sqlite3-wasm` 0.8.61） | **排除**：VFS 不支持 WAL（`journal_mode=wal` 仍为 delete）；与外部 SQLite 客户端锁互斥不成立（外部持写事务时它写失败且 `busy_timeout` 不生效，报 "disk I/O error"；它持写事务时外部仍能写入），无法满足「DBeaver 直接改数据」 |

**WAL 并发实测（两个连接模拟应用与 DBeaver）**：外部持写时应用**读 0ms 成功**、应用写等 1000ms 后 `database is locked`；应用持写时外部读 0ms、外部写等 500ms 失败；关闭后 `-wal` 自动合并为单文件。符合 D2/D8 的预期语义。

**代价**：必须先完成 Electron 升级（独立 change），本 change 在升级完成前暂停。

### D2：启用 WAL

**决策**：`PRAGMA journal_mode = WAL` + `PRAGMA synchronous = NORMAL` + `PRAGMA busy_timeout = 5000`。

**理由**：用户会同时用 DBeaver 读写。非 WAL（rollback journal）下读写互相阻塞，DBeaver 的长查询会把应用写操作卡住，反之亦然；WAL 允许读写并行，只有写写需要排队，正是需要的语义。

**代价**：数据分布在 `-wal` / `-shm`，备份不能用「拷 `.db`」（见 D6）。

### D3：落盘语义改为「事务提交即持久」，分两阶段取消 `saveDatabase`

**决策**：

- 阶段一：`saveDatabase()` 保留为空实现（`no-op`，仅 `log.debug`），21 处调用点不动，diff 最小、可随时回退。
- 阶段四：删除 `saveDatabase()` 与全部调用，注释与文档同步更新。

**理由**：先把「驱动替换」和「调用点清理」拆开，避免一次改动同时触碰 85 处 SQL 与 21 处落盘点，回归范围不可控。

**代价**：中间阶段存在一批无意义调用，需要靠 tasks 显式收尾。

### D4：数据访问收敛为四个原语

**决策**：在 `database.ts` 内部提供并只允许业务层使用：

```ts
queryAll<T>(sql: string, params: unknown[], map: (row: Record<string, SqlValue>) => T): T[]
execute(sql: string, params?: unknown[]): { changes: number }
transaction<T>(fn: () => T): T
backupTo(destPath: string): Promise<void>
```

业务函数签名不变；`rowToXxx(row[0], row[1], ...)` 这类按下标取值的映射改为按具名列构造对象。

**理由**：85 处 `exec/run` 若逐处直改，后续再换驱动/加日志/加计时都要重来一遍；收敛在一层后，替换范围只在这一层内部。

**代价**：需要为每个查询写一个 `map` 函数（现有 `rowToKlineData` 等已经存在，改造而非新建）。

### D5：`WriteOptions.target` 保留为「数据库句柄注入」以支撑测试

**决策**：`saveKlineData(..., target?)` / `getLatestTradeDates(..., target?)` 等测试注入口保留，类型由 `sql.js` 的 `Database` 换成引擎的 `Database`；测试改为 `new Database(':memory:')`。

**理由**：现有 8 个测试文件依赖注入内存库验证写语义（UPSERT、当前周期覆盖、最新日查询），这套测试是回归主力，签名不动可最大限度复用。

### D6：备份改用一致性快照

**决策**：`performBackup()` 改为引擎备份（better-sqlite3 用 `db.backup(path)`；WASM 方案用 `VACUUM INTO`），不再 `copyFileSync + rename`。迁移前备份（#2）同样改用引擎备份，避免依赖「无写事务时拷贝」的隐含假设。

**理由**：WAL 下最新事务在 `-wal` 里，直接拷 `.db` 会静默丢数据；引擎备份 API 在运行中也能拿到一致快照，并顺带消除 #3 的 rename。

**代价**：备份耗时略增（逐页读取 vs 文件拷贝），保留最近 3 天的清理逻辑不变。

### D7：迁移脚本与台账

**决策**：`sql/migrations/*.sql` **保持 SQLite 方言不变**，只调整执行方式：`db.exec(script)` 执行多语句；`getUserVersion` 改为查询式读取（`SELECT ... FROM pragma_user_version` 或 `db.pragma('user_version', {simple: true})`）；版本写入用 `db.pragma('user_version = N')`。迁移仍在单个事务内执行，失败回滚。

**理由**：方言不变是本方案相比 PG 的最大优势——不需要重写 DDL，也不存在类型映射问题。

### D8：外部进程共存策略

**决策**：

- 所有写操作经 `busy_timeout = 5000` 等待；超时（`SQLITE_BUSY`）时按「有限重试（3 次，50/150/300ms）→ 记录 error + 用户可见提示」处理，不静默。
- 读操作同样受 `busy_timeout` 保护（WAL 下通常不被阻塞）。
- 不引入应用级数据缓存，界面刷新仍以查询库为准；DBeaver 手改数据后，图表在下次查询（切换周期/股票、窗口重新获得焦点）时可见。

**理由**：与 DBeaver 共存的核心是「等锁 + 明确失败」，而不是「靠约定不同时用」。

**代价**：DBeaver 长时间持有写事务时，应用写入最多等待 5 秒后失败并提示，需要用户在 DBeaver 侧提交或关闭连接。

## Risks / Trade-offs

| 风险 | 影响 | 处置 |
|---|---|---|
| Node/Electron 双 ABI | 单测或 dev 其中之一无法加载模块 | 阶段 0 POC 先验证；不通过则改文件型 WASM（API 同步、无原生二进制） |
| WAL 下直接拷 `.db` 备份 | 备份静默缺最近事务 | 备份统一走引擎快照 API；文档与注释显式写明 |
| 85 处 `exec/run` 改造引入回归 | 查询结果字段错位、类型变化 | 先收敛四个原语；361 个现有用例兜底；重点覆盖 UPSERT、当前周期覆盖、持仓重算 |
| 批量写 fsync 增多 | 批量下载变慢 | 保持 `saveKlineData` 单只事务 + 批次末尾不再整库序列化，整体应更快；实测对比百只股票耗时 |
| DBeaver 长事务导致写超时 | 保存失败并提示 | `busy_timeout` 5s + 有限重试 + 提示用户提交/关闭 DBeaver |
| 回滚到旧版本 | 旧版 sql.js 读取新库 | 格式未变；应用正常退出时 WAL 会 checkpoint 并合并，旧版可直接读取；异常退出后需先用引擎打开一次完成 checkpoint |

## Migration

- 无数据迁移：现有 `.db` 是标准 SQLite 文件，引擎直接打开。
- 首次启动仍执行 `backupBeforeMigration()`（改为引擎快照）后跑迁移。
- 回滚：保留一次发布前的库文件副本；回滚时若存在 `-wal`，先用引擎打开一次触发 checkpoint。
