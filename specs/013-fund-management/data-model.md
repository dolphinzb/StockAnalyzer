# Data Model: 资金管理功能

**Date**: 2026-05-03  
**Updated**: 2026-05-06 - Upgrade to fund detail with account balance calculation  
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

### 2. ProfitStatistics (盈利统计)

**Description**: 代表指定时间段内的盈利计算结果，是计算得出的临时数据，不持久化存储。

**Fields**:
| Field | Type | Required | Description | Calculation |
|-------|------|----------|-------------|-------------|
| startDate | string | Yes | 开始日期 | 用户输入 |
| endDate | string | Yes | 结束日期 | 用户输入 |
| totalIn | number | Yes | 转入总金额 | SUM(amount) WHERE type='IN' AND date in range |
| totalOut | number | Yes | 转出总金额 | SUM(amount) WHERE type='OUT' AND date in range |
| accountBalance | number | Yes | 账户余额 | 从数据库读取最新值 |
| currentHoldings | number | Yes | 当前持仓市值 | 实时查询持仓系统 |
| profit | number | Yes | 盈利金额 | totalOut + accountBalance + currentHoldings - totalIn |

**Relationships**:
- 依赖于FundDetailRecord（数据来源）
- 依赖于AccountConfig（账户余额）
- 依赖于持仓系统（currentHoldings）

**Calculation Formula** (from spec FR-007):
```
profit = totalOut + accountBalance + currentHoldings - totalIn
```

**Example**:
```
时间段：2026-01-01 至 2026-05-06
转入总额：10,000元
转出总额：2,000元
账户余额：5,000元
当前持仓：15,000元
盈利 = 2,000 + 5,000 + 15,000 - 10,000 = 12,000元
```

**Edge Cases**:
- 无资金明细记录：totalIn=0, totalOut=0, profit=accountBalance+currentHoldings
- 无持仓数据：显示“无持仓数据”提示
- 查询失败：显示错误提示（FR-011a）

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

### 2. 盈利统计计算流程

```
User selects date range
       ↓
Fetch transfer records in range (DB query)
       ↓
Calculate totalIn and totalOut (aggregation)
       ↓
Fetch account balance from last transfer record
       ↓
Fetch current holdings total (IPC to main process)
       ↓
Calculate profit = totalOut + accountBalance + currentHoldings - totalIn
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
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD
  totalIn: number;
  totalOut: number;
  accountBalance: number;
  currentHoldings: number;
  profit: number;
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

#### 2. 查询时间段内的转入总额
```sql
SELECT COALESCE(SUM(amount), 0) as total_in 
FROM transfer_records 
WHERE type = 'IN' 
  AND transfer_date >= :startDate 
  AND transfer_date <= :endDate;
```

#### 3. 查询时间段内的转出总额
```sql
SELECT COALESCE(SUM(amount), 0) as total_out 
FROM transfer_records 
WHERE type = 'OUT' 
  AND transfer_date >= :startDate 
  AND transfer_date <= :endDate;
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
  accountBalance: number;  // Current account balance from database
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
    accountBalance: 0,
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
   - Handle missing holdings data gracefully
   - Handle DB query failures
   - Account balance must be available from database

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
- Account balance recalculation: < 100ms for typical operations

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
