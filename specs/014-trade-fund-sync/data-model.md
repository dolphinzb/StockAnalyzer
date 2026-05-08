# Data Model: 交易记录新增时自动同步资金明细

**Date**: 2026-05-07  
**Feature**: 014-trade-fund-sync

## Entities

### 1. TradeRecord (交易记录 - 已有，不修改)

**Description**: 代表一笔股票交易操作，存储在trade_record表中。

**Fields** (已有):
| Field | Type | Description |
|-------|------|-------------|
| id | number | 唯一标识符 |
| stockCode | string | 股票代码 |
| stockName | string | 股票名称 |
| tradeDate | string | 交易日期 (YYYY-MM-DD) |
| tradeType | 'BUY' \| 'SELL' \| 'DIVIDEND' | 交易类型 |
| tradePrice | number | 交易价格（买入/卖出为单价，股息为每股股息） |
| tradeCount | number | 交易数量 |
| holdingCount | number | 持仓数量 |
| holdingPrice | number | 持仓成本价 |

**No schema changes** - trade_record表结构不变。

---

### 2. TransferRecord (资金明细记录 - 已有，不修改)

**Description**: 代表一笔资金变动操作，存储在transfer_records表中。

**Fields** (已有):
| Field | Type | Description |
|-------|------|-------------|
| id | number | 唯一标识符 |
| transferDate | string | 日期 (YYYY-MM-DD) |
| amount | number | 金额（正数） |
| type | 'IN' \| 'OUT' \| 'DIVIDEND' \| 'DIVIDEND_TAX' \| 'STOCK_BUY' \| 'STOCK_SELL' \| 'INTEREST' | 资金类型 |
| accountBalance | number | 账户余额 |
| createdAt | string | 创建时间 |
| updatedAt | string | 更新时间 |

**No schema changes** - transfer_records表结构不变，不新增trade_record_id字段。

---

### 3. BuyBatch (买入批次 - 新增接口)

**Description**: FIFO算法中的买入批次，不持久化，仅用于股息税计算。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| remainingCount | number | 批次剩余股数 |
| purchaseDate | string | 买入日期 (YYYY-MM-DD) |

---

### 4. AddTradeResult (新增交易记录返回值 - 新增接口)

**Description**: addTradeRecord函数的新返回值，包含交易记录和同步状态。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| record | TradeRecord | 交易记录 |
| fundSyncSuccess | boolean | 资金明细同步是否成功 |
| fundSyncError | string \| undefined | 同步失败原因 |

---

## Data Flow

### 1. 买入交易同步流程

```
用户新增买入交易
       ↓
addTradeRecord() 保存交易记录
       ↓
calcTradeFees('BUY', price, count, code) 计算手续费
       ↓
fundService.addTransferRecord({
  transferDate: tradeDate,
  amount: 买入金额 + 手续费,
  type: 'STOCK_BUY'
})
       ↓
返回 AddTradeResult { record, fundSyncSuccess }
```

**STOCK_BUY金额计算**:
```
买入金额 = tradePrice × tradeCount
手续费 = calcTradeFees('BUY', ...).totalFee
STOCK_BUY金额 = 买入金额 + 手续费
```

**示例**:
```
买入1000股@5元，沪市
买入金额 = 5000元
佣金 = max(5000 × 0.0003, 5) = 5元
华泰费 = 5000 × 0.00002 = 0.1元
总手续费 = 5 + 0.1 = 5.1元（深市）
         = 5元（沪市，佣金含在买入金额中不计入额外费用）

STOCK_BUY金额 = 5000 + 5 = 5005元（沪市）
```

---

### 2. 卖出交易同步流程

```
用户新增卖出交易
       ↓
addTradeRecord() 保存交易记录
       ↓
calcTradeFees('SELL', price, count, code) 计算手续费和印花税
       ↓
fundService.addTransferRecord({
  transferDate: tradeDate,
  amount: 卖出金额 - 手续费 - 印花税,
  type: 'STOCK_SELL'
})
       ↓
calcDividendTax(stockCode, sellDate, sellCount, allTrades)
       ↓
if (dividendTax > 0):
  fundService.addTransferRecord({
    transferDate: 卖出次日,
    amount: dividendTax,
    type: 'DIVIDEND_TAX'
  })
       ↓
返回 AddTradeResult { record, fundSyncSuccess }
```

**STOCK_SELL金额计算**:
```
卖出金额 = tradePrice × tradeCount
手续费 = calcTradeFees('SELL', ...).totalFee
STOCK_SELL金额 = 卖出金额 - 手续费 - 印花税
```

