## MODIFIED Requirements

### Requirement: 复权因子按股票全量替换

系统 SHALL 使用 `adjust_factors` 表保存每只股票每个交易日的 `qfq_factor` 与 `hfq_factor`，并记录 `source` 与 `fetched_at`，不保存版本列。因子 SHALL 由搜狐原始日线及其涨跌额/涨跌幅在本地推导；前复权因子以全历史最新交易日为基准，后复权因子以上市首日为基准。适配器产生的 qfq/hfq 序列 SHALL 仅用于同步流程配对和因子推导，MUST NOT 作为事实行写入 `kline_daily_raw`。当数据源刷新某股票因子时，系统 MUST 在同一事务内删除该股票全部旧因子并写入新因子，MUST NOT 只更新部分日期。

#### Scenario: 因子成功生成
- **WHEN** 某股票某交易日存在搜狐原始收盘价、涨跌额与涨跌幅，且原始收盘价大于 0
- **THEN** 系统按本地推导结果写入 `qfq_factor` 与 `hfq_factor`

#### Scenario: 原始收盘价无效时跳过
- **WHEN** 某股票某交易日搜狐原始收盘价为 null 或 0
- **THEN** 系统不写入该日因子，并记录质量异常

#### Scenario: 因子刷新时整只股票替换
- **WHEN** 重新下载某股票的搜狐日线并需要刷新因子
- **THEN** 系统在同一事务内删除该股票全部旧因子并写入新因子

#### Scenario: 前复权以最新交易日为基准
- **WHEN** 用户请求历史区间的 qfq 日线或重新计算前复权因子
- **THEN** 系统使用延伸到最新交易日的因子链计算历史价格，再切片返回请求区间

#### Scenario: 后复权以上市首日为基准
- **WHEN** 系统计算某股票的 hfq 日线或后复权因子
- **THEN** 系统从该股票可得的最早交易日起累乘复权因子，历史最早价格保持基准不变

### Requirement: 行情数据保留来源与抓取时间

系统 SHALL 为 `kline_daily_raw`、`adjust_factors`、`kline_weekly_raw`、`kline_monthly_raw` 中的记录保留数据来源与生成/抓取时间。系统 MUST NOT 在库中留下无法追溯来源的行情事实行。`kline_daily_raw` 的 `source` MUST 为 `sohu_hisHq`；`adjust_factors.source` MUST 标识因子为基于搜狐原始日线本地推导；周/月派生记录的 `source` SHALL 标识其派生自搜狐原始日线。

#### Scenario: 原始日线写入来源
- **WHEN** 一批搜狐原始日线写入 `kline_daily_raw`
- **THEN** 每行的 `source` 为 `sohu_hisHq`，并包含抓取时间

#### Scenario: 因子写入来源
- **WHEN** 系统根据搜狐原始日线和涨跌信息生成因子并写入 `adjust_factors`
- **THEN** 每行的 `source` 标识本地推导来源，并包含抓取时间

#### Scenario: 派生记录写入生成时间
- **WHEN** 系统生成或重建周线/月线
- **THEN** 每行包含 `source` 与 `generated_at`，不记录 `factor_version`
