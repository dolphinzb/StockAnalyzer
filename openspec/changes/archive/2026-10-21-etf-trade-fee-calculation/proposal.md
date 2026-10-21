## Why

当前交易记录的费用计算（`calcHoldingPrice` / `calcStockBuyAmount` / `calcStockSellAmount`）对股票和 ETF 一视同仁地收取印花税、过户费及最低 5 元佣金。但 ETF 作为场内基金，实际**免印花税、免过户费**，且多数券商 ETF 佣金**免最低 5 元**（按费率实收）。这导致 ETF 的持仓成本（`holding_price`）和资金明细（`STOCK_BUY` / `STOCK_SELL`）计算偏高，盈亏失真。需要让交易记录与计算能力对 ETF 正确建模。

## What Changes

- **买卖记录录入**：维持现有能力（交易记录按 `stockCode` 录入，已支持 ETF 代码如 `510300`、`588000`），本次不新增/修改录入字段，仅新增 ETF 识别与差异化费用计算。
- **买入金额计算**（`calcStockBuyAmount`）：ETF 仅收佣金（按费率实收，无最低 5 元），免过户费。
- **卖出金额计算**（`calcStockSellAmount`）：ETF 仅收佣金，免印花税、免过户费。
- **持仓成本计算**（`calcHoldingPrice`）：ETF 买入/卖出加权均价中仅含佣金，不含过户费与印花税；佣金免最低 5 元。
- **股息红利税计算**（`calcDividendTax`）：ETF 同样适用差别化红利税，保持不变。
- **统一证券类型识别**：将 `isFund` 收敛为单一来源 `shared/utils/securities.ts`，供交易计算、价格展示、K 线下载复用（覆盖上交所 `50/51/52/56/58`、深交所 `15/16/18` 基金前缀）。

## Capabilities

### New Capabilities
- `etf-trade-fee`：ETF 交易费用计算规则——买入/卖出仅按佣金率计费（无最低 5 元）、免印花税、免过户费；持仓成本计算同步应用该规则。

### Modified Capabilities
（无 spec 级行为变更；股票费用规则保持不变，仅对 ETF 增加分支。）

## Impact

- **代码**：`electron/services/tradeService.ts` 的 `calcHoldingPrice`、`calcStockBuyAmount`、`calcStockSellAmount` 改为 `isFund` 感知；新增 `shared/utils/securities.ts` 作为 `isFund` 单一来源；`src/utils/formatPrice.ts`、`electron/services/klineDownloadService.ts` 复用共享 `isFund`。
- **数据**：`trade_record` 表结构不变；历史 ETF 记录的 `holding_price` 为旧口径，新记录按新口径计算（向后兼容，不强制回填历史数据）。
- **资金明细**：`position:add-record` 同步写入的 `STOCK_BUY` / `STOCK_SELL` 金额随新规则变化。
- **依赖**：无新增第三方依赖。
