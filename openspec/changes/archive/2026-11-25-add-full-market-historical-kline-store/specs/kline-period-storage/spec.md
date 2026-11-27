## MODIFIED Requirements

### Requirement: 日/周/月K线使用独立数据表存储

在现有自选股业务库 `stockanalyzer.db` 中，系统 SHALL 使用三张独立且结构完全一致的数据表存储 K 线：`kline_daily`（日线）、`kline_weekly`（周线）、`kline_monthly`（月线）。三张表字段集合 MUST 完全一致，且各自保留唯一约束 `UNIQUE(stock_code, trade_date, adjust_type)`，不得引入 `period` 列。系统 MUST NOT 在该业务库提供跨周期的聚合视图（如 `kline_all`）。该约束 MUST NOT 应用于独立全市场行情库 `market_data.db`；后者采用 `kline_daily_raw + adjust_factors + kline_weekly_raw / kline_monthly_raw` 模型，详见 `market-data-storage`。

#### Scenario: 三表结构一致
- **WHEN** 对 `stockanalyzer.db` 中三张表分别执行 `PRAGMA table_info` 并比较列名集合
- **THEN** 三者列名、类型、顺序完全一致

#### Scenario: 同日同复权的日线与周线互不覆盖
- **WHEN** 某股票某周五在 `stockanalyzer.db` 中同时写入日线记录与周线记录（`trade_date` 相同、`adjust_type` 相同）
- **THEN** 两条记录分别存在于 `kline_daily` 与 `kline_weekly`，互不覆盖

#### Scenario: 不存在聚合视图
- **WHEN** 查询 `stockanalyzer.db` 的数据库对象列表
- **THEN** 不存在名为 `kline_all` 的视图或其他跨周期聚合视图

#### Scenario: 全市场行情库不受三表同构约束
- **WHEN** 检查 `market_data.db` 的行情表结构
- **THEN** 系统不要求 `kline_daily_raw / kline_weekly_raw / kline_monthly_raw` 三表同构，也不要求 `kline_daily_raw` 包含 `adjust_type` 列

### Requirement: 周期到数据表的映射与校验

在现有自选股业务库 `stockanalyzer.db` 中，系统 SHALL 提供唯一的周期到表名映射：`d → kline_daily`、`w → kline_weekly`、`m → kline_monthly`。所有访问该业务库 K 线的数据访问层 MUST 通过该映射获得表名，MUST NOT 将外部传入的字符串直接拼接进 SQL。当周期取值不在合法集合内时，系统 MUST 抛出明确错误 `INVALID_PERIOD: 不支持的K线周期 <值>`，MUST NOT 静默返回空结果。

#### Scenario: 合法周期映射到正确表
- **WHEN** 以周期 `w` 调用 `stockanalyzer.db` 的数据访问层
- **THEN** 实际读写的表为 `kline_weekly`

#### Scenario: 非法周期被拒绝
- **WHEN** 以周期 `y` 或空字符串调用 `stockanalyzer.db` 的数据访问层
- **THEN** 系统抛出 `INVALID_PERIOD` 错误，不执行任何 SQL、不返回空数组

#### Scenario: 表名不来自外部拼接
- **WHEN** 审查 `stockanalyzer.db` 数据访问层的 SQL 构造代码
- **THEN** 所有表名均来自白名单映射常量，不存在直接插值 IPC 入参的字符串拼接

#### Scenario: 全市场行情库不使用该映射
- **WHEN** 访问 `market_data.db` 的行情数据
- **THEN** 系统使用 `market-data-storage` 定义的原始日线、复权因子和派生周期模型，不套用 `d / w / m → kline_daily / kline_weekly / kline_monthly` 映射

### Requirement: 日线专用逻辑固定使用 kline_daily

在现有自选股业务库中，依赖收盘价的既有逻辑 MUST 显式绑定 `stockanalyzer.db` 的 `kline_daily`，不得因周期扩展而改变取数来源。持仓市值与盈亏相关查询 MUST 只从该表取收盘价；K 线形态检测 MUST 只使用该表的日线序列。

#### Scenario: 持仓估值仅使用日线收盘价
- **WHEN** 计算某日期持仓市值，且 `stockanalyzer.db` 中某股票同时存在周线与日线数据
- **THEN** 取用的收盘价来自 `kline_daily`，与周线数据无关

#### Scenario: 形态检测使用日线序列
- **WHEN** 触发某股票的形态检测
- **THEN** 传入的 K 线序列来自 `stockanalyzer.db` 的 `kline_daily`，按交易日升序且相邻记录间隔为日线

#### Scenario: 全市场行情库不参与既有估值与形态检测
- **WHEN** 计算持仓市值或执行形态检测
- **THEN** 系统不读取 `market_data.db`
