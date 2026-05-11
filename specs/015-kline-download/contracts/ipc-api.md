# IPC Interface Contracts: 自选股K线数据下载功能

**Date**: 2026-05-08  
**Feature**: 015-kline-download

## Overview

本文档定义了K线数据下载功能的 Electron IPC 接口契约，用于渲染进程（Vue前端）和主进程（Electron后端）之间的通信。

## Interface Definition

### 1. K线数据下载接口

#### downloadKline

下载指定股票在指定时间段内的日K线数据（不复权原始数据）

**Request**:
```typescript
{
  channel: 'kline:download',
  args: [{
    stockCode: string,    // 股票代码（纯数字，如 '000001'）
    startDate: string,    // 开始日期 (YYYYMMDD)
    endDate: string       // 结束日期 (YYYYMMDD)
  }]
}
```

**Response**:
```typescript
KlineDownloadResult

interface KlineDownloadResult {
  /** 是否成功 */
  success: boolean;
  /** 获取的数据条数 */
  count?: number;
  /** 失败原因 */
  error?: string;
}
```

**Errors**:
- `INVALID_DATE_RANGE`: 日期范围无效（开始日期晚于结束日期，或结束日期晚于当前日期）
- `INVALID_STOCK_CODE`: 股票代码无效
- `DOWNLOAD_ERROR`: stock-sdk 请求失败
- `DATABASE_ERROR`: 数据库写入失败

---

#### getKlineData

获取指定股票的K线数据（从本地数据库查询）

**Request**:
```typescript
{
  channel: 'kline:get-data',
  args: [
    stockCode: string,          // 股票代码
    startDate?: string,         // 开始日期 (YYYY-MM-DD)，可选
    endDate?: string            // 结束日期 (YYYY-MM-DD)，可选
  ]
}
```

**Response**:
```typescript
KlineData[]

interface KlineData {
  id: number;
  stockCode: string;
  tradeDate: string;        // YYYY-MM-DD
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  amplitude: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  turnoverRate: number | null;
  createdAt: string;
  updatedAt: string;
}
```

**Errors**:
- `DATABASE_ERROR`: 数据库查询失败

---

#### getChartData

获取K线图展示数据（从数据库读取，支持前复权/不复权切换）

**Request**:
```typescript
{
  channel: 'kline:get-chart-data',
  args: [
    stockCode: string,          // 股票代码
    adjustType: 'none' | 'qfq'  // 复权方式：'none'不复权 | 'qfq'前复权
  ]
}
```

**Response**:
```typescript
KlineData[]

interface KlineData {
  id: number;
  stockCode: string;
  tradeDate: string;        // YYYY-MM-DD
  adjustType: 'none' | 'qfq';
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  amplitude: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  turnoverRate: number | null;
  createdAt: string;
  updatedAt: string;
}
```

**Errors**:
- `DATABASE_ERROR`: 数据库查询失败
- `INVALID_STOCK_CODE`: 股票代码无效

**Note**: 此方法从本地数据库 kline_data 表查询已下载的K线数据，不进行网络请求。数据在下载时已通过 downloadKline 接口获取并存储。

---

#### getTradeRecords

获取指定股票的交易记录（用于K线图标注）

**Request**:
```typescript
{
  channel: 'kline:get-trade-records',
  args: [
    stockCode: string           // 股票代码
  ]
}
```

**Response**:
```typescript
TradeRecord[]

interface TradeRecord {
  id: number;
  stockCode: string;
  tradeDate: string;            // YYYY-MM-DD
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradePrice: number;
  tradeCount: number;
  holdingCount: number;
  totalCost: number;
  commission: number;
  stampDuty: number;
  transferFee: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
```

**Errors**:
- `DATABASE_ERROR`: 数据库查询失败

---

## Preload API Exposure

在 preload 脚本中暴露的API：

