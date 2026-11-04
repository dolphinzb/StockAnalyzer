# Spec: K线多周期分表存储

**Capability**: kline-period-storage
**Status**: Active
**Last Updated**: 2026-11-04

## Purpose

本规格定义日线、周线、月线K线的存储模型。系统使用三张结构一致的数据表分别承载不同周期，通过单一的周期→表名白名单映射完成读写，并将存量的单表数据迁移到新的日线表。持仓估值、形态检测等只依赖日线的逻辑必须显式绑定日线表，避免被其他周期数据污染。

## Requirements

### Requirement: 日/周/月K线使用独立数据表存储

系统 SHALL 使用三张独立且结构完全一致的数据表存储K线：`kline_daily`（日线）、`kline_weekly`（周线）、`kline_monthly`（月线）。三张表字段集合 MUST 完全一致，且各自保留唯一约束 `UNIQUE(stock_code, trade_date, adjust_type)`，不得引入 `period` 列。系统 MUST NOT 提供跨周期的聚合视图（如 `kline_all`）。

#### Scenario: 三表结构一致
- **WHEN** 对三张表分别执行 `PRAGMA table_info` 并比较列名集合
- **THEN** 三者列名、类型、顺序完全一致

#### Scenario: 同日同复权的日线与周线互不覆盖
- **WHEN** 某股票某周五同时写入日线记录与周线记录（`trade_date` 相同、`adjust_type` 相同）
- **THEN** 两条记录分别存在于 `kline_daily` 与 `kline_weekly`，互不覆盖

#### Scenario: 不存在聚合视图
- **WHEN** 查询数据库对象列表
- **THEN** 不存在名为 `kline_all` 的视图或其他跨周期聚合视图

### Requirement: 周期到数据表的映射与校验

系统 SHALL 提供唯一的周期到表名映射：`d → kline_daily`、`w → kline_weekly`、`m → kline_monthly`。所有数据访问层 MUST 通过该映射获得表名，MUST NOT 将外部传入的字符串直接拼接进 SQL。当周期取值不在合法集合内时，系统 MUST 抛出明确错误 `INVALID_PERIOD: 不支持的K线周期 <值>`，MUST NOT 静默返回空结果。

#### Scenario: 合法周期映射到正确表
- **WHEN** 以周期 `w` 调用数据访问层
- **THEN** 实际读写的表为 `kline_weekly`

#### Scenario: 非法周期被拒绝
- **WHEN** 以周期 `y` 或空字符串调用数据访问层
- **THEN** 系统抛出 `INVALID_PERIOD` 错误，不执行任何 SQL、不返回空数组

#### Scenario: 表名不来自外部拼接
- **WHEN** 审查数据访问层的 SQL 构造代码
- **THEN** 所有表名均来自白名单映射常量，不存在直接插值 IPC 入参的字符串拼接

### Requirement: 存量单表数据迁移到 kline_daily

系统 MUST 提供迁移脚本，将存量的 `kline_data` 表通过 `ALTER TABLE ... RENAME TO kline_daily` 改名，并创建 `kline_weekly`、`kline_monthly` 及三张表的索引。迁移 MUST 完整保留存量日线数据，MUST NOT 触发任何K线重新下载。迁移 MUST 幂等：在已迁移的数据库上重复执行不得报错、不得丢失或重复数据。

#### Scenario: 首次迁移保留全部日线数据
- **WHEN** 在含 `kline_data` 的存量库上执行迁移脚本，且迁移前该表有 10000 行
- **THEN** 迁移后 `kline_daily` 存在且有 10000 行，`kline_data` 不存在，`kline_weekly` 与 `kline_monthly` 已创建且为空

#### Scenario: 重复执行迁移不报错
- **WHEN** 在已迁移完成的数据库上再次执行迁移脚本
- **THEN** 脚本正常退出，三张表数据量不变，不产生重复索引或重复数据

#### Scenario: 行数校验失败时回滚
- **WHEN** 迁移完成后 `kline_daily` 行数与迁移前 `kline_data` 行数不一致
- **THEN** 脚本从备份还原数据库文件并以非零状态退出，同时输出错误信息

#### Scenario: 迁移前自动备份
- **WHEN** 迁移脚本在检测到需要迁移时开始执行
- **THEN** 先复制数据库文件为带时间戳的 `.bak-<ts>` 备份，再执行改名操作

### Requirement: 日线专用逻辑固定使用 kline_daily

依赖收盘价的既有逻辑 MUST 显式绑定日线表，不得因周期扩展而改变取数来源。持仓市值与盈亏相关查询 MUST 只从 `kline_daily` 取收盘价；K线形态检测 MUST 只使用日线序列。

#### Scenario: 持仓估值仅使用日线收盘价
- **WHEN** 计算某日期持仓市值，且该股票同时存在周线与日线数据
- **THEN** 取用的收盘价来自 `kline_daily`，与周线数据无关

#### Scenario: 形态检测使用日线序列
- **WHEN** 触发某股票的形态检测
- **THEN** 传入的K线序列来自 `kline_daily`，按交易日升序且相邻记录间隔为日线
