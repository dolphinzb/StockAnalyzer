## MODIFIED Requirements

### Requirement: 数据库落盘具备原子性

数据库写入的原子性 SHALL 由嵌入式 SQLite 引擎的事务保证：事务提交即持久化，未提交或失败的写入 MUST NOT 改变磁盘上的数据库内容。系统 MUST NOT 采用「写临时文件后重命名覆盖数据库文件」的方式实现原子性。

#### Scenario: 落盘过程中断
- **WHEN** 数据库写入事务执行过程中应用崩溃或进程被结束
- **THEN** 重启后数据库仍可打开，已提交事务全部保留、未提交事务全部回滚，`PRAGMA integrity_check` 返回 ok

#### Scenario: 外部进程占用数据库文件
- **WHEN** 数据库文件被其他程序（如 DBeaver）打开
- **THEN** 应用的写入按锁等待规则处理，MUST NOT 因文件重命名被拒绝而失败
