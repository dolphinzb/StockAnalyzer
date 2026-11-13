# Spec: 数据库结构版本化迁移

**Capability**: database-schema-migration  
**Status**: Active  
**Last Updated**: 2026-11-13

## Purpose

本规格定义数据库结构的版本化迁移机制，涵盖迁移文件命名与内容约束、启动期执行顺序、版本台账（`PRAGMA user_version`）、存量库基线判定、迁移执行原子性与失败回滚、迁移前备份、落盘原子性、迁移文件打包与初始化失败的用户可见性。`sql/migrations/` 目录是数据库结构的唯一事实来源。

## Requirements

### Requirement: 结构变更以版本化迁移文件表达
系统 SHALL 以 `sql/migrations/` 目录下的 `NNN_name.sql` 文件作为数据库结构的唯一事实来源，其中 `NNN` 为三位数字版本号、`name` 为小写字母数字下划线组合。系统 MUST NOT 允许修改已发布的迁移文件，新的结构变更 MUST 通过新增版本号更大的文件表达，且 MUST NOT 在启动代码中内联 DDL。

#### Scenario: 新增结构变更
- **WHEN** 需要新增表、列或索引
- **THEN** 以新增 `NNN_name.sql` 文件表达，不修改已发布文件，也不在启动代码中内联 DDL

#### Scenario: 迁移文件名不合规
- **WHEN** `sql/migrations/` 中存在不符合 `NNN_name.sql` 命名的文件
- **THEN** 迁移执行失败并报错，错误信息包含该文件名

#### Scenario: 版本号重复
- **WHEN** `sql/migrations/` 中存在两个版本号相同的文件
- **THEN** 迁移执行失败并报错，错误信息指出重复的版本号

### Requirement: 启动时按版本顺序执行未应用的迁移
系统 SHALL 在每次启动初始化数据库时读取 `PRAGMA user_version` 作为已应用版本，并按版本号升序执行所有版本号大于它的迁移文件；每执行完一个迁移，系统 MUST 把 `user_version` 更新为该迁移的版本号。

#### Scenario: 全新机器首次启动
- **WHEN** 数据库文件不存在或为空文件
- **THEN** 系统按版本号升序执行从 `001` 到最新的全部迁移，完成后 `user_version` 等于最新版本号

#### Scenario: 库已是最新版本
- **WHEN** `user_version` 等于迁移目录中的最大版本号
- **THEN** 系统不执行任何迁移，也不触发数据库落盘

#### Scenario: 跨多个版本升级
- **WHEN** `user_version` 为 1 而迁移目录中最大版本号为 3
- **THEN** 系统依次执行版本 2、3 的迁移，执行完成后 `user_version` 为 3

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
系统 SHALL 在数据库文件已存在且本次有待执行迁移时，先把文件复制为 `stockanalyzer.db.bak-<yyyyMMdd-HHmmss>` 备份，并只保留最近 5 份迁移备份。

#### Scenario: 执行迁移前备份
- **WHEN** 检测到待执行迁移且数据库文件存在
- **THEN** 系统在执行迁移前生成时间戳备份，备份内容与迁移前的数据库文件一致

#### Scenario: 备份数量收敛
- **WHEN** 迁移备份文件超过 5 份
- **THEN** 系统按修改时间删除最旧的备份，仅保留最近 5 份

#### Scenario: 无需迁移时不备份
- **WHEN** 本次没有待执行迁移
- **THEN** 系统不生成新的迁移备份

### Requirement: 数据库落盘具备原子性
系统 SHALL 在保存数据库时先写入临时文件再重命名覆盖目标文件，使写入中途失败时原数据库文件仍是上一个完整版本。

#### Scenario: 落盘过程中断
- **WHEN** 数据库序列化写入临时文件的过程中发生异常
- **THEN** 目标数据库文件不被截断或覆盖，仍可被再次加载

### Requirement: 安装版可读取迁移文件
系统 SHALL 保证打包产物中包含迁移文件，并在运行时按候选路径依次定位迁移目录：编译产物相邻的 `sql/migrations`、源码仓库的 `sql/migrations`、应用资源目录下的 `sql/migrations`。

#### Scenario: 安装版启动
- **WHEN** 应用以打包形态启动
- **THEN** 系统能从打包产物内定位到迁移目录并读取到迁移文件

#### Scenario: 迁移目录缺失
- **WHEN** 所有候选路径都不存在
- **THEN** 系统初始化失败，错误信息列出尝试过的全部路径

### Requirement: 数据库初始化失败对用户可见
系统 SHALL 在数据库初始化失败时向用户展示错误提示，包含数据库路径与备份路径，并退出应用，MUST NOT 在无窗口的情况下继续驻留。

#### Scenario: 初始化失败
- **WHEN** 启动阶段数据库初始化抛出异常
- **THEN** 系统弹出错误提示框说明失败原因与库文件位置，随后退出应用
