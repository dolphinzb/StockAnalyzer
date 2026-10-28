# holdings-breakdown Specification

## Purpose
TBD - created by archiving change add-holdings-breakdown. Update Purpose after archive.
## Requirements
### Requirement: 资金概览返回逐只持仓市值明细

系统 SHALL 在 `fund:getFundOverview` 的返回值中提供逐只持仓明细列表，使前端一次调用即可同时获得汇总与明细数据。

每条明细 MUST 包含：标的价格代码 `stockCode`、价格名称 `stockName`、持仓数量 `holdingCount`、最新收盘价 `closePrice`、单只持仓市值 `marketValue`，以及是否存在可用行情数据 `hasKlineData`。

持仓范围 MUST 与汇总口径一致：取每只标的截止当前最近一条交易记录且 `holding_count > 0` 的持仓。单只市值 MUST 等于 `closePrice × holdingCount`，并保留两位小数；无行情数据的标的 `marketValue` MUST 为 0 且 `hasKlineData` 为 false。

#### Scenario: 多只标的均有行情数据

- **WHEN** 用户持有 3 只标的且 3 只标的在 `kline_data` 中均有收盘价
- **THEN** 返回的 `holdings` 包含 3 条明细，每条含代码、名称、持仓数量、收盘价、市值
- **AND** `currentHoldingsMarketValue` 等于 3 条明细市值之和

#### Scenario: 部分标的缺少行情数据

- **WHEN** 用户持有 2 只标的，其中 1 只在 `kline_data` 中无收盘价
- **THEN** 该标的仍出现在 `holdings` 中，`hasKlineData=false`、`marketValue=0`
- **AND** `currentHoldingsMarketValue` 仅累加有行情数据标的的市值

#### Scenario: 当前无持仓

- **WHEN** 所有标的的最新持仓数量均为 0
- **THEN** `holdings` 为空数组，`currentHoldingsMarketValue` 为 0

### Requirement: 资产分布饼图细化到逐只持仓标的

「资金管理 - 资金统计」页的「资产分布」饼图 SHALL 由汇总的两分类（账户余额、持仓市值）细化为「账户余额 + 每只有行情数据的持仓标的」逐项展示，使每只股票/基金的资金占比直接可读。

饼图扇区占比 MUST 按 `扇区数值 ÷ 总资产 × 100%` 计算。`marketValue` 为 0 的标的（缺少行情数据）MUST NOT 绘制扇区，但仍保留在右侧表格中。饼图扇区颜色 MUST 与右侧表格中对应标的的颜色标识一致。

#### Scenario: 多只持仓的饼图拆分

- **WHEN** 用户持有 A、B 两只标的，市值分别为 6000 元与 4000 元，账户余额为 10000 元
- **THEN** 饼图包含 3 个扇区：A（6000 元）、B（4000 元）、账户余额（10000 元）
- **AND** 各扇区占比分别为 30%、20%、50%

#### Scenario: 存在缺少行情数据的标的

- **WHEN** 持仓中某标的 `hasKlineData=false`
- **THEN** 饼图不绘制该标的扇区
- **AND** 该标的仍出现在右侧表格中

### Requirement: 饼图右侧以表格展示持仓市值与占比

「资产分布」区块 SHALL 采用左右布局：左侧为饼图，右侧为「持仓明细」表格，展示每只股票/基金的持仓市值与占比。

表格 MUST 包含列：标的代码/名称、持仓数量、最新收盘价、持仓市值、占比。占比 MUST 与饼图口径一致，按 `单只市值 ÷ 总资产 × 100%` 计算并保留两位小数；当总资产为 0 时，占比 MUST 显示为「—」。明细 MUST 按持仓市值从大到小降序排列（市值相同按代码升序），并以进度条直观呈现占比。

表格汇总行 MUST 展示持仓总市值，且与上方「持仓市值」统计卡片数值一致。

#### Scenario: 展示多只标的的市值与占比

- **WHEN** 用户在资金统计页且持有 A、B 两只标的，市值分别为 6000 元与 4000 元，总资产为 10000 元
- **THEN** 表格先展示 A 再展示 B
- **AND** A 的占比显示为 60.00%，B 的占比显示为 40.00%
- **AND** 汇总行显示的持仓总市值与「持仓市值」卡片一致

#### Scenario: 总资产为零

- **WHEN** 持仓明细存在但账户余额与持仓市值均为 0
- **THEN** 每只标的的占比列显示为「—」
- **AND** 页面不出现除零错误或 `NaN`、`Infinity` 等异常数值

### Requirement: 缺失行情数据的降级展示

对于无行情数据的持仓标的，表格 SHALL 展示标的代码与名称，并将收盘价、持仓市值、占比显示为「—」。

区块 MUST 在存在缺失行情数据标的时给出提示，说明其未计入持仓总市值，避免用户误认为数据遗漏。

#### Scenario: 存在缺失行情数据的标的

- **WHEN** 持仓明细中某标的 `hasKlineData=false`
- **THEN** 该标的所在行的收盘价、持仓市值、占比均显示为「—」
- **AND** 区块显示提示文案，说明该标的因缺少行情数据未计入总市值

### Requirement: 无持仓时的空状态

当持仓明细为空时，系统 SHALL 在饼图右侧展示空状态提示文案，而不是渲染空白表头或空表格。

#### Scenario: 无持仓查看资金统计页

- **WHEN** 用户没有任何持仓，进入资金统计页
- **THEN** 饼图右侧区域显示「暂无持仓」提示
- **AND** 不渲染持仓明细表格

