# Data Model: 资金管理功能

**Date**: 2026-05-03  
**Updated**: 2026-05-06 - Upgrade to fund detail with account balance calculation  
**Updated**: 2026-05-08 - 更新盈亏统计公式和数据来源  
**Feature**: 013-fund-management

## Entities

### 1. FundDetailRecord (资金明细记录)

**Description**: 代表一笔资金变动操作，记录资金的转入、转出、股息或股息扣税，并自动计算账户余额。

**Fields**:
| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| id | number | Yes | 唯一标识符（自增主键） | 自动生成 |
| transferDate | string | Yes | 日期 | YYYY-MM-DD格式 |
| amount | number | Yes | 金额 | 必须 > 0 |
| type | 'IN' \| 'OUT' \| 'DIVIDEND' \| 'DIVIDEND_TAX' | Yes | 资金类型 | 枚举值：IN(转入), OUT(转出), DIVIDEND(股息), DIVIDEND_TAX(股息扣税) |
| accountBalance | number | Yes | 账户余额 | 自动计算，可为负数 |
| createdAt | string | No | 创建时间 | ISO 8601格式，自动生成 |
| updatedAt | string | No | 更新时间 | ISO 8601格式，自动更新 |

**Relationships**:
- 无外键关系（独立实体）
- 每条记录的accountBalance依赖于上一条记录的accountBalance

**State Transitions**:
- N/A（无状态机，仅CRUD操作）

**Account Balance Calculation Rules**:
```
IF type = 'IN' OR type = 'DIVIDEND':
    accountBalance = previousBalance + amount
ELSE IF type = 'OUT' OR type = 'DIVIDEND_TAX':
    accountBalance = previousBalance - amount
```

**Database Schema**:
```sql
CREATE TABLE transfer_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX')),
  account_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
);

CREATE INDEX idx_transfer_date_desc ON transfer_records(transfer_date DESC);
CREATE INDEX idx_transfer_type_date ON transfer_records(type, transfer_date);
```

**Validation Rules** (from spec):
- FR-009: 金额必须为正数
- FR-002b: 类型必须是'IN'、'OUT'、'DIVIDEND'或'DIVIDEND_TAX'
- 日期格式必须为YYYY-MM-DD
- FR-010a: accountBalance字段必须存在并正确计算

---

### 2. ProfitStatistics (盈亏统计)

**Description**: 代表指定时间段内的盈亏计算结果，是计算得出的临时数据，不持久化存储。

**Fields**:
| Field | Type | Required | Description | Calculation |
|-------|------|----------|-------------|-------------|
| startDate | string | Yes | 开始日期（期初） | 用户输入 |
| endDate | string | Yes | 结束日期（期末） | 用户输入 |
| openingAccountBalance | number | Yes | 期初账户余额 | transfer_records表截止期初日期最近一条记录的account_balance，无记录则为0 |
| closingAccountBalance | number | Yes | 期末账户余额 | transfer_records表截止期末日期最近一条记录的account_balance，无记录则为0 |
| openingHoldingsValue | number | Yes | 期初持仓市值 | kline_data各持股在期初日期收盘价×持仓数量之和 |
| closingHoldingsValue | number | Yes | 期末持仓市值 | kline_data各持股在期末日期收盘价×持仓数量之和 |
| totalIn | number | Yes | 转入总金额 | trade_record表时间段内BUY类型交易总金额（买入金额+手续费） |
| totalOut | number | Yes | 转出总金额 | trade_record表时间段内SELL类型交易总金额（卖出金额-手续费-印花税） |
| profit | number | Yes | 盈亏金额 | (closingAccountBalance+closingHoldingsValue)-(openingAccountBalance+openingHoldingsValue)+(totalOut-totalIn) |

**Relationships**:
- 依赖于FundDetailRecord/transfer_records表（期初/期末账户余额数据来源）
- 依赖于kline_data表（期初/期末持仓市值数据来源）
- 依赖于trade_record表（转入/转出金额数据来源）
- 依赖于持仓系统（获取各持股持仓数量）

**Calculation Formula** (from spec FR-007):
```
盈亏金额 = (期末账户余额 + 期末持仓市值) - (期初账户余额 + 期初持仓市值) + (转出金额 - 转入金额)
```

