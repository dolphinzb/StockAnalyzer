# kline-price-fallback Specification

## Purpose
TBD - created by archiving change fix-cold-start-price-display. Update Purpose after archive.

## Requirements

### Requirement: 日 K 回退数据来源

实时行情缺失时，系统 SHALL 从业务库 `stockanalyzer.db` 的 `kline_daily` 表读取回退价格，MUST NOT 读取 `market_data.db` 的任何表。回退查询 SHALL 以单条批量查询覆盖本轮全部自选股，MUST NOT 为每只股票单独发起一次数据库查询或 IPC 调用。

复权类型 SHALL 优先取 `adjust_type = ''`（不复权），该股无不复权数据时取 `adjust_type = 'qfq'`；两者均无数据时该股不回退。

#### Scenario: 不复权优先

- **WHEN** 某只股票在 `kline_daily` 中同时存在 `adjust_type = ''` 与 `adjust_type = 'qfq'` 的最新日 K
- **THEN** 回退价格取不复权行的 `close`

#### Scenario: 仅前复权数据可用

- **WHEN** 某只股票只有 `adjust_type = 'qfq'` 的日 K 数据
- **THEN** 回退价格取前复权行的 `close`，不因缺少不复权数据而判定回退失败

#### Scenario: 完全无 K 线数据

- **WHEN** 某只股票在 `kline_daily` 中没有任何记录（例如新加自选尚未下载 K 线）
- **THEN** 该股票不产生回退价，保持原有的空值展示

#### Scenario: 不读取行情库

- **WHEN** `market_data.db` 初始化失败
- **THEN** 日 K 回退功能仍可正常工作，因为其数据只来自 `stockanalyzer.db`

### Requirement: 回退价的新鲜度判定

回退价只允许使用「前一交易日或当日（已收盘入库）」的日 K。系统 SHALL 以个股最新日 K 的 `trade_date` 与前一交易日比较，仅当 `trade_date >= 前一交易日` 时该回退价可用；否则该股视为无可用回退价。

前一交易日 SHALL 由系统既有的交易日历能力推导（优先交易日历，跨周末与节假日；交易日历不可用时回退为排除周末的规则）。`kline_daily` 为空或无法确定前一交易日时，所有回退价 SHALL 判定为不可用。

#### Scenario: 昨收数据可用

- **WHEN** 今天是交易日，某股票最新日 K 为上一交易日，且实时行情返回现价 `0`
- **THEN** 使用该日 K 的收盘价作为展示价格

#### Scenario: 当日收盘后数据可用

- **WHEN** 15:10 自动下载已完成，某股票最新日 K 为当日，且实时行情失败
- **THEN** 使用当日日 K 的收盘价作为展示价格

#### Scenario: 停牌股长期无新数据

- **WHEN** 某股票最新日 K 的交易日早于前一交易日（如停牌数周）
- **THEN** 该股票不产生回退价，价格列保持占位符 `-`

#### Scenario: K 线库为空

- **WHEN** `kline_daily` 中没有任何记录
- **THEN** 所有股票均不产生回退价，界面保持占位符，且不报错

### Requirement: 回退字段映射

回退价 SHALL 按日 K 字段整行补齐价格列：现价取 `close`，今开取 `open`，最高取 `high`，最低取 `low`，涨跌额取 `change_amount`，涨跌幅取 `change_percent`，昨收取 `close - change_amount`。系统 MUST NOT 在前端重新推算涨跌额与涨跌幅。

日 K 中为 `NULL` 的字段 SHALL 以空值下发并由渲染层显示占位符 `-`，MUST NOT 用 `0` 顶替。`close` 缺失或不大于 `0` 时该股不产生回退价。

#### Scenario: 整行价格补齐

- **WHEN** 某股票的最新日 K 为 `open=10.1`、`high=10.5`、`low=9.9`、`close=10.3`、`change_amount=0.2`、`change_percent=1.98`
- **THEN** 列表显示今开 10.10、最高 10.50、最低 9.90、现价 10.30、涨跌额 +0.20、涨跌幅 +1.98%

#### Scenario: 部分字段为空

- **WHEN** 回退行的 `high` 为 `NULL`，其余字段有值
- **THEN** 最高列显示 `-`，其余列正常显示，不用 `0.00` 顶替

#### Scenario: 收盘价无效

- **WHEN** 回退行的 `close` 为 `NULL` 或 `0`
- **THEN** 该股票不产生回退价

### Requirement: 回退价与实时价同权

回退价 SHALL 与实时价在所有下游逻辑中同等对待：参与买入/卖出阈值的颜色高亮，参与价格告警判定（仍受 `monitor_enabled` 限制与 5 分钟去抖约束）。界面 MUST NOT 对回退价做任何特殊区分，包括但不限于不同颜色、角标、图标、tooltip 或文案说明。

#### Scenario: 阈值高亮一致

- **WHEN** 某股票使用回退价且该价格小于等于 `buy_threshold`
- **THEN** 现价按既有规则显示为买入高亮色，与实时价命中同一阈值时一致

#### Scenario: 触发告警一致

- **WHEN** 某只 `monitor_enabled = 1` 的股票使用回退价且越过阈值
- **THEN** 按实时价相同的规则触发告警

#### Scenario: 界面无标记

- **WHEN** 某行价格来自日 K 回退
- **THEN** 该行不出现任何标识性元素或附加文案，与实时价行完全一致

### Requirement: 回退结果的下发语义

刷新结果 SHALL 逐只判定：实时价格有效（`success` 且价格大于 `0`）时使用实时值；否则使用可用的日 K 回退值；两者都不可用时 MUST NOT 下发该股票代码，MUST NOT 下发 `price = 0`。

#### Scenario: 混合下发

- **WHEN** 一轮刷新中 A 股票实时价有效、B 股票实时价无效但日 K 回退可用、C 股票两者都不可用
- **THEN** 下发结果包含 A（实时价）与 B（回退价），不含 C，前端 C 行保留原有内容（首帧为 `-`）

#### Scenario: 整批失败不清空界面

- **WHEN** 一轮刷新整批请求失败且全部日 K 回退不可用
- **THEN** 不向渲染进程下发任何价格，列表保留上一轮已显示的价格，不出现清空或 `¥0.00`

### Requirement: 回退范围限定

日 K 回退 SHALL 仅作用于自选股列表的价格展示。持仓页（`position:fetch-prices` 及其前端过滤逻辑）MUST NOT 纳入回退，其行为保持本次变更前一致。

#### Scenario: 持仓页不显示回退价

- **WHEN** 持仓页请求价格且某只持仓股实时行情失败
- **THEN** 该持仓的当前价不显示日 K 回退值，维持原有行为