**示例**:
```
卖出1000股@8元，深市
卖出金额 = 8000元
佣金 = max(8000 × 0.0003, 5) = 5元
印花税 = 8000 × 0.001 = 8元
华泰费 = 8000 × 0.00002 = 0.16元
总手续费 = 5 + 8 + 0.16 = 13.16元

STOCK_SELL金额 = 8000 - 13.16 = 7986.84元
```

---

### 3. 股息交易同步流程

```
用户新增股息交易
       ↓
addTradeRecord() 保存交易记录
       ↓
fundService.addTransferRecord({
  transferDate: tradeDate,
  amount: tradePrice × holdingCount,
  type: 'DIVIDEND'
})
       ↓
返回 AddTradeResult { record, fundSyncSuccess }
```

**DIVIDEND金额计算**:
```
股息总额 = tradePrice(每股股息) × holdingCount(持股数量)
```

---

### 4. FIFO股息税计算流程

```
输入: stockCode, sellDate, sellCount, allTrades(该股票所有交易记录)
       ↓
1. 构建买入批次队列（按时间顺序）
   for each trade in allTrades (按trade_date ASC):
     if BUY:  batches.push({remainingCount: tradeCount, purchaseDate: tradeDate})
     if SELL: consumeFIFO(batches, tradeCount)
       ↓
2. 将本次卖出数量拆分到批次
   sellBatches = []
   remaining = sellCount
   for each batch in batches:
     consumed = min(batch.remainingCount, remaining)
     sellBatches.push({count: consumed, purchaseDate: batch.purchaseDate})
     remaining -= consumed
     if remaining <= 0: break
       ↓
3. 逐批计算股息税
   totalTax = 0
   for each sellBatch in sellBatches:
     holdingDays = daysBetween(sellBatch.purchaseDate, sellDate)
     taxRate = getTaxRate(holdingDays)  // ≤30天20%, 30~365天10%, >365天0%
     if taxRate == 0: continue
     
     dividends = getDividendsBetween(sellBatch.purchaseDate, sellDate)
     for each dividend in dividends:
       dividendAmount = dividend.perShareAmount × sellBatch.count
       totalTax += dividendAmount × taxRate
       ↓
4. 返回 totalTax
```

**示例**:
```
交易记录：
2025-12-01  买入 500股
2026-01-15  买入 500股
2026-01-20  股息 0.5元/股（持股1000股）
2026-01-25  卖出 1000股

FIFO拆分：
  500股来自2025-12-01 → 持仓55天 → 税率10%
  500股来自2026-01-15 → 持仓10天 → 税率20%

股息事件：2026-01-20，0.5元/股

批次1(500股, 12-01买入):
  股息 = 0.5 × 500 = 250元
  税 = 250 × 10% = 25元

批次2(500股, 01-15买入):
  股息 = 0.5 × 500 = 250元
  税 = 250 × 20% = 50元

总股息税 = 25 + 50 = 75元
DIVIDEND_TAX记录：日期01-26，金额75元
```

---

## Type Definitions

### New TypeScript Interfaces

```typescript
// electron/services/tradeService.ts

/** FIFO买入批次 */
export interface BuyBatch {
  /** 批次剩余股数 */
  remainingCount: number;
  /** 买入日期 */
  purchaseDate: string;
}

// electron/database.ts

/** 新增交易记录的返回结果 */
export interface AddTradeResult {
  /** 交易记录 */
  record: TradeRecord;
  /** 资金明细同步是否成功 */
  fundSyncSuccess: boolean;
  /** 同步失败原因 */
  fundSyncError?: string;
}
```

### Modified TypeScript Interfaces

```typescript
// shared/types/index.ts - PositionAPI 修改
export interface PositionAPI {
  // ... 现有方法 ...
  /** 新增交易记录，返回记录和同步状态 */
  addRecord: (input: AddTradeInput) => Promise<AddTradeResult>;
}
```

---

## Validation Rules

### 手续费计算验证
- 佣金 = max(交易金额 × 0.0003, 5)
- 印花税 = 卖出金额 × 0.001（仅卖出）
- 华泰费 = 交易金额 × 0.00002（深市和沪市卖出）

### FIFO股息税验证
- 持股天数 = 卖出日期 - 买入日期（天数差）
- 税率：≤30天 → 20%，31~365天 → 10%，>365天 → 0%
- 临界点按较低税率：30天按10%，365天按免税

### 同步金额验证
- STOCK_BUY金额 > 0（买入金额+手续费）
- STOCK_SELL金额 > 0（卖出金额-手续费-印花税，正常情况为正）
- DIVIDEND金额 > 0（每股股息×持股数量）
- DIVIDEND_TAX金额 > 0（汇总各批次税额）