**Data Source Details**:
- 期初账户余额: `SELECT account_balance FROM transfer_records WHERE transfer_date <= :startDate ORDER BY transfer_date DESC, id DESC LIMIT 1`
- 期末账户余额: `SELECT account_balance FROM transfer_records WHERE transfer_date <= :endDate ORDER BY transfer_date DESC, id DESC LIMIT 1`
- 期初持仓市值: 各持股在期初日期的kline_data收盘价 × 持仓数量之和（无K线数据则使用最近前一个交易日收盘价）
- 期末持仓市值: 各持股在期末日期的kline_data收盘价 × 持仓数量之和（无K线数据则使用最近前一个交易日收盘价）
- 转入金额: trade_record表中BUY类型交易的总金额（trade_price × trade_count + 手续费）
- 转出金额: trade_record表中SELL类型交易的总金额（trade_price × trade_count - 手续费 - 印花税）

**Example**:
```
时间段：2026-01-01 至 2026-05-06
期初账户余额：8,000元
期末账户余额：5,000元
期初持仓市值：12,000元
期末持仓市值：15,000元
转入金额（BUY交易）：50,000元
转出金额（SELL交易）：45,000元

盈亏 = (5,000 + 15,000) - (8,000 + 12,000) + (45,000 - 50,000)
     = 20,000 - 20,000 + (-5,000)
     = -5,000元（亏损5,000元）
```

**Edge Cases**:
- 无资金明细记录：期初/期末账户余额均为0
- 无K线数据：提示"无K线数据"，跳过该持股的市值计算
- 无trade_record记录：转入/转出金额均为0
- 某只持股没有对应日期K线数据：使用最近前一个交易日收盘价

---

## Data Flow

### 1. 资金明细管理流程

```
User Action → Vue Component → Pinia Store → Electron IPC → Database
     ↑                                                    |
     └──────────── Response ←─────────────────────────────┘
```

**Operations**:
- **Create**: INSERT INTO transfer_records (with auto-calculated account_balance)
- **Read**: SELECT * FROM transfer_records ORDER BY transfer_date DESC LIMIT ? OFFSET ?
- **Update**: UPDATE transfer_records SET ... WHERE id = ? (recalculate account_balance for this and subsequent records)
- **Delete**: DELETE FROM transfer_records WHERE id = ? (recalculate account_balance for subsequent records)

**Account Balance Recalculation Logic**:
```
When creating/updating/deleting a record:
1. Get all records ordered by date ASC
2. For each record starting from the affected one:
   - Calculate new account_balance based on previous balance and current record's type/amount
   - Update the record in database
3. Return success
```

### 2. 盈亏统计计算流程

```
User selects date range (startDate, endDate)
       ↓
Fetch opening account balance from transfer_records (截止期初日期最近记录的account_balance)
       ↓
Fetch closing account balance from transfer_records (截止期末日期最近记录的account_balance)
       ↓
Fetch holdings list (各持股代码和持仓数量)
       ↓
For each holding:
  Fetch opening close price from kline_data (期初日期收盘价，无则取最近前一个交易日)
  Fetch closing close price from kline_data (期末日期收盘价，无则取最近前一个交易日)
       ↓
Calculate openingHoldingsValue = Σ(各持股期初收盘价 × 持仓数量)
Calculate closingHoldingsValue = Σ(各持股期末收盘价 × 持仓数量)
       ↓
Fetch trade records in range from trade_record
Calculate totalIn = Σ(BUY类型: trade_price × trade_count + 手续费)
Calculate totalOut = Σ(SELL类型: trade_price × trade_count - 手续费 - 印花税)
       ↓
Calculate profit = (closingAccountBalance + closingHoldingsValue) 
                 - (openingAccountBalance + openingHoldingsValue) 
                 + (totalOut - totalIn)
       ↓
Display results to user
```

---

## Type Definitions

### TypeScript Interfaces

