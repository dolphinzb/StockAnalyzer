# Quickstart: 自选股页面

**Feature**: 006-stock-watchlist-page
**Date**: 2026-04-04

## 需求变更记录

### 变更 2026-04-10

- **变更内容**: 定时任务获取到最新价格后，不再保存到数据库；数据库表中删除当前价格字段；页面上展示的当前价格直接使用API实时获取
- **变更原因**: 当前价格是实时数据，无需持久化，直接从API获取更能保证数据时效性

### 变更 2026-04-16

- **变更内容**: 自选股列表在"名称"列与"当前价格"列之间增加五列：开盘价、当日最高价、当日最低价、涨跌额、涨跌幅；涨跌额/涨跌幅为正时红色显示，为负时绿色显示（遵循A股红涨绿跌惯例）
- **变更原因**: 用户需要更完整的日内行情信息，便于快速判断股票当日走势和波动范围

## 功能概述

自选股页面允许用户：
- 查看和管理自选股列表
- 设置股票的买入/卖出阈值
- 开启/关闭股票监控
- 自动/手动刷新股票价格
- 接收价格告警通知

## 快速开始

### 1. 页面位置

```
src/renderer/views/WatchlistView.vue
```

### 2. 相关组件

| 组件 | 路径 | 说明 |
|------|------|------|
| WatchlistView | `views/WatchlistView.vue` | 主页面 |
| StockList | `components/StockList.vue` | 股票列表组件 |
| StockItem | `components/StockItem.vue` | 列表项组件 |
| StockEditor | `components/StockEditor.vue` | 添加/编辑对话框 |

### 3. 状态管理

```typescript
// src/renderer/stores/watchlist.ts
import { defineStore } from 'pinia';

export const useWatchlistStore = defineStore('watchlist', () => {
  const stocks = ref<WatchlistStock[]>([]);
  const priceMap = ref<Record<string, StockPrice>>({});  // stockCode -> StockPrice
  const lastRefreshTime = ref<string | null>(null);
  const isLoading = ref(false);
  const isRefreshing = ref(false);

  // getters
  const enabledStocks = computed(() =>
    stocks.value.filter(s => s.monitorEnabled)
  );

  // actions
  async function fetchStocks() { /* ... */ }
  async function addStock(input: AddStockInput) { /* ... */ }
  async function updateStock(id: number, input: UpdateStockInput) { /* ... */ }
  async function deleteStock(id: number) { /* ... */ }
  async function refreshPrices() { /* ... */ }

  return {
    stocks,
    priceMap,
    lastRefreshTime,
    isLoading,
    isRefreshing,
    enabledStocks,
    fetchStocks,
    addStock,
    updateStock,
    deleteStock,
    refreshPrices
  };
});
```

### 4. IPC API 使用示例

```typescript
// 在组件中使用
const api = window.stockWatcherAPI;

// 获取自选股列表
const stocks = await api.getWatchlist();

// 添加股票
const newStock = await api.addStock({
  stockCode: '600519',
  stockName: '贵州茅台',
  buyThreshold: 1500,
  sellThreshold: 2000
});

// 订阅价格更新
const unsubscribe = api.onPriceUpdate((updates) => {
  updates.forEach(update => {
    console.log(`${update.stockCode}: 当前价=${update.price}, 开盘价=${update.openPrice}, 最高=${update.highPrice}, 最低=${update.lowPrice}, 涨跌额=${update.priceChange}, 涨跌幅=${update.priceChangePercent}%`);
  });
});

// 订阅告警
const unsubscribeAlert = api.onAlert((alert) => {
  console.log(`${alert.stockName} 触发${alert.alertType}告警`);
});
```

## 定时任务流程

```
┌─────────────────────────────────────────────────────────────┐
│                     程序启动                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 初始化数据库 (sql.js)                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 启动定时任务 (setInterval)                                  │
│ - 读取 config 表的 app_config                               │
│ - 检查当前时间是否在交易时间段内                             │
│ - 查询所有 monitor_enabled=1 的股票                         │
│ - 调用外部 API 获取价格（含开盘价、最高价、最低价、昨日收盘价）│
│ - 计算涨跌额和涨跌幅                                         │
│ - 通过事件推送价格更新到渲染进程                              │
│ - 检查阈值，触发告警                                         │
│ - 更新最后刷新时间                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     程序关闭                                 │
│ - 清除定时任务 (clearInterval)                              │
│ - 关闭数据库连接                                            │
└─────────────────────────────────────────────────────────────┘
```

**交易时间段判断**：
- 上午：09:30 - 11:30
- 下午：13:00 - 15:00
- 非交易时间段内，定时任务跳过API调用

## 告警防抖实现

```typescript
// 防抖映射: stockCode -> { type: AlertType, lastTime: timestamp }
const alertDebounceMap = new Map<string, { type: AlertType; lastTime: number }>();

function checkAlert(stock: WatchlistStock, currentPrice: number): void {
  const now = Date.now();
  const key = `${stock.stockCode}_${stock.currentPrice <= stock.buyThreshold ? 'BUY' : 'SELL'}`;
  const lastAlert = alertDebounceMap.get(key);

  // 5分钟防抖检查 (300000ms)
  if (lastAlert && (now - lastAlert.lastTime) < 300000) {
    return; // 在防抖期内，跳过
  }

  // 触发告警
  triggerAlert(stock, currentPrice);
  alertDebounceMap.set(key, { type: alertType, lastTime: now });
}
```

## 数据库初始化

```typescript
// src/main/database/index.ts
import Database from 'sql.js';
import { app } from 'electron';
import path from 'path';

const dbPath = path.join(app.getPath('userData'), 'stockwatcher.db');
const db = new Database(dbPath);

// 初始化表
db.run(`
  CREATE TABLE IF NOT EXISTS watchlist_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT UNIQUE NOT NULL,
    stock_name TEXT NOT NULL,
    buy_threshold REAL NOT NULL,
    sell_threshold REAL NOT NULL,
    monitor_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// 配置存储在 config 表的 app_config 项中
// {
//   "api": { "url": "https://api.example.com/stock?code=" },
//   "polling": { "interval": 1 },
//   "trading": { "morningStart": "09:30", "morningEnd": "11:30", "afternoonStart": "13:00", "afternoonEnd": "15:00" }
// }

export default db;
```

## 测试要点

1. **阈值校验**: 卖出阈值必须大于买入阈值
2. **重复股票**: 不能添加已存在的股票代码
3. **排序**: 已开启监控的股票排在前面
4. **防抖**: 5分钟内相同类型告警不重复触发
5. **定时任务**: 程序关闭后正确停止
6. **交易时间段**: 非交易时间段内定时任务跳过API调用
