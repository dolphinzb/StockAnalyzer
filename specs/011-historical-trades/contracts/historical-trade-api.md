# IPC Contract: Historical Trade API

**Feature**: 011-historical-trades
**Date**: 2026-04-23

## Overview

历史开仓记录 IPC 接口，用于渲染进程与主进程之间的数据通信。

## API Endpoints

### `historicalTrade:getAll`

获取所有历史开仓记录。

**Request**: 无参数

**Response**:
```typescript
{
  records: HistoricalTradeRecord[]
}
```

**Error Cases**:
- `DATABASE_ERROR`: 数据库查询失败
- `CALCULATION_ERROR`: 周期计算失败

---

### `historicalTrade:getCycleDetails`

获取指定交易周期的交易明细。

**Request**:
```typescript
{
  cycleId: string  // 格式：stockCode_cycleIndex
}
```

**Response**:
```typescript
{
  details: TradeDetail[]
}
```

**Error Cases**:
- `CYCLE_NOT_FOUND`: 找不到指定的周期
- `DATABASE_ERROR`: 数据库查询失败

---

## Type Definitions

### HistoricalTradeRecord

```typescript
interface HistoricalTradeRecord {
  id: string;              // 唯一标识符（格式：stockCode_cycleIndex）
  stockCode: string;       // 股票代码
  stockName: string;       // 股票名称
  openTime: string;        // 开仓时间（YYYY-MM-DD）
  closeTime: string;       // 清仓时间（YYYY-MM-DD）
  totalBuyCount: number;   // 总买入次数
  totalSellCount: number;  // 总卖出次数
  totalShares: number;     // 总交易股数
  totalBuyAmount: number;  // 总买入金额
  totalSellAmount: number; // 总卖出金额
  totalFees: number;       // 总手续费
  totalProfit: number;     // 总盈利
  profitRatio: number;     // 盈利比例（百分比）
}
```

### TradeDetail

```typescript
interface TradeDetail {
  tradeDate: string;       // 交易日期
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';  // 交易类型
  tradePrice: number;      // 交易价格
  tradeCount: number;      // 交易数量
  fee: number;             // 单笔手续费
}
```

## Fee Calculation Contract

手续费计算使用简化公式，与现有持仓计算分离：

```typescript
// 买入手续费
function calculateBuyFee(amount: number): number {
  return Math.max(amount * 0.0005, 5) + amount * 0.00001;
}

// 卖出手续费
function calculateSellFee(amount: number): number {
  return Math.max(amount * 0.0005, 5) + amount * 0.00001 + amount * 0.0005;
}
```

**Parameters**:
- `amount`: 成交金额 = 成交价格 × 成交数量

**Return**: 手续费金额（元）