```typescript
contextBridge.exposeInMainWorld('klineAPI', {
  // 下载K线数据
  downloadKline: (input: KlineDownloadInput) => 
    ipcRenderer.invoke('kline:download', input),
  
  // 获取K线数据
  getKlineData: (stockCode: string, startDate?: string, endDate?: string) => 
    ipcRenderer.invoke('kline:get-data', stockCode, startDate, endDate),
  
  // 获取K线图展示数据（从数据库读取）
  getChartData: (stockCode: string, adjustType: 'none' | 'qfq') => 
    ipcRenderer.invoke('kline:get-chart-data', stockCode, adjustType),
  
  // 获取交易记录数据
  getTradeRecords: (stockCode: string) => 
    ipcRenderer.invoke('kline:get-trade-records', stockCode),
});
```

## Type Definitions for Renderer

在 `shared/types/index.ts` 中新增：

```typescript
/** K线数据记录 */
export interface KlineData {
  id: number;
  stockCode: string;
  tradeDate: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  amplitude: number | null;
  changePercent: number | null;
  changeAmount: number | null;
  turnoverRate: number | null;
  createdAt: string;
  updatedAt: string;
}

/** K线数据下载结果 */
export interface KlineDownloadResult {
  success: boolean;
  count?: number;
  error?: string;
}

/** K线数据下载输入参数 */
export interface KlineDownloadInput {
  stockCode: string;
  startDate: string;    // YYYYMMDD
  endDate: string;      // YYYYMMDD
}

/** K线数据API类型 */
export interface KlineAPI {
  downloadKline(input: KlineDownloadInput): Promise<KlineDownloadResult>;
  getKlineData(stockCode: string, startDate?: string, endDate?: string): Promise<KlineData[]>;
  getChartData(stockCode: string, adjustType: 'none' | 'qfq'): Promise<KlineData[]>;
  getTradeRecords(stockCode: string): Promise<TradeRecord[]>;
}
```

在 Window 接口中新增：

```typescript
declare global {
  interface Window {
    // ... 现有API ...
    klineAPI: KlineAPI;
  }
}
```

## Error Handling Pattern

```typescript
// 主进程 (electron/services/klineDownloadService.ts)
try {
  const klines = await sdk.getHistoryKline(stockCode, options);
  saveKlineData(klines);
  return { success: true, count: klines.length };
} catch (error) {
  log.error('K线数据下载失败:', error);
  return { 
    success: false, 
    error: error instanceof Error ? error.message : '未知错误' 
  };
}

// 渲染进程 (Vue组件)
try {
  const result = await window.klineAPI.downloadKline({
    stockCode: '000001',
    startDate: '20260408',
    endDate: '20260508',
  });
  if (result.success) {
    showToast(`下载完成，共获取 ${result.count} 条K线数据`, 'success');
  } else {
    showToast(`下载失败：${result.error}`, 'error');
  }
} catch (error) {
  showToast('下载异常，请重试', 'error');
}
```

## Validation Rules

### downloadKline 输入验证

```typescript
function validateDownloadInput(input: KlineDownloadInput): void {
  if (!input.stockCode || !/^\d{6}$/.test(input.stockCode)) {
    throw new Error('INVALID_STOCK_CODE: 股票代码必须为6位数字');
  }
  
  if (!input.startDate || !/^\d{8}$/.test(input.startDate)) {
    throw new Error('INVALID_DATE_RANGE: 开始日期格式无效');
  }
  
  if (!input.endDate || !/^\d{8}$/.test(input.endDate)) {
    throw new Error('INVALID_DATE_RANGE: 结束日期格式无效');
  }
  
  if (input.startDate > input.endDate) {
    throw new Error('INVALID_DATE_RANGE: 开始日期不能晚于结束日期');
  }
  
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (input.endDate > today) {
    throw new Error('INVALID_DATE_RANGE: 结束日期不能晚于当前日期');
  }
}
```

## Performance Considerations

1. **串行下载**: 自动下载时逐只串行请求，避免API限流
2. **批量写入**: 手动下载时使用事务批量写入数据库
3. **索引优化**: kline_data 表创建 stock_code 和 trade_date 索引
4. **缓存交易日历**: 每天最多请求一次 getTradingCalendar

## Security Considerations

1. **SQL Injection**: 使用参数化查询
2. **Input Validation**: 所有输入在主进程进行验证
3. **Error Messages**: 错误消息不暴露内部实现细节
4. **Type Safety**: 使用 TypeScript 确保类型安全

## Version History

- **v1.0** (2026-05-08): Initial version for K-line download feature
