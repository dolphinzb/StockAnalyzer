# IPC Contract: 自选股页面

**Feature**: 006-stock-watchlist-page
**Date**: 2026-04-04

## 需求变更记录

### 变更 2026-04-10

- **变更内容**: 定时任务获取到最新价格后，不再保存到数据库；数据库表中删除当前价格字段；页面上展示的当前价格直接使用API实时获取
- **变更原因**: 当前价格是实时数据，无需持久化，直接从API获取更能保证数据时效性

### 变更 2026-04-16

- **变更内容**: PriceUpdate 类型增加开盘价、当日最高价、当日最低价、昨日收盘价、涨跌额、涨跌幅字段；页面展示时涨跌额/涨跌幅为正红色、为负绿色
- **变更原因**: 用户需要更完整的日内行情信息，便于快速判断股票当日走势和波动范围

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
  createdAt: string;
  updatedAt: string;
}
```

**注意**: currentPrice 字段已移除，当前价格通过 PriceUpdate 事件实时获取，不包含在持久化数据中

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
  price: number;               // 当前价格
  openPrice: number;           // 开盘价
  highPrice: number;           // 当日最高价
  lowPrice: number;            // 当日最低价
  prevClosePrice: number;      // 昨日收盘价
  priceChange: number;         // 涨跌额 (= price - prevClosePrice)
  priceChangePercent: number;  // 涨跌幅 (= (price - prevClosePrice) / prevClosePrice × 100%，保留两位小数)
  timestamp: string;
}
```

**显示规则**: priceChange 和 priceChangePercent 为正时红色显示，为负时绿色显示（A股红涨绿跌惯例）

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
