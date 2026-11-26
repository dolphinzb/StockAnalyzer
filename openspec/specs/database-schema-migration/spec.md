# Spec: 数据库结构版本化迁移

**Capability**: database-schema-migration  
**Status**: Active  
**Last Updated**: 2026-11-25

## Purpose

本规格定义数据库结构的版本化迁移机制，涵盖迁移文件命名与内容约束、启动期执行顺序、版本台账（`PRAGMA user_version`）、存量库基线判定、迁移执行原子性与失败回滚、迁移前备份、落盘原子性、迁移文件打包与初始化失败的用户可见性。业务库 `stockanalyzer.db` 使用 `sql/migrations/`，全市场行情库 `market_data.db` 使用 `sql/market-migrations/`，两个目录各自是对应数据库结构的唯一事实来源。
## Requirements
### Requirement: 结构变更以版本化迁移文件表达
系统 SHALL 以版本化迁移文件作为数据库结构的唯一事实来源。业务库 `stockanalyzer.db` SHALL 使用 `sql/migrations/`，全市场行情库 `market_data.db` SHALL 使用 `sql/market-migrations/`；每个目录内的文件 MUST 遵循 `NNN_name.sql`，其中 `NNN` 为三位数字版本号、`name` 为小写字母数字下划线组合。两个目录的版本号相互独立。系统 MUST NOT 允许修改任一目录中已发布的迁移文件，新的结构变更 MUST 通过对应目录中新增版本号更大的文件表达，且 MUST NOT 在启动代码中内联 DDL。

#### Scenario: 新增结构变更
- **WHEN** 任一数据库需要新增表、列或索引
- **THEN** 系统在对应迁移目录新增 `NNN_name.sql` 文件，不修改已发布文件，也不在启动代码中内联 DDL

#### Scenario: 新增行情库结构变更
- **WHEN** 需要新增 `market_data.db` 的表、列或索引
- **THEN** 系统在 `sql/market-migrations/` 中新增迁移文件，且不影响 `sql/migrations/` 的版本序列

#### Scenario: 迁移文件名不合规
- **WHEN** `sql/migrations/` 或 `sql/market-migrations/` 中存在不符合 `NNN_name.sql` 命名的文件
- **THEN** 迁移执行失败并报错，错误信息包含该文件名

#### Scenario: 版本号重复
- **WHEN** 同一迁移目录中存在两个版本号相同的文件
- **THEN** 迁移执行失败并报错，错误信息指出重复的版本号

### Requirement: 启动时按版本顺序执行未应用的迁移
系统 SHALL 在每次启动初始化每个数据库时，分别读取该数据库自身的 `PRAGMA user_version` 作为已应用版本，并按该数据库对应迁移目录中的版本号升序执行所有版本号大于它的迁移文件；每执行完一个迁移，系统 MUST 把该数据库的 `user_version` 更新为该迁移的版本号。

#### Scenario: 全新机器首次启动
- **WHEN** 数据库文件不存在或为空文件
- **THEN** 系统按该数据库对应迁移目录的版本号升序执行从 `001` 到最新的全部迁移，完成后其 `user_version` 等于最新版本号

#### Scenario: 库已是最新版本
- **WHEN** 某数据库的 `user_version` 等于其迁移目录中的最大版本号
- **THEN** 系统不对该数据库执行迁移，也不触发该数据库落盘

#### Scenario: 跨多个版本升级
- **WHEN** 某数据库 `user_version` 为 1 而其迁移目录中最大版本号为 3
- **THEN** 系统依次执行版本 2、3 的迁移，执行完成后该数据库 `user_version` 为 3

#### Scenario: 业务库与行情库版本独立
- **WHEN** `stockanalyzer.db` 的 `user_version` 为 3 且 `market_data.db` 的 `user_version` 为 1
- **THEN** 系统分别按 `sql/migrations/` 与 `sql/market-migrations/` 执行待迁移项，两个版本互不覆盖

### Requirement: 存量库按基线标记处理
当 `user_version` 为 0 且数据库中已存在业务表时，系统 SHALL 把该库视为 V1 基线，仅把 `user_version` 写为 1，MUST NOT 执行 `001_init.sql`。

#### Scenario: 存量库首次以新版本启动
- **WHEN** 数据库文件已存在、包含业务表且 `user_version` 为 0
- **THEN** 系统仅写入 `user_version = 1`，不执行 `001_init.sql`，库中既有数据保持不变

