## MODIFIED Requirements

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

### Requirement: 迁移前生成可恢复备份

系统 SHALL 在业务库 `stockanalyzer.db` 已存在且有待执行迁移时，先把该文件复制为 `stockanalyzer.db.bak-<yyyyMMdd-HHmmss>` 备份，并仅保留最近 5 份迁移备份。全市场行情库 `market_data.db` MUST NOT 生成迁移前整库备份；其迁移失败由事务回滚保证结构一致性，行情数据可从数据源重建。

#### Scenario: 执行迁移前备份
- **WHEN** 检测到业务库有待执行迁移且 `stockanalyzer.db` 存在
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
