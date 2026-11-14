## Why

数据库初始化与结构演进目前是两套互相矛盾的做法：`d9228c9` 把建表逻辑从代码移到 SQL 文件后，运行时不再建库，也没有任何人能可靠地执行那份 SQL（`npm run init-db` 的路径解析错误且要求库文件已存在，`sql/init.sql` 又不在打包白名单内），导致全新机器无法建库；与此同时，存量库的结构变更靠 `electron/database.ts` 里两段内嵌的探测式迁移和 `scripts/` 下手动脚本维持。同一个结构事实有两处定义、三条执行路径，出错时无版本记录、无审计、不可复现。

## What Changes

- 新增 `sql/migrations/NNN_name.sql` 作为**唯一**结构事实源；`001_init.sql` 即当前线上库结构，作为 V1 基线；删除 `sql/init.sql`。
- 新增启动期迁移执行器 `electron/migrations.ts`：按文件名版本号升序执行未应用的迁移，用 `PRAGMA user_version` 记录已应用版本。
- 存量库（`user_version = 0` 且已存在业务表）视为 V1：只写入版本号，不重复执行 `001`。库文件不存在或为空文件时按 V1 全量建库。
- `initDatabase()` 重写为「加载或新建 → 迁移前备份 → 单事务执行 → 原子落盘」，任一步失败不写盘。
- `saveDatabase()` 改为原子写（先写 `.tmp` 再 `rename`），避免覆盖唯一副本时崩溃损坏数据库。
- 构建期把 `sql/migrations/` 复制到 `dist-electron/sql/migrations/`，确保安装版能读到迁移文件。
- 启动失败时弹出错误提示并退出，不再出现"无窗口但仍驻留"的进程。
- **BREAKING**：删除内嵌迁移 `KLINE_TABLE_DDL`、`migrateKlineTables`、`migrateWatchlistSortOrder`，删除手动脚本 `scripts/init-database.ts`、`scripts/migrate-split-kline-tables.ts` 及 npm 命令 `init-db`、`migrate-kline-tables`；不再支持"备份 → 删表重建 → 恢复数据"的升级方式。
- **BREAKING**：结构变更必须新增迁移文件，不再允许在启动代码里写探测式补列逻辑。

## Capabilities

### New Capabilities

- `database-schema-migration`: 数据库结构的版本化迁移，涵盖迁移文件命名与内容约束、启动期执行顺序、版本台账（`user_version`）、存量库基线判定、迁移前备份与失败回滚等数据安全要求。

### Modified Capabilities

<!-- 无：现有 specs 目录中没有描述数据库初始化的能力，本次不修改既有需求 -->

## Impact

- **主进程**：`electron/database.ts`（`initDatabase` / `saveDatabase` 重写，删除 3 处内嵌迁移）、`electron/migrations.ts`（新增）、`electron/index.ts`（启动失败处理）
- **SQL**：`sql/migrations/001_init.sql`（新增，内容来自 `sql/init.sql`）、`sql/init.sql`（删除）
- **脚本与构建**：`scripts/copy-migrations.mjs`（新增）、`scripts/init-database.ts`（删除）、`scripts/migrate-split-kline-tables.ts`（删除）、`package.json`（`build:electron` 增加复制步骤，删除两个迁移命令）
- **测试**：`tests/unit/migrations.test.ts`（新增）、`tests/unit/klinePeriodOverwrite.test.ts`、`tests/unit/watchlistSortMigration.test.ts`（改造）
- **用户数据**：`~/.stockanalyzer/stockanalyzer.db` 在首次以新版本启动时会被写入 `user_version`，并在需要执行迁移时生成 `stockanalyzer.db.bak-<时间戳>` 备份
- **依赖**：无新增第三方依赖，继续使用 `sql.js` + `fs`
