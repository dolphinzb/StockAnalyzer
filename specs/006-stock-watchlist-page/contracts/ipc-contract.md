# IPC Contract: 自选股页面

**Feature**: 006-stock-watchlist-page
**Date**: 2026-04-04

## 概述

本契约定义了渲染进程（Renderer）与主进程（Main）之间的 IPC 通信接口。
所有通信通过 `contextBridge.exposeInMainWorld` 暴露的 API 执行。

## Preload API 契约

```typescript
interface StockWatcherAPI {
  // 自选股操作
  getWatchlist(): Promise<WatchlistStock[]>;
  addStock(stock: AddStockInput): Promise<WatchlistStock>;
  updateStock(id: number, updates: UpdateStockInput): Promise<WatchlistStock>;
  deleteStock(id: number): Promise<void>;

  // 监控配置
  getMonitorConfig(): Promise<MonitorConfig>;
  updateMonitorConfig(config: UpdateMonitorConfigInput): Promise<MonitorConfig>;

  // 价格刷新
  refreshPrices(): Promise<void>;
  getLastRefreshTime(): Promise<string | null>;

  // 事件订阅
  onPriceUpdate(callback: (prices: PriceUpdate[]) => void): () => void;
  onAlert(callback: (alert: Alert) => void): () => void;
  onRefreshTimeUpdate(callback: (time: string) => void): () => void;
}
```

## 数据类型

### WatchlistStock

```typescript
interface WatchlistStock {
  id: number;
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
  monitorEnabled: boolean;
  currentPrice: number | null;
  createdAt: string;
  updatedAt: string;
}
```

### MonitorConfig

```typescript
interface MonitorConfig {
  apiUrl: string;
  pollInterval: number;
}
```

### Alert

```typescript
interface Alert {
  stockCode: string;
  stockName: string;
  alertType: 'BUY' | 'SELL';
  triggerPrice: number;
  threshold: number;
  timestamp: string;
}
```

### PriceUpdate

```typescript
interface PriceUpdate {
  stockCode: string;
  price: number;
  timestamp: string;
}
```

## 输入类型

### AddStockInput

```typescript
interface AddStockInput {
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
}
```

### UpdateStockInput

```typescript
interface UpdateStockInput {
  buyThreshold?: number;
  sellThreshold?: number;
  monitorEnabled?: boolean;
}
```

### UpdateMonitorConfigInput

```typescript
interface UpdateMonitorConfigInput {
  apiUrl?: string;
  pollInterval?: number;
}
```

## IPC 通道定义

| 通道 | 方向 | 用途 |
|------|------|------|
| `watchlist:get` | invoke | 获取自选股列表 |
| `watchlist:add` | invoke | 添加股票 |
| `watchlist:update` | invoke | 更新股票 |
| `watchlist:delete` | invoke | 删除股票 |
| `config:get` | invoke | 获取监控配置 |
| `config:update` | invoke | 更新监控配置 |
| `prices:refresh` | invoke | 手动刷新价格 |
| `prices:last-time` | invoke | 获取最后刷新时间 |
| `prices:update` | send(on) | 价格更新事件 |
| `alert:trigger` | send(on) | 告警触发事件 |
| `refresh:time-update` | send(on) | 刷新时间更新事件 |

## 错误码

| 错误码 | 说明 |
|--------|------|
| `DUPLICATE_STOCK` | 股票已存在 |
| `INVALID_THRESHOLD` | 阈值无效（卖出<=买入） |
| `STOCK_NOT_FOUND` | 股票不存在 |
| `API_ERROR` | API 调用失败 |
