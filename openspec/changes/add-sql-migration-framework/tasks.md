## 1. 迁移文件落地

- [x] 1.1 新增 `sql/migrations/001_init.sql`：内容取自现有 `sql/init.sql`（表、索引、默认配置插入），并补充头部注释说明"V1 基线、禁止自带 BEGIN/COMMIT"
- [x] 1.2 删除 `sql/init.sql`，确认仓库内无代码再引用该路径

## 2. 迁移执行器

- [x] 2.1 新增 `electron/migrations.ts`：实现 `getMigrationsDir()`，按「编译产物相邻 → 仓库根 → 资源目录」顺序探测，全部缺失时报错并列出尝试过的路径
- [x] 2.2 实现 `listMigrations(dir?)`：按 `NNN_name.sql` 解析版本号与名称，校验命名不合规、版本号重复，按版本号升序返回
- [x] 2.3 实现 `getUserVersion` / `setUserVersion` / `hasUserTables` 三个基础设施函数（`PRAGMA user_version` 与 `sqlite_master` 查询）
- [x] 2.4 实现 `getPendingMigrations(db, dir?)`：返回版本号大于当前 `user_version` 的迁移
- [x] 2.5 实现 `runMigrations(db, { isNewDatabase, dir? })`：`user_version=0` 且已有业务表时只写 1（基线标记）；其余情况在单事务内执行待应用迁移并逐个更新版本号，失败 `ROLLBACK` 并抛出
- [x] 2.6 导出执行结果（起始版本、结束版本、本次应用的文件列表、是否走基线标记），供日志与测试使用

## 3. 主进程初始化改造

- [x] 3.1 重写 `electron/database.ts` 的 `initDatabase()`：确保目录 → 加载或新建内存库 → 计算待执行迁移 → 需要时先备份 → 执行迁移 → 有变更则落盘
- [x] 3.2 新增迁移前备份与保留策略：`stockanalyzer.db.bak-<时间戳>`，仅保留最近 5 份
- [x] 3.3 删除 `KLINE_TABLE_DDL`、`hasDbObject`、`countTableRows`、`migrateKlineTables`、`migrateWatchlistSortOrder`
- [x] 3.4 `saveDatabase()` 改为原子写：写 `.tmp` 后 `rename` 覆盖，失败时不影响原文件

## 4. 启动失败处理

- [x] 4.1 `electron/index.ts` 的 `whenReady` 包裹数据库初始化：失败时 `dialog.showErrorBox` 展示库路径、迁移目录、备份路径与错误摘要，随后 `app.quit()`
- [x] 4.2 确认失败分支不会继续执行窗口创建、托盘、调度器初始化

## 5. 打包与命令清理

- [x] 5.1 新增 `scripts/copy-migrations.mjs`，把 `sql/migrations/` 复制到 `dist-electron/sql/migrations/`
- [x] 5.2 `package.json` 的 `build:electron` 前置执行复制脚本
- [x] 5.3 删除 `scripts/init-database.ts`、`scripts/migrate-split-kline-tables.ts` 及 npm 命令 `init-db`、`migrate-kline-tables`

## 6. 测试

- [x] 6.1 新增 `tests/unit/migrations.test.ts`：新库全量执行、存量库基线标记不执行 001、已最新时不产生变更、版本号重复/命名不合规报错、迁移失败回滚且不留半态、迁移目录缺失报错
- [x] 6.2 改造 `tests/unit/klinePeriodOverwrite.test.ts`：改用 `runMigrations` 在内存库建表，移除对 `KLINE_TABLE_DDL` 的依赖
- [x] 6.3 改造 `tests/unit/watchlistSortMigration.test.ts`：夹具改用 V1 结构建库，删除两条"旧库回填 `sort_order`"用例，保留排序、持久化、新增、删除语义
- [x] 6.4 补充 `initDatabase` 行为测试：无库文件时自建并可读写、存量库首启写入 `user_version = 1`、二次启动不重复落盘

## 7. 验收

- [x] 7.1 `npm run typecheck` 通过
- [x] 7.2 `npm run test` 通过
- [x] 7.3 `npm run build` 后确认 `dist-electron/sql/migrations/001_init.sql` 存在
- [ ] 7.4 用真实库启动一次，确认日志显示基线标记、`user_version` 为 1，且自选股/持仓/K 线页面数据正常