#### Scenario: 只有结构没有业务表的空库
- **WHEN** 数据库文件存在但 `sqlite_master` 中没有任何业务表
- **THEN** 系统按新库处理，执行从 `001` 起的全部迁移

### Requirement: 迁移执行具备原子性与失败安全性
系统 SHALL 把本次待执行的全部迁移与对应的 `user_version` 更新放在同一个事务中，全部成功后才落盘。任一迁移失败时系统 MUST 回滚事务且不写磁盘，磁盘上的数据库文件 MUST 保持迁移前的状态。

#### Scenario: 某个迁移执行失败
- **WHEN** 批次中任一迁移的 SQL 执行报错
- **THEN** 系统回滚事务、不落盘、记录错误日志并向上抛出异常，数据库文件内容与启动前一致

#### Scenario: 落盘失败
- **WHEN** 迁移已提交但写入磁盘失败
- **THEN** 系统记录错误并向上抛出异常，MUST NOT 把不完整的写入结果当作成功

### Requirement: 迁移前生成可恢复备份
系统 SHALL 在业务库 `stockanalyzer.db` 已存在且有待执行迁移时，先把该文件复制为 `stockanalyzer.db.bak-<yyyyMMdd-HHmmss>` 备份，并仅保留最近 5 份迁移备份。全市场行情库 `market_data.db` MUST NOT 生成迁移前整库备份；其迁移失败由事务回滚保证结构一致性，行情数据可从数据源重建。

#### Scenario: 执行迁移前备份
- **WHEN** 检测到业务库 `stockanalyzer.db` 有待执行迁移且该文件存在
- **THEN** 系统在执行迁移前生成 `stockanalyzer.db.bak-<ts>`，备份内容与迁移前一致

#### Scenario: 行情库不生成迁移前备份
- **WHEN** 检测到 `market_data.db` 有待执行迁移
- **THEN** 系统不生成 `market_data.db.bak-*`，直接在同一事务中执行迁移与版本更新

#### Scenario: 备份数量收敛
- **WHEN** `stockanalyzer.db` 的迁移备份文件超过 5 份
- **THEN** 系统按修改时间删除最旧的备份，仅保留最近 5 份

#### Scenario: 无需迁移时不备份
- **WHEN** 业务库本次没有待执行迁移
- **THEN** 系统不生成新的迁移备份

### Requirement: 数据库落盘具备原子性

数据库写入的原子性 SHALL 由嵌入式 SQLite 引擎的事务保证：事务提交即持久化，未提交或失败的写入 MUST NOT 改变磁盘上的数据库内容。系统 MUST NOT 采用「写临时文件后重命名覆盖数据库文件」的方式实现原子性。

#### Scenario: 落盘过程中断
- **WHEN** 数据库写入事务执行过程中应用崩溃或进程被结束
- **THEN** 重启后数据库仍可打开，已提交事务全部保留、未提交事务全部回滚，`PRAGMA integrity_check` 返回 ok

#### Scenario: 外部进程占用数据库文件
- **WHEN** 数据库文件被其他程序（如 DBeaver）打开
- **THEN** 应用的写入按锁等待规则处理，MUST NOT 因文件重命名被拒绝而失败

### Requirement: 安装版可读取迁移文件
系统 SHALL 保证打包产物中同时包含 `sql/migrations/` 与 `sql/market-migrations/`，并在运行时按数据库类型定位对应迁移目录：业务库使用编译产物相邻、源码仓库或应用资源目录下的 `sql/migrations`；行情库使用相同候选规则下的 `sql/market-migrations`。

#### Scenario: 安装版启动
- **WHEN** 应用以打包形态启动
- **THEN** 系统能从打包产物内定位到两个迁移目录并读取到迁移文件

#### Scenario: 行情库迁移目录缺失
- **WHEN** 行情库的所有候选迁移目录都不存在
- **THEN** 行情库初始化失败，错误信息列出尝试过的全部路径

#### Scenario: 迁移目录缺失
- **WHEN** 业务库的所有候选迁移目录都不存在
- **THEN** 系统初始化失败，错误信息列出尝试过的全部路径

### Requirement: 数据库初始化失败对用户可见
系统 SHALL 在数据库初始化失败时向用户展示错误提示，包含数据库路径与备份路径，并退出应用，MUST NOT 在无窗口的情况下继续驻留。

#### Scenario: 初始化失败
- **WHEN** 启动阶段数据库初始化抛出异常
- **THEN** 系统弹出错误提示框说明失败原因与库文件位置，随后退出应用

