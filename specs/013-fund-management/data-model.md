# Data Model: 资金管理功能

**Date**: 2026-05-03  
**Feature**: 013-fund-management

## Entities

### 1. TransferRecord (转账记录)

**Description**: 代表一笔资金转账操作，记录资金的转入或转出。

**Fields**:
| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|------------|
| id | number | Yes | 唯一标识符（自增主键） | 自动生成 |
| transferDate | string | Yes | 转账日期 | YYYY-MM-DD格式 |
| amount | number | Yes | 转账金额 | 必须 > 0 |
| type | 'IN' \| 'OUT' | Yes | 转账类型 | 枚举值：IN(转入), OUT(转出) |
| createdAt | string | No | 创建时间 | ISO 8601格式，自动生成 |
| updatedAt | string | No | 更新时间 | ISO 8601格式，自动更新 |

**Relationships**:
- 无外键关系（独立实体）

**State Transitions**:
- N/A（无状态机，仅CRUD操作）

**Database Schema**:
```sql
CREATE TABLE transfer_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
);

CREATE INDEX idx_transfer_date_desc ON transfer_records(transfer_date DESC);
```

**Validation Rules** (from spec):
- FR-009: 金额必须为正数
- FR-002b: 类型必须是'IN'或'OUT'
- 日期格式必须为YYYY-MM-DD

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
| currentHoldings | number | Yes | 当前持仓市值 | 实时查询持仓系统 |
| profit | number | Yes | 盈利金额 | totalOut - totalIn + currentHoldings |

**Relationships**:
- 依赖于TransferRecord（数据来源）
- 依赖于持仓系统（currentHoldings）

**Calculation Formula** (from spec FR-007):
```
profit = totalOut - totalIn + currentHoldings
```

**Example**:
```
时间段：2026-01-01 至 2026-05-03
转入总额：10,000元
转出总额：2,000元
当前持仓：15,000元
盈利 = 2,000 - 10,000 + 15,000 = 7,000元
```

**Edge Cases**:
- 无转账记录：totalIn=0, totalOut=0, profit=currentHoldings
- 无持仓数据：显示"无持仓数据"提示
- 查询失败：显示错误提示（FR-011a）

---

## Data Flow

### 1. 转账记录管理流程

```
User Action → Vue Component → Pinia Store → Electron IPC → Database
     ↑                                                    |
     └──────────── Response ←─────────────────────────────┘
```

**Operations**:
- **Create**: INSERT INTO transfer_records
- **Read**: SELECT * FROM transfer_records ORDER BY transfer_date DESC LIMIT ? OFFSET ?
- **Update**: UPDATE transfer_records SET ... WHERE id = ?
- **Delete**: DELETE FROM transfer_records WHERE id = ?

### 2. 盈利统计计算流程

```
User selects date range
       ↓
Fetch transfer records in range (DB query)
       ↓
Calculate totalIn and totalOut (aggregation)
       ↓
Fetch current holdings total (IPC to main process)
       ↓
Calculate profit = totalOut - totalIn + currentHoldings
       ↓
Display results to user
```

---

## Type Definitions

### TypeScript Interfaces

```typescript
// shared/types/index.ts

export interface TransferRecord {
  id: number;
  transferDate: string;    // YYYY-MM-DD
  amount: number;          // > 0
  type: 'IN' | 'OUT';
  createdAt?: string;      // ISO 8601
  updatedAt?: string;      // ISO 8601
}

export interface ProfitStatistics {
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD
  totalIn: number;
  totalOut: number;
  currentHoldings: number;
  profit: number;
}

export interface TransferRecordInput {
  transferDate: string;
  amount: number;
  type: 'IN' | 'OUT';
}

export interface TransferRecordUpdate {
  transferDate?: string;
  amount?: number;
  type?: 'IN' | 'OUT';
}
```

---

## Database Operations

### SQL Queries

#### 1. 分页查询转账记录（无限滚动）
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

#### 4. 插入新记录
```sql
INSERT INTO transfer_records (transfer_date, amount, type) 
VALUES (:transferDate, :amount, :type);
```

#### 5. 更新记录
```sql
UPDATE transfer_records 
SET transfer_date = :transferDate, 
    amount = :amount, 
    type = :type,
    updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now')
WHERE id = :id;
```

#### 6. 删除记录
```sql
DELETE FROM transfer_records WHERE id = :id;
```

---

## State Management (Pinia)

### fundManagement Store

```typescript
// src/stores/fundManagement.ts

interface FundManagementState {
  transferRecords: TransferRecord[];
  profitStats: ProfitStatistics | null;
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
    async addTransferRecord(data: TransferRecordInput),
    async updateTransferRecord(id: number, data: TransferRecordUpdate),
    async deleteTransferRecord(id: number),
    async calculateProfit(startDate: string, endDate: string),
    resetError()
  }
});
```

---

## Validation Rules Summary

### TransferRecord Validations
1. **Amount > 0** (FR-009)
   - Error message: "转账金额必须为正数"
   
2. **Type is 'IN' or 'OUT'** (FR-002b)
   - Enforced by database CHECK constraint
   
3. **Date format YYYY-MM-DD**
   - Validated before database insertion
   
4. **Required fields**
   - transferDate, amount, type are all required

### ProfitStatistics Validations
1. **Date range validity**
   - startDate <= endDate
   - Both dates required
   
2. **Data availability**
   - Handle missing holdings data gracefully
   - Handle DB query failures

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
    db.run(`CREATE TABLE transfer_records (...)`);
    db.run(`CREATE INDEX idx_transfer_date_desc ON ...`);
    db.run(`CREATE INDEX idx_transfer_type_date ON ...`);
  }
}
```

### Backward Compatibility
- 新表不影响现有表结构
- 应用启动时自动检查并创建表
- 无数据迁移需求（新功能）
