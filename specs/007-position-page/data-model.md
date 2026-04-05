# Data Model: 持仓页面

**Created**: 2026-04-04
**Feature**: 007-position-page

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

### 交易记录

```typescript
export interface TradeRecord {
  id: number;
  stockCode: string;
  stockName: string;
  tradeDate: string;           // ISO 格式: '2026-04-04T10:30:00'
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradePrice: number;
  tradeCount: number;
  holdingCount: number;
  holdingPrice: number;
}
```

### 持仓股票

```typescript
export interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;       // > 0
  holdingPrice: number;
  lastTradeDate: string;      // 最后交易时间
}
```

### 新增交易输入

```typescript
export interface AddTradeInput {
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;          // ISO 格式
  tradePrice: number;
  tradeCount: number;
}
```

### 更新交易输入

```typescript
export interface UpdateTradeInput {
  id: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;          // ISO 格式
  tradePrice: number;
  tradeCount: number;
}
```

## 验证规则

### 交易记录

| 字段 | 验证规则 |
|------|----------|
| stockCode | 非空，长度 > 0 |
| stockName | 非空，长度 > 0 |
| tradeType | 枚举值：BUY, SELL, DIVIDEND |
| tradeDate | 非空，有效 ISO 日期 |
| tradePrice | > 0 |
| tradeCount | > 0（买入/卖出），= 0（股息） |

### 卖出验证

| 字段 | 验证规则 |
|------|----------|
| tradeCount | <= 当前持仓数量（防超卖） |

### 更新交易验证

| 字段 | 验证规则 |
|------|----------|
| id | 必须存在且 > 0 |
| stockCode | 非空，长度 > 0 |
| stockName | 非空，长度 > 0 |
| tradeType | 枚举值：BUY, SELL, DIVIDEND |
| tradeDate | 非空，有效 ISO 日期 |
| tradePrice | > 0 |
| tradeCount | > 0（买入/卖出），= 0（股息） |

## 交易常量

```typescript
export const TRADE_FEE_RATE = 0.0003;           // 交易费率 0.03%
export const MIN_FEE = 5;                        // 最低手续费 5 元
export const HUATAI_OTHER_FEE_RATE = 0.00002;   // 华泰其他费率 0.002%
export const SHENZHEN_STAMP_TAX_RATE = 0.001;    // 深交所印花税率 0.1%
export const SHANGHAI_STAMP_TAX_RATE = 0.001;   // 上交所印花税率 0.1%
```

## 交易所映射

```typescript
export type Exchange = 'SHANGHAI' | 'SHENZHEN' | 'BEIJING';

export function getExchange(stockCode: string): Exchange {
  const code = stockCode.toLowerCase();
  if (code.startsWith('sh') || code.startsWith('6') || code.startsWith('5')) {
    return 'SHANGHAI';
  }
  if (code.startsWith('sz') || code.startsWith('0') || code.startsWith('1') || code.startsWith('3')) {
    return 'SHENZHEN';
  }
  if (code.startsWith('bj') || code.startsWith('8') || code.startsWith('4')) {
    return 'BEIJING';
  }
  return 'SHENZHEN';
}
```