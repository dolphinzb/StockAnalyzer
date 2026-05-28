## MODIFIED Requirements

### Requirement: 系统支持A股和基金的K线数据下载

系统 MUST 在自选股列表的操作列中提供"下载K线"按钮，允许用户下载A股股票和基金（ETF、LOF等）的日K线数据。股票代码验证规则扩展为支持以下类型：
- A股：深市主板（0开头）、创业板（3开头）、沪市主板（6开头）
- 基金：上交所ETF（51开头）、深交所ETF（15开头）、深交所LOF（16开头）、上交所LOF（50开头）、上交所货币基金（52开头）、上交所债券ETF（511开头）

所有支持的证券代码必须为6位数字格式。

#### Scenario: 用户下载A股股票的K线数据
- **WHEN** 用户在自选股列表中点击A股股票（如600519、000001、300750）的"下载K线"按钮，选择日期范围和复权类型后确认
- **THEN** 系统验证通过，开始下载该股票的K线数据

#### Scenario: 用户下载上交所ETF基金的K线数据
- **WHEN** 用户在自选股列表中点击上交所ETF基金（如510050上证50ETF）的"下载K线"按钮，选择日期范围和复权类型后确认
- **THEN** 系统验证通过，开始下载该基金的K线数据

#### Scenario: 用户下载深交所ETF基金的K线数据
- **WHEN** 用户在自选股列表中点击深交所ETF基金（如159915创业板ETF）的"下载K线"按钮，选择日期范围和复权类型后确认
- **THEN** 系统验证通过，开始下载该基金的K线数据

#### Scenario: 用户下载深交所LOF基金的K线数据
- **WHEN** 用户在自选股列表中点击深交所LOF基金（如161725招商中证白酒指数LOF）的"下载K线"按钮，选择日期范围和复权类型后确认
- **THEN** 系统验证通过，开始下载该基金的K线数据

#### Scenario: 用户输入无效的证券代码
- **WHEN** 用户尝试下载非6位数字代码或非支持的证券类型（如港股、美股、债券等）
- **THEN** 系统拒绝下载，返回错误提示"INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金"

#### Scenario: 自动下载包含基金的自选股列表
- **WHEN** 交易日15:10自动下载触发，且自选股列表中包含基金（如510050）
- **THEN** 系统正常下载基金的当日K线数据，与A股股票采用相同的串行策略（不复权→前复权）

### Requirement: 证券代码验证逻辑

系统 MUST 使用统一的验证函数 `isValidSecurityCode()` 判断证券代码是否为支持的类型。验证规则如下：
- 代码必须为6位数字
- 代码前缀必须符合以下规则之一：
  - A股：`/^[036]\d{5}$/`
  - 基金：`/^(51|15|16|50|52|511)\d{4}$/`

#### Scenario: 验证函数正确识别A股代码
- **WHEN** 调用 `isValidSecurityCode("600519")`、`isValidSecurityCode("000001")`、`isValidSecurityCode("300750")`
- **THEN** 返回 `true`

#### Scenario: 验证函数正确识别基金代码
- **WHEN** 调用 `isValidSecurityCode("510050")`、`isValidSecurityCode("159915")`、`isValidSecurityCode("161725")`
- **THEN** 返回 `true`

#### Scenario: 验证函数拒绝无效代码
- **WHEN** 调用 `isValidSecurityCode("HK0700")`、`isValidSecurityCode("AAPL")`、`isValidSecurityCode("12345")`
- **THEN** 返回 `false`

#### Scenario: 验证函数拒绝非6位数字代码
- **WHEN** 调用 `isValidSecurityCode("1234")`、`isValidSecurityCode("1234567")`、`isValidSecurityCode("abc123")`
- **THEN** 返回 `false`

### Requirement: 错误提示信息更新

当用户尝试下载不支持的证券类型时，系统 MUST 返回明确的错误提示："INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金"。

#### Scenario: 用户尝试下载港股
- **WHEN** 用户在自选股中添加港股代码（如00700）并尝试下载K线数据
- **THEN** 系统返回错误提示"INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金"

#### Scenario: 用户尝试下载美股
- **WHEN** 用户在自选股中添加美股代码（如AAPL）并尝试下载K线数据
- **THEN** 系统返回错误提示"INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金"

### Requirement: stock-sdk 兼容性

系统 MUST 确保 stock-sdk 的 `getHistoryKline()` 方法能够正确获取基金的K线数据，包括不复权和前复权两种类型。

#### Scenario: stock-sdk 返回基金不复权数据
- **WHEN** 调用 `sdk.getHistoryKline({ code: 'sh510050', startDate: '20240101', endDate: '20241231', adjust: '' })`
- **THEN** 返回该基金在指定时间段内的不复权日K线数据，数据格式与股票一致

#### Scenario: stock-sdk 返回基金前复权数据
- **WHEN** 调用 `sdk.getHistoryKline({ code: 'sh510050', startDate: '20240101', endDate: '20241231', adjust: 'qfq' })`
- **THEN** 返回该基金在指定时间段内的前复权日K线数据，数据格式与股票一致

#### Scenario: stock-sdk 处理基金分红除权
- **WHEN** 基金发生分红或拆分事件
- **THEN** stock-sdk 返回的前复权数据已正确处理除权因子，价格连续合理
