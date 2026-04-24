# Data Model: 历史开仓记录

**Feature**: 011-historical-trades
**Date**: 2026-04-23

## Entities

### HistoricalTradeRecord (历史开仓记录)

代表一只股票从开仓到清仓的完整交易周期。

| Field | Type | Description | Validation |
|-------|------|-------------|------------|
| id | string | 唯一标识符（格式：`stockCode_cycleIndex`） | 必填 |
| stockCode | string | 股票代码 | 必填 |
| stockName | string | 股票名称 | 必填 |
| openTime | string | 开仓时间（交易日期） | 必填，格式：YYYY-MM-DD |
| closeTime | string | 清仓时间（交易日期） | 必填，格式：YYYY-MM-DD |
| totalBuyCount | number | 总买入次数 | 必填，>= 0 |
| totalSellCount | number | 总卖出次数 | 必填，>= 0 |
| totalShares | number | 总交易股数 | 必填，> 0 |
| totalBuyAmount | number | 总买入金额 | 必填，>= 0 |
| totalSellAmount | number | 总卖出金额 | 必填，>= 0 |
| totalFees | number | 总手续费 | 必填，>= 0 |
| totalProfit | number | 总盈利 | 必填，可为负数 |
| profitRatio | number | 盈利比例（百分比） | 必填，可为负数 |

**Derived Fields**:
- `totalProfit = totalSellAmount - totalBuyAmount - totalFees`
- `profitRatio = (totalProfit / totalBuyAmount) × 100`（当 totalBuyAmount > 0 时）

### TradeCycle (交易周期)

内部数据结构，代表一个开仓-清仓周期内的所有交易记录。

| Field | Type | Description |
|-------|------|-------------|
| stockCode | string | 股票代码 |
| stockName | string | 股票名称 |
| openTrade | TradeRecord | 开仓交易记录 |
| closeTrade | TradeRecord | 清仓交易记录 |
| trades | TradeRecord[] | 周期内所有交易记录（按时间正序） |

### TradeRecord (交易记录)

复用现有 `TradeRecord` 类型，来自 `database.ts`。

| Field | Type | Description |
|-------|------|-------------|
| id | number | 交易记录 ID |
| stockCode | string | 股票代码 |
| stockName | string | 股票名称 |
| tradeDate | string | 交易日期 |
| tradeType | 'BUY' \| 'SELL' \| 'DIVIDEND' | 交易类型 |
| tradePrice | number | 交易价格 |
| tradeCount | number | 交易数量 |
| holdingCount | number | 交易后持仓数量 |
| holdingPrice | number | 交易后持仓成本 |

### TradeDetail (交易明细)

用于前端展示的交易明细数据。

| Field | Type | Description |
|-------|------|-------------|
| tradeDate | string | 交易日期 |
| tradeType | 'BUY' \| 'SELL' \| 'DIVIDEND' | 交易类型 |
| tradePrice | number | 交易价格 |
| tradeCount | number | 交易数量 |
| fee | number | 单笔手续费 |

## Validation Rules

1. **开仓时间 <= 清仓时间**: 开仓交易日期必须早于或等于清仓交易日期
2. **总买入次数 > 0**: 每个周期至少有一次买入交易
3. **总卖出次数 > 0**: 每个周期至少有一次卖出交易
4. **总交易股数 > 0**: 每个周期至少买入一股
5. **总买入金额 > 0**: 每个周期必须有买入金额
6. **盈利比例计算**: 当总买入金额为 0 时，盈利比例应为 0

## State Transitions

不适用（历史开仓记录为只读数据，无状态转换）

## Relationships

```
HistoricalTradeRecord (1) <-----> (N) TradeDetail
  - 一条历史记录包含多个交易明细
  - 交易明细按交易时间正序排列

TradeCycle (内部数据结构)
  - 用于识别和计算 HistoricalTradeRecord
  - 不直接暴露给前端
```

## Database Schema Changes

**无需修改数据库 schema**。

- 复用现有 `trade_record` 表
- 历史开仓记录通过查询和计算现有数据生成
- 不新增数据库表或字段
