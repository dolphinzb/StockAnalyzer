# Data Model: 网格交易计算页面

**Created**: 2026-04-06
**Feature**: 008-grid-trading

## Database Schema

### trade_record 表（已存在）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER PRIMARY KEY | 主键 |
| stock_code | TEXT | 股票代码 |
| stock_name | TEXT | 股票名称 |
| trade_date | TEXT | 交易时间（ISO格式，精确到秒） |
| trade_type | TEXT | 交易类型（buy/sell/dividend） |
| trade_price | REAL | 交易价格 |
| trade_count | INTEGER | 交易数量 |
| holding_count | INTEGER | 持仓数量 |
| holding_price | REAL | 持仓均价 |

## TypeScript 类型定义

### 持仓股票

```typescript
export interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;
  holdingPrice: number;
}
```

### 交易计算输入

```typescript
export interface CalculatePositionInput {
  totalAmount: number;
  currentPrice: number;
  currentHoldingCount: number;
  averageHoldingPrice: number;
}
```

### 交易计算结果

```typescript
export interface PositionResult {
  currentPositionAmount: number;
  targetPosition: number;
  targetPositionAmount: number;
  adjustAmount: number;
  deviationPercent: number;
}
```

### 开仓计算输入

```typescript
export interface CalculateOpenInput {
  totalAmount: number;
  openPrice: number;
}
```

### 开仓计算结果

```typescript
export interface OpenResult {
  openAmount: number;
  buyCount: number;
}
```

## 计算公式

### 交易计算

| 指标 | 公式 |
|------|------|
| 当前持仓金额 | currentHoldingCount × averageHoldingPrice |
| 目标持仓金额 | totalAmount × 50% |
| 目标持仓数量 | 目标持仓金额 / currentPrice |
| 调整股数 | targetPosition - currentHoldingCount |
| 偏差百分比 | (currentHoldingCount - targetPosition) / targetPosition × 100% |
| 持仓市值 | currentHoldingCount × currentPrice |
| 浮动盈亏 | 持仓市值 - 当前持仓金额 |
| 浮动盈亏率 | 浮动盈亏 / 当前持仓金额 × 100% |

### 开仓计算

| 指标 | 公式 |
|------|------|
| 开仓金额 | totalAmount × 50% |
| 建议买入数量 | Math.floor(开仓金额 / openPrice / 100) × 100 |
| 预计花费 | 建议买入数量 × openPrice |
| 剩余资金 | totalAmount - 开仓金额 |

## 常量定义

```typescript
const GRID_TARGET_RATIO = 0.5;       // 目标持仓比例 50%
const GRID_DEVIATION_THRESHOLD = 10; // 偏差阈值 ±10%
const MIN_TRADE_UNIT = 100;          // 最小交易单位 100股
```

## 验证规则

### 交易计算输入

| 字段 | 验证规则 |
|------|----------|
| totalAmount | > 0 |
| currentPrice | > 0 |
| currentHoldingCount | >= 0 |
| averageHoldingPrice | >= 0 |

### 开仓计算输入

| 字段 | 验证规则 |
|------|----------|
| totalAmount | > 0 |
| openPrice | > 0 |
