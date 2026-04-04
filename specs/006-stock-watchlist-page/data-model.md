# Data Model: 自选股页面

**Feature**: 006-stock-watchlist-page
**Date**: 2026-04-04

## 实体定义

### WatchlistStock (自选股)

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | 唯一标识 |
| stockCode | TEXT | UNIQUE, NOT NULL | 股票代码 |
| stockName | TEXT | NOT NULL | 股票名称 |
| buyThreshold | REAL | NOT NULL | 买入阈值 |
| sellThreshold | REAL | NOT NULL | 卖出阈值 |
| monitorEnabled | INTEGER | NOT NULL, DEFAULT 0 | 监控开关 (0/1) |
| currentPrice | REAL | NULL | 当前价格 |
| createdAt | TEXT | NOT NULL | 创建时间 |
| updatedAt | TEXT | NOT NULL | 更新时间 |

**约束**: `sellThreshold > buyThreshold` (应用层校验)

## 数据库表结构

```sql
CREATE TABLE IF NOT EXISTS watchlist_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_code TEXT UNIQUE NOT NULL,
    stock_name TEXT NOT NULL,
    buy_threshold REAL NOT NULL,
    sell_threshold REAL NOT NULL,
    monitor_enabled INTEGER NOT NULL DEFAULT 0,
    current_price REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

## 配置来源

监控配置（API地址、轮询间隔和交易时间段）存储在 `config` 表的 `app_config` 配置项中：

```json
{
  "api": {
    "url": "https://api.example.com/stock?code="
  },
  "polling": {
    "interval": 1
  },
  "trading": {
    "morningStart": "09:30",
    "morningEnd": "11:30",
    "afternoonStart": "13:00",
    "afternoonEnd": "15:00"
  }
}
```

| 配置路径 | 类型 | 说明 |
|----------|------|------|
| api.url | string | 股票价格API地址（拼接股票代码获取价格） |
| polling.interval | number | 轮询间隔（分钟） |
| trading.morningStart | string | 上午交易开始时间（HH:mm格式） |
| trading.morningEnd | string | 上午交易结束时间（HH:mm格式） |
| trading.afternoonStart | string | 下午交易开始时间（HH:mm格式） |
| trading.afternoonEnd | string | 下午交易结束时间（HH:mm格式） |

## 状态枚举

### MonitorState (监控状态)

```typescript
enum MonitorState {
  ENABLED = 1,   // 已开启监控
  DISABLED = 0   // 已关闭监控
}
```

### AlertType (告警类型)

```typescript
enum AlertType {
  BUY = 'BUY',   // 买入告警 (价格 <= 买入阈值)
  SELL = 'SELL'  // 卖出告警 (价格 >= 卖出阈值)
}
```

## 关系图

```
┌─────────────────────┐
│   watchlist_stocks  │
├─────────────────────┤
│ id (PK)             │
│ stock_code          │
│ stock_name          │
│ buy_threshold       │
│ sell_threshold      │
│ monitor_enabled     │
│ current_price       │
│ created_at          │
│ updated_at          │
└─────────────────────┘
```

## 索引

- `idx_watchlist_stocks_monitor_enabled`: ON `watchlist_stocks(monitor_enabled)` - 用于快速查询已开启监控的股票
- `idx_watchlist_stocks_stock_code`: ON `watchlist_stocks(stock_code)` - 用于去重校验