```typescript
// shared/types/index.ts

export interface FundDetailRecord {
  id: number;
  transferDate: string;    // YYYY-MM-DD
  amount: number;          // > 0
  type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX';
  accountBalance: number;  // Auto-calculated
  createdAt?: string;      // ISO 8601
  updatedAt?: string;      // ISO 8601
}

export interface ProfitStatistics {
  startDate: string;               // YYYY-MM-DD (期初)
  endDate: string;                 // YYYY-MM-DD (期末)
  openingAccountBalance: number;   // 期初账户余额 (来自transfer_records)
  closingAccountBalance: number;   // 期末账户余额 (来自transfer_records)
  openingHoldingsValue: number;    // 期初持仓市值 (来自kline_data)
  closingHoldingsValue: number;    // 期末持仓市值 (来自kline_data)
  totalIn: number;                 // 转入总金额 (来自trade_record BUY)
  totalOut: number;                // 转出总金额 (来自trade_record SELL)
  profit: number;                  // 盈亏金额
}

export interface FundDetailRecordInput {
  transferDate: string;
  amount: number;
  type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX';
}

export interface FundDetailRecordUpdate {
  transferDate?: string;
  amount?: number;
  type?: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX';
}
```

---

## Database Operations

### SQL Queries

#### 1. 分页查询资金明细记录（无限滚动）
```sql
SELECT * FROM transfer_records 
ORDER BY transfer_date DESC 
LIMIT :limit OFFSET :offset;
```

#### 2. 查询期初账户余额（截止开始日期最近一条记录）
```sql
SELECT COALESCE(account_balance, 0) as opening_balance 
FROM transfer_records 
WHERE transfer_date <= :startDate 
ORDER BY transfer_date DESC, id DESC 
LIMIT 1;
```

#### 3. 查询期末账户余额（截止结束日期最近一条记录）
```sql
SELECT COALESCE(account_balance, 0) as closing_balance 
FROM transfer_records 
WHERE transfer_date <= :endDate 
ORDER BY transfer_date DESC, id DESC 
LIMIT 1;
```

#### 4. 查询指定日期的持仓市值（使用kline_data收盘价）
```sql
-- 获取各持股在指定日期的收盘价（无则取最近前一个交易日）
SELECT h.stock_code, 
       COALESCE(k.close, (
         SELECT k2.close FROM kline_data k2 
         WHERE k2.stock_code = h.stock_code AND k2.trade_date <= :targetDate 
         ORDER BY k2.trade_date DESC LIMIT 1
       )) as close_price,
       h.holding_count
FROM holdings h
LEFT JOIN kline_data k ON k.stock_code = h.stock_code AND k.trade_date = :targetDate
WHERE h.holding_count > 0;
```

#### 5. 查询时间段内的转入总额（trade_record BUY类型）
```sql
SELECT COALESCE(SUM(trade_price * trade_count), 0) as total_in 
FROM trade_record 
WHERE trade_type = 'BUY' 
  AND trade_date >= :startDate 
  AND trade_date <= :endDate;
```

#### 6. 查询时间段内的转出总额（trade_record SELL类型）
```sql
SELECT COALESCE(SUM(trade_price * trade_count), 0) as total_out 
FROM trade_record 
WHERE trade_type = 'SELL' 
  AND trade_date >= :startDate 
  AND trade_date <= :endDate;
```

#### 4. 插入新记录（需要计算account_balance）
```sql
-- First, get the latest account_balance before the new record's date
SELECT account_balance FROM transfer_records 
WHERE transfer_date < :transferDate 
ORDER BY transfer_date DESC 
LIMIT 1;

-- Then calculate new balance and insert
INSERT INTO transfer_records (transfer_date, amount, type, account_balance) 
VALUES (:transferDate, :amount, :type, :calculatedBalance);
```

#### 5. 更新记录（需要重新计算该记录及后续所有记录的account_balance）
```sql
-- Step 1: Update the target record
UPDATE transfer_records 
SET transfer_date = :transferDate, 
    amount = :amount, 
    type = :type,
    account_balance = :newBalance,
    updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now')
WHERE id = :id;

-- Step 2: Recalculate balances for all subsequent records (application logic)
```

#### 6. 删除记录（需要重新计算后续所有记录的account_balance）
```sql
DELETE FROM transfer_records WHERE id = :id;
-- Then recalculate balances for all subsequent records (application logic)
```

---

## State Management (Pinia)

### fundManagement Store

