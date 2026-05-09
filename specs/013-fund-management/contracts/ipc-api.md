# IPC Interface Contracts: 资金管理功能

**Date**: 2026-05-03  
**Updated**: 2026-05-08 - 更新盈亏统计接口和数据来源  
**Feature**: 013-fund-management

## Overview

本文档定义了资金管理功能的 Electron IPC 接口契约，用于渲染进程（Vue前端）和主进程（Electron后端）之间的通信。

## Interface Definition

### 1. 转账记录管理接口

#### getTransferRecords

获取分页的转账记录列表

**Request**:
```typescript
{
  channel: 'get-transfer-records',
  args: [limit: number, offset: number]
}
```

**Response**:
```typescript
TransferRecord[] // 转账记录数组

interface TransferRecord {
  id: number;
  transferDate: string;    // YYYY-MM-DD
  amount: number;          // > 0
  type: 'IN' | 'OUT';
  createdAt?: string;      // ISO 8601
  updatedAt?: string;      // ISO 8601
}
```

**Errors**:
- `DATABASE_ERROR`: 数据库查询失败
- `INVALID_PARAMS`: 参数无效（limit <= 0 或 offset < 0）

---

#### addTransferRecord

新增转账记录

**Request**:
```typescript
{
  channel: 'add-transfer-record',
  args: [{
    transferDate: string,  // YYYY-MM-DD
    amount: number,        // > 0
    type: 'IN' | 'OUT'
  }]
}
```

**Response**:
```typescript
{
  id: number  // 新创建的记录ID
}
```

**Errors**:
- `VALIDATION_ERROR`: 数据验证失败（金额<=0，类型无效等）
- `DATABASE_ERROR`: 数据库插入失败

---

#### updateTransferRecord

更新转账记录

**Request**:
```typescript
{
  channel: 'update-transfer-record',
  args: [
    id: number,
    {
      transferDate?: string,
      amount?: number,
      type?: 'IN' | 'OUT'
    }
  ]
}
```

**Response**:
```typescript
{
  success: boolean
}
```

**Errors**:
- `NOT_FOUND`: 记录不存在
- `VALIDATION_ERROR`: 数据验证失败
- `DATABASE_ERROR`: 数据库更新失败

---

#### deleteTransferRecord

删除转账记录

**Request**:
```typescript
{
  channel: 'delete-transfer-record',
  args: [id: number]
}
```

**Response**:
```typescript
{
  success: boolean
}
```

**Errors**:
- `NOT_FOUND`: 记录不存在
- `DATABASE_ERROR`: 数据库删除失败

---

### 2. 盈亏统计接口

#### getProfitStatistics

获取指定时间段内的盈亏统计数据（包含期初/期末账户余额、期初/期末持仓市值、转入/转出金额）

**Request**:
```typescript
{
  channel: 'get-profit-statistics',
  args: [
    startDate: string,  // YYYY-MM-DD (期初)
    endDate: string     // YYYY-MM-DD (期末)
  ]
}
```

**Response**:
```typescript
{
  openingAccountBalance: number,   // 期初账户余额（transfer_records表截止期初日期最近记录）
  closingAccountBalance: number,   // 期末账户余额（transfer_records表截止期末日期最近记录）
  openingHoldingsValue: number,    // 期初持仓市值（kline_data各持股收盘价×持仓数量之和）
  closingHoldingsValue: number,    // 期末持仓市值（kline_data各持股收盘价×持仓数量之和）
  totalIn: number,                 // 转入总额（trade_record BUY类型交易总金额）
  totalOut: number,                // 转出总额（trade_record SELL类型交易总金额）
  profit: number,                  // 盈亏金额
  startDate: string,
  endDate: string
}
```

**Errors**:
- `INVALID_DATE_RANGE`: 日期范围无效（startDate > endDate）
- `DATABASE_ERROR`: 数据库查询失败
- `KLINE_DATA_ERROR`: K线数据查询失败

---

#### getOpeningBalance

获取指定日期之前的账户余额（期初余额）

**Request**:
```typescript
{
  channel: 'get-opening-balance',
  args: [date: string]  // YYYY-MM-DD
}
```

**Response**:
```typescript
number  // 期初账户余额（元）
```

**Errors**:
- `DATABASE_ERROR`: 数据库查询失败

---

#### getHoldingsMarketValue

获取指定日期的持仓市值（使用kline_data收盘价计算）

**Request**:
```typescript
{
  channel: 'get-holdings-market-value',
  args: [date: string]  // YYYY-MM-DD
}
```

**Response**:
```typescript
{
  marketValue: number,        // 持仓总市值（元）
  details: Array<{           // 各持股明细
    stockCode: string,
    stockName: string,
    closePrice: number,      // 收盘价
    holdingCount: number,    // 持仓数量
    marketValue: number      // 个股市值
  }>,
  missingKlineStocks: string[]  // 无K线数据的股票代码列表
}
```

**Errors**:
- `DATABASE_ERROR`: 数据库查询失败
- `KLINE_DATA_ERROR`: K线数据查询失败

---

#### getTradeStatsInRange

获取指定时间段内的交易统计（来自trade_record表）

**Request**:
```typescript
{
  channel: 'get-trade-stats-in-range',
  args: [
    startDate: string,  // YYYY-MM-DD
    endDate: string     // YYYY-MM-DD
  ]
}
```

**Response**:
```typescript
{
  totalIn: number,    // 转入总额（BUY类型交易总金额，含手续费）
  totalOut: number    // 转出总额（SELL类型交易总金额，扣除手续费和印花税）
}
```

