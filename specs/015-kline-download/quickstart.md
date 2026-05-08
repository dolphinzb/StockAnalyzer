# Quickstart: 自选股K线数据下载功能

**Feature**: 015-kline-download  
**Date**: 2026-05-08

## Prerequisites

- Node.js 18+
- npm
- Electron 28.x 运行环境
- stock-sdk npm 包（需安装）

## Setup

### 1. 安装 stock-sdk 依赖

```bash
npm install stock-sdk
```

### 2. 构建项目

```bash
npm run build:electron
```

### 3. 开发模式运行

```bash
npm run dev
```

## Feature Usage

### 手动下载K线数据

1. 打开自选股列表页面
2. 找到目标股票，点击操作列的"下载K线"按钮
3. 在弹出的日期选择对话框中，确认或修改日期范围（默认1个月前~前一天）
4. 点击"确定"开始下载
5. 下载完成后，Toast通知显示结果

### 自动下载K线数据

- 系统在每个交易日15:10自动下载所有自选股的当日K线数据
- 非交易日自动跳过，日志记录跳过原因
- 下载失败自动重试1次
- 结果记录到 electron-log 日志文件中

## Key Files

| File | Description |
|------|-------------|
| `electron/services/klineDownloadService.ts` | K线下载服务（stock-sdk集成、调度、交易日判断） |
| `electron/database.ts` | 数据库操作（kline_data表、saveKlineData、getKlineData） |
| `electron/index.ts` | IPC handlers注册、调度器启停 |
| `shared/types/index.ts` | 类型定义（KlineData、KlineAPI等） |
| `src/components/KlineDownloadDialog.vue` | 下载对话框组件 |
| `src/components/StockItem.vue` | 自选股列表项（增加下载按钮） |

## Database Schema

```sql
-- K线数据表
CREATE TABLE IF NOT EXISTS kline_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL,
  close REAL,
  high REAL,
  low REAL,
  volume REAL,
  amount REAL,
  amplitude REAL,
  change_percent REAL,
  change_amount REAL,
  turnover_rate REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(stock_code, trade_date)
);
```

## IPC Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `kline:download` | R → M | 手动下载K线数据 |
| `kline:get-data` | R → M | 查询本地K线数据 |

## Troubleshooting

- **下载失败**: 检查网络连接，确认 stock-sdk 可正常访问东方财富API
- **非交易日不下载**: 正常行为，查看日志确认跳过原因
- **数据重复**: 系统自动按股票代码+日期去重，新数据覆盖旧数据