```typescript
// src/stores/fundManagement.ts

interface FundManagementState {
  transferRecords: FundDetailRecord[];
  profitStats: ProfitStatistics | null;
  openingAccountBalance: number;  // 期初账户余额
  closingAccountBalance: number;  // 期末账户余额
  openingHoldingsValue: number;   // 期初持仓市值
  closingHoldingsValue: number;   // 期末持仓市值
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  currentPage: number;
  pageSize: number;
}

export const useFundManagementStore = defineStore('fundManagement', {
  state: (): FundManagementState => ({
    transferRecords: [],
    profitStats: null,
    openingAccountBalance: 0,
    closingAccountBalance: 0,
    openingHoldingsValue: 0,
    closingHoldingsValue: 0,
    loading: false,
    error: null,
    hasMore: true,
    currentPage: 0,
    pageSize: 20
  }),
  
  getters: {
    totalRecords: (state) => state.transferRecords.length,
    isEmpty: (state) => state.transferRecords.length === 0
  },
  
  actions: {
    async fetchTransferRecords(reset = false),
    async addFundDetailRecord(data: FundDetailRecordInput),
    async updateFundDetailRecord(id: number, data: FundDetailRecordUpdate),
    async deleteFundDetailRecord(id: number),
    async calculateProfit(startDate: string, endDate: string),
    async fetchAccountBalance(),
    async fetchHoldingsMarketValue(date: string),
    async fetchTradeStatsInRange(startDate: string, endDate: string),
    resetError()
  }
});
```

---

## Validation Rules Summary

### FundDetailRecord Validations
1. **Amount > 0** (FR-009)
   - Error message: "金额必须为正数"
   
2. **Type is valid enum** (FR-002b)
   - Must be one of: 'IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX'
   - Enforced by database CHECK constraint
   
3. **Date format YYYY-MM-DD**
   - Validated before database insertion
   
4. **Required fields**
   - transferDate, amount, type are all required
   
5. **Account balance calculation** (FR-003a, FR-004a, FR-005a)
   - Must be automatically calculated on create/update/delete
   - Can be negative (warning but allow save)

### ProfitStatistics Validations
1. **Date range validity**
   - startDate <= endDate
   - Both dates required
   
2. **Data availability**
   - Handle missing kline_data gracefully (use nearest previous trading day)
   - Handle missing trade_record data (totalIn/totalOut default to 0)
   - Handle DB query failures
   - Account balance must be available from transfer_records (default to 0 if no records)

---

## Indexes & Performance

### Database Indexes
```sql
-- Optimize date-based queries and sorting
CREATE INDEX idx_transfer_date_desc ON transfer_records(transfer_date DESC);

-- Optimize date range queries for profit calculation
CREATE INDEX idx_transfer_type_date ON transfer_records(type, transfer_date);
```

### Expected Performance
- Initial load (20 records): < 1 second (SC-002)
- Subsequent loads (20 records): < 0.5 seconds (SC-002)
- Profit calculation: < 1 second (SC-003)

---

## Data Migration

### Table Creation Strategy
```typescript
// electron/database.ts

function initializeTransferRecordsTable(db: Database) {
  const tableExists = db.exec(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='transfer_records'
  `);
  
  if (tableExists.length === 0) {
    // Create table with account_balance field
    db.run(`CREATE TABLE transfer_records (...with account_balance...)`);
    db.run(`CREATE INDEX idx_transfer_date_desc ON ...`);
    db.run(`CREATE INDEX idx_transfer_type_date ON ...`);
  } else {
    // Check if account_balance column exists, add if not
    const columns = db.exec(`PRAGMA table_info(transfer_records)`);
    const hasAccountBalance = columns[0].values.some(col => col[1] === 'account_balance');
    if (!hasAccountBalance) {
      db.run(`ALTER TABLE transfer_records ADD COLUMN account_balance REAL NOT NULL DEFAULT 0`);
      // Recalculate account_balance for all existing records
      recalculateAllAccountBalances(db);
    }
  }
}
```

### Migration Strategy
- 对于已有数据：添加account_balance字段后，需要遍历所有现有记录重新计算账户余额
- 计算逻辑：按日期升序遍历，根据type和amount逐条计算
- 首次记录：如果之前没有记录，初始余额为0
