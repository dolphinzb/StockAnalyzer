# Quickstart: 自选股K线数据下载与展示功能

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

### K线弹窗展示

1. 打开自选股列表页面
2. 点击某只股票的**名称**，弹出K线弹窗
3. 弹窗默认展示**前复权**模式的日K线图
4. 可通过弹窗顶部的切换控件切换为"不复权"模式
5. 当K线数据超过可视区域时，可按住鼠标左键左右拖动查看不同日期范围
6. K线图上会标注交易记录：买入(B)、卖出(S)、分红(D)
7. 将鼠标悬停在交易标注上可查看交易详情
8. 点击关闭按钮或弹窗外部区域关闭弹窗

## Key Files

| File | Description |
|------|-------------|
| `electron/services/klineDownloadService.ts` | K线下载服务（stock-sdk集成、调度、交易日判断、前复权数据获取） |
| `electron/database.ts` | 数据库操作（kline_data表、saveKlineData、getKlineData，复用已有getTradeRecordsByStockCode） |
| `electron/index.ts` | IPC handlers注册、调度器启停 |
| `shared/types/index.ts` | 类型定义（KlineData、KlineAPI等，复用已有TradeRecord） |
| `src/components/KlineDownloadDialog.vue` | 下载对话框组件 |
| `src/components/KlineChartDialog.vue` | K线弹窗组件（K线图渲染、复权切换、拖动、交易标注） |
| `src/composables/useKlineChart.ts` | K线图渲染逻辑（Canvas绑定、蜡烛图、成交量、拖动交互） |
| `src/components/StockItem.vue` | 自选股列表项（增加下载按钮、名称可点击） |

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
| `kline:get-chart-data` | R → M | 获取K线图展示数据（支持前复权/不复权） |
| `kline:get-trade-records` | R → M | 获取交易记录数据（复用已有TradeRecord） |

## Troubleshooting

- **下载失败**: 检查网络连接，确认 stock-sdk 可正常访问东方财富API
- **非交易日不下载**: 正常行为，查看日志确认跳过原因
- **数据重复**: 系统自动按股票代码+日期去重，新数据覆盖旧数据
- **K线弹窗无数据**: 确认已下载该股票的K线数据，弹窗会提示"暂无K线数据，请先下载"
- **K线图拖动不流畅**: 检查K线数据量是否过大，系统仅渲染可视区域数据
- **交易标注不显示**: 确认 trade_record 表中有该股票的交易记录，且交易日期在K线数据范围内
