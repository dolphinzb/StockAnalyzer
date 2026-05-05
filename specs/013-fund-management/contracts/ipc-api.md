# IPC Interface Contracts: 资金管理功能

**Date**: 2026-05-03  
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

### 2. 盈利统计接口

#### getProfitStatistics

获取指定时间段内的转账统计数据

**Request**:
```typescript
{
  channel: 'get-profit-statistics',
  args: [
    startDate: string,  // YYYY-MM-DD
    endDate: string     // YYYY-MM-DD
  ]
}
```

**Response**:
```typescript
{
  totalIn: number,      // 转入总额
  totalOut: number,     // 转出总额
  startDate: string,
  endDate: string
}
```

**Errors**:
- `INVALID_DATE_RANGE`: 日期范围无效（startDate > endDate）
- `DATABASE_ERROR`: 数据库查询失败

---

#### getCurrentHoldingsTotal

获取当前持仓总市值

**Request**:
```typescript
{
  channel: 'get-current-holdings-total',
  args: []
}
```

**Response**:
```typescript
number  // 持仓总市值（元）
```

**Errors**:
- `HOLDINGS_SERVICE_ERROR`: 持仓服务不可用
- `CALCULATION_ERROR`: 计算失败

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
  
  // 盈利统计
  getProfitStatistics: (startDate: string, endDate: string) => 
    ipcRenderer.invoke('get-profit-statistics', startDate, endDate),
  
  getCurrentHoldingsTotal: () => 
    ipcRenderer.invoke('get-current-holdings-total')
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
        totalIn: number;
        totalOut: number;
        startDate: string;
        endDate: string;
      }>;
      getCurrentHoldingsTotal(): Promise<number>;
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
  
  if (!record.type || !['IN', 'OUT'].includes(record.type)) {
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
3. **Caching**: 不缓存持仓数据，每次都实时查询（FR-011）
4. **Timeout**: IPC调用超时时间设置为5秒

## Security Considerations

1. **SQL Injection**: 使用参数化查询，防止SQL注入
2. **Input Validation**: 所有输入在主进程进行验证
3. **Error Messages**: 错误消息不包含敏感信息
4. **Type Safety**: 使用TypeScript确保类型安全

## Version History

- **v1.0** (2026-05-03): Initial version for fund management feature
