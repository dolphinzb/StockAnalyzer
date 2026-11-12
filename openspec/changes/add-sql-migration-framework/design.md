## Context

运行时数据库是 `sql.js` 单文件内存库：启动时把 `~/.stockanalyzer/stockanalyzer.db` 整库读进内存，任何写操作后 `saveDatabase()` 把整个库序列化覆盖回磁盘。没有连接池、没有并发写入、只有一个进程。

结构演进的历史留下了三条并行路径：

1. `electron/database.ts` 里内联 DDL（`KLINE_TABLE_DDL`）与两段探测式迁移（`migrateKlineTables`、`migrateWatchlistSortOrder`），每次启动都做 `PRAGMA` 探测后按需改结构；
2. `sql/init.sql` 的完整建表脚本，但**没有任何运行时代码执行它**；
3. `scripts/init-database.ts`、`scripts/migrate-split-kline-tables.ts` 的手动流程（备份 → 删表重建 → 恢复数据）。

`d9228c9` 把建表从代码搬到 SQL 后，第 1 条的"文件不存在就新建"分支被改成直接抛错，第 3 条的脚本又要求库文件已存在，形成死锁：全新机器无法建库。同时 `sql/init.sql` 不在 electron-builder 的 `files` 白名单里，安装版即使想跑也没有文件可跑。

已与用户确认的前提：**所有在役数据库（含其他机器上的）都已是当前结构**，因此本次不需要兼容历史结构，也不需要探测式补列。

## Goals / Non-Goals

**Goals:**

- 结构定义的唯一事实源：`sql/migrations/NNN_name.sql`，`001_init.sql` 即当前结构（V1）。
- 启动时自动把库升到最新版本，安装版全新机器能自建库、老机器能按版本补齐。
- 迁移失败不破坏磁盘数据：失败不落盘、迁移前有备份、落盘本身原子。
- 删除所有并行的结构维护路径，使"改结构"只有一种做法。

**Non-Goals:**

- 不支持 TS 型迁移（数据变换钩子）。当前的迁移全部是 DDL 与简单 `INSERT`，`transfer_records.account_balance` 之类的过程式重算不属于本次范围。
- 不提供 `--migrate` / `--dry-run` CLI。执行器设计成可复用，将来需要再加入口。
- 不做多实例/并发迁移保护（单进程桌面应用，且 `sql.js` 无文件锁语义）。
- 不引入 `schema_history` 表、不记录迁移耗时与校验和。
- 不兼容 V1 之前的历史结构（已确认在役库均为当前结构）。

## Decisions

### 1. 版本台账用 `PRAGMA user_version`

SQLite 自带的 `user_version` 是 4 字节整数，存在数据库头里，读写都是一行 PRAGMA。相比自建 `schema_history` 表：不用为"元表自身"设计迁移、不用考虑元表被用户误删、写入天然随事务提交。

代价：没有 `applied_at`、执行耗时、校验和。对本项目（单机、单个开发者维护）这些审计信息没有消费方，需要时可以升到 2 版结构。

*备选*：`schema_history(version, name, applied_at)` 表 —— 信息更全，但多一张表、多一层"表不存在怎么办"的分支。

### 2. 迁移以独立 `.sql` 文件存在，不内联进 TS

内联字符串无法被 SQL 高亮/格式化/独立 review，也无法被 `grep` 定位；而本仓库已经有过"内联 DDL 与 `init.sql` 两份定义漂移"的教训（`database.ts` 里那段注释就是提醒要两边同步）。

*备选*：构建期把 SQL 内联成 TS 模块 —— 打包最稳，但引入代码生成、`gitignore`、测试前置构建等一串问题。权衡后选择"文件 + 构建期复制"。

### 3. 迁移文件通过构建期复制进入 `dist-electron/sql/migrations/`

`tsc` 不会复制非 TS 资源，因此在 `build:electron` 前置一个 `scripts/copy-migrations.mjs`，把 `sql/migrations/` 复制到 `dist-electron/sql/migrations/`。`dist-electron/**/*` 本来就在 electron-builder 的 `files` 白名单内，Electron 对 asar 内的 `readFileSync` 是透明的，因此打包后可直接读。

运行时按候选路径依次探测，取第一个存在的：

1. `<__dirname>/../sql/migrations` → `dist-electron/sql/migrations`（编译产物 / 安装版）
2. `<__dirname>/../../sql/migrations` → 仓库 `sql/migrations`（vitest 直接跑 TS 源码时）
3. `<process.resourcesPath>/sql/migrations` → 预留 future `extraResources`

全部不存在则启动失败并在错误信息里列出尝试过的路径。

*备选 A*：`extraResources` + `process.resourcesPath` —— 运行时路径随打包方式变化，且要在两处 electron-builder 配置里同步。
*备选 B*：内联成 TS —— 见决策 2。

### 4. 存量库按"盖章基线"处理

启动时若 `user_version = 0` 且库中已存在业务表，则只写 `user_version = 1`，**不执行** `001_init.sql`。判定依据是 `sqlite_master` 中是否存在业务表，而不是文件大小——用户手动建的空文件会走"新库"分支全量建表。