**Errors**:
- `INVALID_DATE_RANGE`: 日期范围无效
- `DATABASE_ERROR`: 数据库查询失败

---

## Preload API Exposure

在 `preload/index.ts` 中暴露的API：

```typescript
contextBridge.exposeInMainWorld('api', {
  // 转账记录管理
  getTransferRecords: (limit: number, offset: number) => 
    ipcRenderer.invoke('get-transfer-records', limit, offset),
  
  addTransferRecord: (record: TransferRecordInput) => 
    ipcRenderer.invoke('add-transfer-record', record),
  
  updateTransferRecord: (id: number, data: TransferRecordUpdate) => 
    ipcRenderer.invoke('update-transfer-record', id, data),
  
  deleteTransferRecord: (id: number) => 
    ipcRenderer.invoke('delete-transfer-record', id),
  
  // 盈亏统计
  getProfitStatistics: (startDate: string, endDate: string) => 
    ipcRenderer.invoke('get-profit-statistics', startDate, endDate),
  
  getOpeningBalance: (date: string) => 
    ipcRenderer.invoke('get-opening-balance', date),
  
  getAccountBalance: () => 
    ipcRenderer.invoke('get-account-balance'),
  
  getHoldingsMarketValue: (date: string) => 
    ipcRenderer.invoke('get-holdings-market-value', date),
  
  getTradeStatsInRange: (startDate: string, endDate: string) => 
    ipcRenderer.invoke('get-trade-stats-in-range', startDate, endDate)
});
```

## Type Definitions for Renderer

在 `src/types.ts` 或 `shared/types/index.ts` 中：

```typescript
// TypeScript declarations for window.api
declare global {
  interface Window {
    api: {
      getTransferRecords(limit: number, offset: number): Promise<TransferRecord[]>;
      addTransferRecord(record: TransferRecordInput): Promise<{ id: number }>;
      updateTransferRecord(id: number, data: TransferRecordUpdate): Promise<{ success: boolean }>;
      deleteTransferRecord(id: number): Promise<{ success: boolean }>;
      getProfitStatistics(startDate: string, endDate: string): Promise<{
        openingAccountBalance: number;
        closingAccountBalance: number;
        openingHoldingsValue: number;
        closingHoldingsValue: number;
        totalIn: number;
        totalOut: number;
        profit: number;
        startDate: string;
        endDate: string;
      }>;
      getOpeningBalance(date: string): Promise<number>;
      getAccountBalance(): Promise<number>;
      getHoldingsMarketValue(date: string): Promise<{
        marketValue: number;
        details: Array<{
          stockCode: string;
          stockName: string;
          closePrice: number;
          holdingCount: number;
          marketValue: number;
        }>;
        missingKlineStocks: string[];
      }>;
      getTradeStatsInRange(startDate: string, endDate: string): Promise<{
        totalIn: number;
        totalOut: number;
      }>;
    };
  }
}

export {};
```

## Error Handling Pattern

所有IPC调用应遵循统一的错误处理模式：

```typescript
// Main process (electron/services/fundService.ts)
try {
  // 执行操作
  const result = await operation();
  return result;
} catch (error) {
  console.error('Fund service error:', error);
  throw new Error(`FUND_SERVICE_ERROR: ${error.message}`);
}

// Renderer process (Vue component)
try {
  const result = await window.api.getTransferRecords(20, 0);
  // 处理结果
} catch (error) {
  if (error.message.includes('DATABASE_ERROR')) {
    showError('数据库操作失败，请重试');
  } else if (error.message.includes('VALIDATION_ERROR')) {
    showError('输入数据无效，请检查');
  } else {
    showError('未知错误，请联系技术支持');
  }
}
```

## Validation Rules

### TransferRecord Input Validation

```typescript
function validateTransferRecord(record: TransferRecordInput): void {
  if (!record.transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.transferDate)) {
    throw new Error('VALIDATION_ERROR: Invalid date format');
  }
  
  if (!record.amount || record.amount <= 0) {
    throw new Error('VALIDATION_ERROR: Amount must be positive');
  }
  
  const validTypes = ['IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX', 'STOCK_BUY', 'STOCK_SELL', 'INTEREST'];
  if (!record.type || !validTypes.includes(record.type)) {
    throw new Error('VALIDATION_ERROR: Invalid transfer type');
  }
}
```

### Date Range Validation

```typescript
function validateDateRange(startDate: string, endDate: string): void {
  if (!startDate || !endDate) {
    throw new Error('INVALID_DATE_RANGE: Both dates are required');
  }
  
  if (startDate > endDate) {
    throw new Error('INVALID_DATE_RANGE: Start date must be before end date');
  }
}
```

## Performance Considerations

1. **Pagination**: 每次请求最多返回20条记录（FR-012a）
2. **Indexing**: 数据库已创建索引优化查询性能
3. **Caching**: 不缓存kline_data和trade_record数据，每次都实时查询（FR-011, FR-011b）
4. **Timeout**: IPC调用超时时间设置为5秒
5. **K线数据查询优化**: 对于缺失日期的K线数据，使用子查询获取最近前一个交易日的收盘价

## Security Considerations

1. **SQL Injection**: 使用参数化查询，防止SQL注入
2. **Input Validation**: 所有输入在主进程进行验证
3. **Error Messages**: 错误消息不包含敏感信息
4. **Type Safety**: 使用TypeScript确保类型安全

## Version History

- **v1.0** (2026-05-03): Initial version for fund management feature
- **v1.1** (2026-05-08): 更新盈亏统计接口，新增getHoldingsMarketValue和getTradeStatsInRange接口，移除getCurrentHoldingsTotal接口
