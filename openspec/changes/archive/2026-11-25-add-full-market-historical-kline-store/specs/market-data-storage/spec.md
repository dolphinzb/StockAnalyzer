## ADDED Requirements

### Requirement: 全市场行情使用独立数据库

系统 SHALL 使用独立的 `~/.stockanalyzer/market_data.db` 保存全市场行情数据。该数据库 MUST 与 `stockanalyzer.db` 分离，且本 change MUST NOT 修改现有自选股下载、图表展示、资金估值和形态识别的读取路径。

#### Scenario: 新库独立创建
- **WHEN** 应用启动且 `market_data.db` 不存在
- **THEN** 系统创建该文件并通过 `sql/market-migrations/` 初始化其结构，`stockanalyzer.db` 不受影响

#### Scenario: 现有读取路径不变
- **WHEN** 用户打开现有自选股 K 线图表
- **THEN** 系统仍从 `stockanalyzer.db` 的既有 K 线表读取数据，不从 `market_data.db` 读取

#### Scenario: 新库周/月表名与业务库区分
- **WHEN** 同时检查 `stockanalyzer.db` 与 `market_data.db`
- **THEN** 业务库使用 `kline_weekly / kline_monthly`，新库使用 `kline_weekly_raw / kline_monthly_raw`

### Requirement: 原始日线是唯一事实源

系统 SHALL 使用 `kline_daily_raw` 表保存原始日线，主键为 `(stock_code, trade_date)`。该表 MUST NOT 包含 `adjust_type` 列，且前复权与后复权全字段数据 MUST NOT 作为事实行写入该表。

#### Scenario: 同一交易日只存一行原始日线
- **WHEN** 同一股票同一交易日分别下载到不复权、前复权、后复权数据
- **THEN** `kline_daily_raw` 仅新增或更新一行原始价记录，复权信息只进入 `adjust_factors`

#### Scenario: 原始日线重复入库幂等
- **WHEN** 同一股票同一交易日被重复下载
- **THEN** `kline_daily_raw` 行数不变，行情字段与 `fetched_at` 被更新

#### Scenario: 保留数据源口径字段
- **WHEN** 数据源返回 `change_percent`、`change_amount`、`amplitude`、`turnover_rate`
- **THEN** 系统将这些字段原样写入 `kline_daily_raw`，不在存储层基于前一日收盘价重新计算

### Requirement: 复权因子按股票全量替换

系统 SHALL 使用 `adjust_factors` 表保存每只股票每个交易日的 `qfq_factor` 与 `hfq_factor`，并记录 `source` 与 `fetched_at`，不保存版本列。因子 MUST 由数据源真实 `'' / qfq / hfq` 日线推导。当数据源刷新某股票因子时，系统 MUST 在同一事务内删除该股票全部旧因子并写入新因子，MUST NOT 只更新部分日期。

#### Scenario: 因子成功生成
- **WHEN** 某股票某交易日同时存在 raw、qfq、hfq 收盘价且 raw 收盘价大于 0
- **THEN** 系统写入 `qfq_factor = qfq_close / raw_close`、`hfq_factor = hfq_close / raw_close`

#### Scenario: 原始收盘价无效时跳过
- **WHEN** 某股票某交易日 raw 收盘价为 null 或 0
- **THEN** 系统不写入该日因子，并记录质量异常

#### Scenario: 因子刷新时整只股票替换
- **WHEN** 重新下载某股票的 qfq/hfq 日线并需要刷新因子
- **THEN** 系统在同一事务内删除该股票全部旧因子并写入新因子

### Requirement: 周线和月线保存不复权聚合

系统 SHALL 从 `kline_daily_raw` 派生 `kline_weekly_raw` 与 `kline_monthly_raw` 缓存表，主键 MUST 为 `(stock_code, period_start_date)`。周 `period_start_date` 为自然周周一，月 `period_start_date` 为 `YYYY-MM-01`；`period_end_date` 为当前已纳入的最后一个交易日，可在 `is_final = 0` 时推进。系统 MUST 仅保存不复权 OHLCV 与换手率，派生记录 MUST 带 `is_final / source / generated_at`，MUST NOT 保存 `change_percent / change_amount / amplitude / factor_version`，MUST NOT 直接向数据源请求周线或月线。

#### Scenario: 周线从日线聚合
- **WHEN** 某周有多个交易日原始日线
- **THEN** 系统按自然周生成一条周线：开盘取首日开盘、收盘取末日收盘、最高最低取极值、成交量成交额换手率求和

#### Scenario: 周中新增交易日不产生新行
- **WHEN** 周一已生成 `period_start_date = 2026-11-23`、`period_end_date = 2026-11-23`、`is_final = 0`，周二数据到达
- **THEN** 系统更新同一主键行，把 `period_end_date` 改为周二，行数不增加

#### Scenario: 未完成周期标记
- **WHEN** 当前周或当前月尚未结束且已有日线数据
- **THEN** 系统生成 `is_final = 0` 的派生记录

#### Scenario: 周期结束标记
- **WHEN** 按交易日历该自然周或自然月已无后续交易日
- **THEN** 系统将该周期记录的 `is_final` 置为 1

#### Scenario: 重建按 period_start_date 删除
- **WHEN** 某交易日数据变化导致周/月周期需要重建
- **THEN** 系统按 `stock_code + period_start_date` 删除受影响周期（单周期 `= ?`，区间回填 `>= ?`），再插入新聚合结果

#### Scenario: 不存复权口径涨跌字段
- **WHEN** 检查 `kline_weekly_raw / kline_monthly_raw` 表结构
- **THEN** 不存在 `change_percent / change_amount / amplitude / factor_version` 列

#### Scenario: 复权周/月线读取时计算
- **WHEN** 读取某股票某周的前复权或后复权周线
- **THEN** 系统先对区间内日线逐日应用对应因子，再按周聚合，不使用周表 OHLC 乘以单一因子

### Requirement: 行情数据保留来源与抓取时间

系统 SHALL 为 `kline_daily_raw`、`adjust_factors`、`kline_weekly_raw`、`kline_monthly_raw` 中的记录保留数据来源与生成/抓取时间。系统 MUST NOT 在库中留下无法追溯来源的行情事实行。

#### Scenario: 原始日线写入来源
- **WHEN** 一批原始日线写入 `kline_daily_raw`
- **THEN** 每行包含数据源标识与抓取时间

#### Scenario: 派生记录写入生成时间
- **WHEN** 系统生成或重建周线/月线
- **THEN** 每行包含 `source` 与 `generated_at`，不记录 `factor_version`
