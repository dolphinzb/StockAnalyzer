## ADDED Requirements

### Requirement: 系统提供全市场 K 线只读查询通道

系统 SHALL 通过 `market:kline:query` IPC 返回指定证券的历史 K 线，入参包含 `stockCode`、周期 `period`（`d` / `w` / `m`）与复权类型 `adjust`（`none` / `qfq` / `hfq`），并只读取 `~/.stockanalyzer/market_data.db`。该通道 MUST NOT 写入任何数据库表，MUST NOT 复用或修改业务库 `klineAPI` 的读取路径。

#### Scenario: 查询单只股票日线
- **WHEN** 渲染进程以 `{ stockCode: '600519', period: 'd', adjust: 'none' }` 调用 `market:kline:query`
- **THEN** 系统从 `kline_daily_raw` 读取该股票全部原始日线并按交易日升序返回，不访问 `stockanalyzer.db`

#### Scenario: 非法周期或复权类型
- **WHEN** 调用方传入不在 `d/w/m` 内的周期或不在 `none/qfq/hfq` 内的复权类型
- **THEN** 系统 reject 该请求并返回可读的参数错误信息，不执行数据库查询

#### Scenario: 空股票代码
- **WHEN** 调用方传入空的 `stockCode`
- **THEN** 系统 reject 该请求，不返回空数组冒充成功结果

### Requirement: 日线按复权类型返回正确口径

系统 SHALL 对不复权日线直接返回 `kline_daily_raw` 已存储的涨跌额、涨跌幅与振幅，MUST NOT 在查询通道或渲染进程基于前一日收盘价重新计算。前复权与后复权日线 MUST 先读取 `adjust_factors`，再把因子逐日乘到开高低收价上；复权后的涨跌额、涨跌幅与振幅 MUST 在主进程按复权价与前一个交易日收盘价计算。

#### Scenario: 不复权日线读取已存储字段
- **WHEN** 查询不复权日线且某交易日已存储 `change_amount` 与 `change_percent`
- **THEN** 系统原样返回这两个字段的值，不重新计算

#### Scenario: 前复权日线逐日应用因子
- **WHEN** 查询前复权日线且某交易日存在 `qfq_factor`
- **THEN** 系统将该日开高低收分别乘以该因子，得到前复权价格序列，成交量与成交额保持不变

#### Scenario: 后复权日线逐日应用因子
- **WHEN** 查询后复权日线且某交易日存在 `hfq_factor`
- **THEN** 系统将该日开高低收分别乘以该因子，得到后复权价格序列

#### Scenario: 复权因子完全缺失
- **WHEN** 查询前复权或后复权日线而该股票没有任何对应因子
- **THEN** 系统返回空数组，MUST NOT 退化为不复权数据

#### Scenario: 复权涨跌字段在主进程计算
- **WHEN** 查询复权日线且当前交易日与前一交易日均有复权收盘价
- **THEN** 系统返回的涨跌额等于两日复权收盘价之差，涨跌幅以百分比表示，振幅按复权最高最低价与前一交易日收盘价计算

### Requirement: 周线和月线按周期身份与复权口径返回

系统 SHALL 对不复权周/月线读取 `kline_weekly_raw` / `kline_monthly_raw`，并以 `period_end_date` 作为返回记录的 `tradeDate`。复权周/月线 MUST 先对原始日线逐日应用对应因子再按周/月聚合，MUST NOT 用周期 OHLC 乘单一因子。派生表未存储的涨跌额、涨跌幅与振幅 MUST 由主进程按相邻周期收盘价计算，第一根周期返回 `null`。

#### Scenario: 读取不复权周线
- **WHEN** 查询 `period = 'w'`、`adjust = 'none'`
- **THEN** 系统从 `kline_weekly_raw` 返回该股票全部周线，每条记录的日期为 `period_end_date`

#### Scenario: 读取复权月线
- **WHEN** 查询 `period = 'm'`、`adjust = 'qfq'` 或 `adjust = 'hfq'`
- **THEN** 系统读取逐日复权后的日线再按月聚合，返回复权月线，不使用月表 OHLC 乘单一因子

#### Scenario: 派生周期涨跌字段
- **WHEN** 查询周线或月线且当前周期与上一周期均有收盘价
- **THEN** 系统返回按相邻周期收盘价计算的涨跌额与涨跌幅；第一根周期的两个字段为 `null`

### Requirement: 查询返回完整历史与稳定字段

系统 SHALL 一次返回该股票该周期该复权类型的全部历史记录，按交易日升序排列，每条记录包含 `tradeDate`、`open`、`high`、`low`、`close`、`volume`、`amount`、`turnoverRate`、`amplitude`、`changePercent`、`changeAmount`。无数据时 SHALL 返回空数组。

#### Scenario: 返回全部历史
- **WHEN** 某股票在库中有从最早交易日至最新交易日的连续日线
- **THEN** 系统一次返回全部记录，按交易日升序，不做分页或截断

#### Scenario: 无历史数据
- **WHEN** 指定股票代码在对应表中没有任何记录
- **THEN** 系统返回空数组，由页面呈现空状态，不作为 IPC 错误

#### Scenario: 行情库未初始化
- **WHEN** `market_data.db` 尚未创建或表不存在导致查询失败
- **THEN** 系统 reject 请求并返回可读错误，不返回空数组冒充正常结果
