## ADDED Requirements

### Requirement: ETF 买入费用计算
系统对 ETF（场内基金）买入交易，SHALL 仅按佣金率（`TRADE_FEE_RATE`）计算佣金，且 SHALL 不设置最低 5 元下限（按实际金额计收），SHALL 免收过户费。

#### Scenario: ETF 买入资金流出
- **WHEN** 录入一笔 ETF 买入（如代码 `510300`，价格 3.456，数量 1000）
- **THEN** 买入资金流出 = 交易金额 + 交易金额 × `TRADE_FEE_RATE`，且不含过户费，且佣金不受 5 元最低下限约束

#### Scenario: ETF 与股票买入费用差异
- **WHEN** 相同交易金额下分别录入 ETF 与股票买入
- **THEN** ETF 的买入资金流出严格小于股票（少收过户费，且小额时免最低佣金）

### Requirement: ETF 卖出费用计算
系统对 ETF 卖出交易，SHALL 仅按佣金率（`TRADE_FEE_RATE`）计算佣金（免最低 5 元），SHALL 免收印花税，SHALL 免收过户费。

#### Scenario: ETF 卖出资金流入
- **WHEN** 录入一笔 ETF 卖出（如代码 `588000`，价格 1.234，数量 1000）
- **THEN** 卖出资金流入 = 交易金额 − 交易金额 × `TRADE_FEE_RATE`，且不含印花税与过户费

#### Scenario: ETF 卖出不收印花税
- **WHEN** 任意 ETF 代码发生卖出
- **THEN** 卖出金额中不计任何印花税项（区别于股票卖出）

### Requirement: ETF 持仓成本计算
系统计算 ETF 持仓加权均价（`holding_price`）时，SHALL 在买入与卖出成本中仅计入佣金，SHALL 不含过户费与印花税，且佣金 SHALL 免最低 5 元。

#### Scenario: ETF 连续买入的加权均价
- **WHEN** 对同一 ETF 多次买入
- **THEN** 每次加权均价仅包含佣金成本，不含过户费

#### Scenario: ETF 卖出不计印花税项
- **WHEN** 对同一 ETF 发生卖出
- **THEN** 加权均价公式中印花税项为 0（`tax = 0`），不因卖出而额外扣减印花税

### Requirement: ETF 识别与逻辑复用
系统 SHALL 通过代码前缀识别 ETF/场内基金（上交所 `50/51/52/56/58`、深交所 `15/16/18`），且该识别逻辑 SHALL 作为单一来源 `shared/utils/securities.ts` 的 `isFund`，供交易费用计算、价格展示精度、K 线下载复用。

#### Scenario: 基金代码识别为 true
- **WHEN** 股票代码为 `510300` / `588000` / `563000` / `159915` / `184xxx`
- **THEN** `isFund` 返回 `true`（识别为场内基金）

#### Scenario: 股票代码识别为 false
- **WHEN** 股票代码为 `600519` / `000001` / `300750`
- **THEN** `isFund` 返回 `false`（识别为股票，沿用股票费用规则）

### Requirement: ETF 股息红利税仍适用
系统对 ETF 分红及卖出，SHALL 继续按差别化红利税规则（`calcDividendTax`）计征，本变更不得改变该行为。

#### Scenario: ETF 卖出触及红利税
- **WHEN** ETF 卖出且持有期内发生过分红、持股不足 1 年
- **THEN** 仍按持股期限对应税率计征股息红利税（与股票一致）