*备选*：探测历史形状并映射到起始版本 —— 在役库均为当前结构（已确认），这套映射只会变成无人验证的死代码。

### 5. 整批迁移一个事务，成功后统一落盘

`sql.js` 的持久化点是 `db.export()`，中间提交毫无意义。因此把"本次所有待执行迁移 + 每次的 `user_version` 更新"包进一个事务：成功 → 提交 → 原子落盘；失败 → `ROLLBACK` → 内存库丢弃 → 磁盘文件根本没被触碰。

*备选*：每个迁移独立提交（Flyway 的做法）—— 适合有独立连接的数据库，在这里只会增加"落盘到一半"的窗口。

### 6. `saveDatabase()` 改为原子写

先写 `<dbPath>.tmp`，`fsync` 由 `rename` 前的写入完成，再 `renameSync` 覆盖目标。Windows 下 Node 的 `rename` 走 `MoveFileExW(MOVEFILE_REPLACE_EXISTING)`，可覆盖目标文件。这样即使写盘过程崩溃，原库文件仍是上一个完整版本。

### 7. 迁移前备份，保留最近 5 份

仅当"文件已存在且本次有待执行迁移"时，把数据库文件的**字节副本**存为 `stockanalyzer.db.bak-<yyyyMMdd-HHmmss>`（即迁移前那一刻的完整库文件），并只保留最近 5 份。

它与已有的每日备份是两种东西，互不复用：

| | 迁移备份 | `backupService` 每日备份 |
|---|---|---|
| 触发 | 仅当本次有待执行迁移 | 每天 15:30 |
| 命名 | `stockanalyzer.db.bak-<yyyyMMdd-HHmmss>` | `stockanalyzer_YYYYMMDD.db` |
| 保留 | 最近 5 份 | 最近 3 天 |
| 用途 | 回到"迁移前那一刻" | 日常容灾 |

不能复用每日备份的原因有两个：一是每日备份可能当天早已跑过，无法代表迁移前状态；二是 `backupService` 的清理正则是 `^stockanalyzer_\d{8}(?:_\d{3})?\.db$`，若迁移备份沿用该命名，会在 3 天后被自动清理，而"迁移后几天才发现问题"正是需要它的场景。因此迁移备份采用独立命名，并自带 5 份上限的清理逻辑。

### 8. 初始化失败必须可见

`initDatabase()` 继续抛错，由 `electron/index.ts` 的 `whenReady` 捕获：`dialog.showErrorBox` 展示库路径、迁移目录、备份路径与错误摘要，然后 `app.quit()`。不保留"静默给个空库"的兜底——那会让应用带着残缺库继续运行，用户看到的是后续每个页面报错。

## Risks / Trade-offs

- **[安装版读不到迁移文件]** → 构建期复制与 `files` 白名单双重保证；运行时探测失败直接抛错（fail fast），错误信息列出全部候选路径；新增的 `tests/unit/migrations.test.ts` 覆盖"目录不存在"的分支。
- **[老库形状并非当前结构，盖章后查询报 `no such column`]** → 已与用户确认在役库均为当前结构；启动日志记录迁移目录、`user_version` 与本次应用的文件列表，便于定位。
- **[备份无限累积占磁盘]** → 保留最近 5 份，超出按修改时间删除。
- **[`rename` 在 Windows 上失败（目标被占用）]** → 错误向上抛，启动失败而非静默降级；此时磁盘文件仍是旧的完整版本，可用备份恢复。
- **[迁移文件自带 BEGIN/COMMIT，与外层事务冲突]** → `001_init.sql` 头部注释与 spec 明确禁止；执行器遇到 `cannot start a transaction within a transaction` 会整体回滚并报错。
- **[删掉旧迁移后，万一存在未预期形状的库就再无自愈能力]** → 这是本次明确接受的取舍；回滚路径是"用备份覆盖库文件 + 回退到旧版本应用"。

## Migration Plan

1. **上线前**：把 `sql/init.sql` 内容原样迁到 `sql/migrations/001_init.sql`，删除 `sql/init.sql`；`build:electron` 加入复制步骤。
2. **首次启动（存量库）**：`user_version` 0 → 1，只写版本号，不执行 DDL；日志出现"基线标记完成"。
3. **首次启动（全新机器）**：无库文件 → 执行 `001` → 建表 + 写入默认配置 → 原子落盘。
4. **验证**：`PRAGMA user_version` 为 1；表与索引齐全；`npm run typecheck` 与 `npm run test` 通过；用 `npm run build` 后检查 `dist-electron/sql/migrations/001_init.sql` 存在。
5. **回滚**：旧版本代码不读 `user_version`，因此可直接回退应用；若迁移已改变结构，用 `stockanalyzer.db.bak-<ts>` 覆盖 `stockanalyzer.db` 即可回到迁移前状态。

## Open Questions

- 将来出现过程式数据变换需求时，是扩展成"SQL + 可选 TS 钩子"，还是转为一次性的手工脚本。

已确认的决策：迁移备份保留 5 份；`001_init.sql` 保留末尾的 `INSERT OR IGNORE INTO config`，使新库首次启动即带默认配置。
