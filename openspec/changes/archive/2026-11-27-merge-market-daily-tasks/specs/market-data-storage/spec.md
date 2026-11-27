## MODIFIED Requirements

### Requirement: 复权因子按股票全量替换

系统 SHALL 使用 `adjust_factors` 表保存每只股票每个交易日的 `qfq_factor` 与 `hfq_factor`，并记录 `source` 与 `fetched_at`，不保存版本列。因子 SHALL 由搜狐原始日线及其涨跌额/涨跌幅在本地推导；前复权因子以全历史最新交易日为基准，后复权因子以上市首日为基准。因子推导 MUST 与原始日线写入在同一次日线任务内完成，MUST NOT 为推导因子再次请求数据源；复权价格 MUST NOT 作为事实行写入 `kline_daily_raw`。全量回填以及增量区间检测到除权除息时，系统 MUST 在同一事务内删除该股票全部旧因子并写入全历史新因子，MUST NOT 只更新部分日期。增量区间未发生除权除息时，系统 MAY 只写入新区间因子，MUST NOT 删除仍有效的历史因子行。

#### Scenario: 因子成功生成
- **WHEN** 某股票某交易日存在搜狐原始收盘价、涨跌额与涨跌幅，且原始收盘价大于 0
- **THEN** 系统按本地推导结果写入 `qfq_factor` 与 `hfq_factor`

#### Scenario: 原始收盘价无效时跳过
- **WHEN** 某股票某交易日搜狐原始收盘价为 null 或 0
- **THEN** 系统不写入该日因子，并记录质量异常

#### Scenario: 全量回填时整只股票替换
- **WHEN** 全量回填写入某股票的原始日线并推导因子
- **THEN** 系统在同一事务内删除该股票全部旧因子并写入全历史新因子

#### Scenario: 增量除权时整只股票替换
- **WHEN** 增量区间内检测到除权除息事件
- **THEN** 系统用库内原始日线重算全历史因子，并在同一事务内替换该股票全部旧因子

#### Scenario: 增量无除权时只追加新区间
- **WHEN** 增量区间内未检测到除权除息事件
- **THEN** 系统只写入新区间因子，历史因子行保持不变

#### Scenario: 前复权以最新交易日为基准
- **WHEN** 用户请求历史区间的 qfq 日线或重新计算前复权因子
- **THEN** 系统使用延伸到最新交易日的因子链计算历史价格，再切片返回请求区间

#### Scenario: 后复权以上市首日为基准
- **WHEN** 系统计算某股票的 hfq 日线或后复权因子
- **THEN** 系统从该股票可得的最早交易日起累乘复权因子，历史最早价格保持基准不变

## ADDED Requirements

### Requirement: 因子推导不产生额外的数据源请求

系统 SHALL 用单次原始日线响应对应的涨跌额与涨跌幅推导 `adjust_factors`。系统 MUST NOT 以“获取 qfq/hfq 收盘价”为目的向数据源发起请求，MUST NOT 在 `kline_daily_raw` 中写入复权价事实行。

#### Scenario: 单次请求完成原始日线与因子写入
- **WHEN** 某证券日线任务执行完毕
- **THEN** `kline_daily_raw` 与 `adjust_factors` 均已写入，且该证券本次只发起一次数据源请求

#### Scenario: 复权价不入事实表
- **WHEN** 系统推导出前复权或后复权价格序列
- **THEN** 该序列仅用于计算因子，不写入 `kline_daily_raw`
