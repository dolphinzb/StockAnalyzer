# Data Model: 自选股K线数据下载功能

**Date**: 2026-05-08  
**Feature**: 015-kline-download

## Entities

### 1. KlineData (K线数据 - 新增)

**Description**: 代表一只股票某一天的日K线数据，所有自选股的K线数据存储在同一张表中。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| id | number | 唯一标识符（自增主键） |
| stockCode | string | 股票代码（纯数字，与自选股表一致） |
| tradeDate | string | 交易日期 (YYYY-MM-DD) |
| open | number \| null | 开盘价 |
| close | number \| null | 收盘价 |
| high | number \| null | 最高价 |
| low | number \| null | 最低价 |
| volume | number \| null | 成交量 |
| amount | number \| null | 成交额 |
| amplitude | number \| null | 振幅(%) |
| changePercent | number \| null | 涨跌幅(%) |
| changeAmount | number \| null | 涨跌额 |
| turnoverRate | number \| null | 换手率(%) |
| createdAt | string | 创建时间 (ISO 8601) |
| updatedAt | string | 更新时间 (ISO 8601) |

**Constraints**:
- `UNIQUE(stock_code, trade_date)`: 股票代码+交易日期唯一约束，确保去重
- UPSERT语义：重复数据使用新值覆盖旧值

**SQL**:
```sql
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

CREATE INDEX IF NOT EXISTS idx_kline_data_stock_code
ON kline_data(stock_code);

CREATE INDEX IF NOT EXISTS idx_kline_data_trade_date
ON kline_data(trade_date);

CREATE INDEX IF NOT EXISTS idx_kline_data_stock_date
ON kline_data(stock_code, trade_date);
```

---

### 2. DownloadStatus (下载状态 - 运行时，不持久化)

**Description**: 代表一次K线数据下载操作的运行时状态，用于前端展示下载进度和结果。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| stockCode | string | 股票代码 |
| isDownloading | boolean | 是否正在下载 |
| result | DownloadResult \| null | 下载结果 |

---

### 3. DownloadResult (下载结果 - 运行时，不持久化)

**Description**: 代表K线数据下载的结果信息。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | 是否成功 |
| count | number \| undefined | 成功获取的数据条数 |
| error | string \| undefined | 失败原因 |

---

### 4. AutoDownloadSummary (自动下载汇总 - 运行时，不持久化)

**Description**: 自动下载完成后的汇总信息，用于日志记录。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| totalCount | number | 总股票数 |
| successCount | number | 成功数量 |
| failCount | number | 失败数量 |
| failedStocks | FailedStock[] | 失败股票详情列表 |
| skipped | boolean | 是否跳过（非交易日或空列表） |
| skipReason | string \| undefined | 跳过原因 |

---

### 5. FailedStock (失败股票详情 - 运行时，不持久化)

**Description**: 自动下载中失败的股票详情。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| stockCode | string | 股票代码 |
| stockName | string | 股票名称 |
| error | string | 失败原因 |

---

### 6. TradingCalendarItem (交易日历项 - 缓存，不持久化)

**Description**: stock-sdk 返回的交易日历数据项。

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| date | string | 日期 (YYYY-MM-DD) |
| isOpen | boolean | 是否为交易日 |

---

## Data Flow

### 1. 手动下载K线数据流程

```
用户点击"下载K线"按钮
       ↓
弹出日期选择对话框（默认1个月前~前一天）
       ↓
用户选择日期范围并确认
       ↓
前端验证日期有效性（开始≤结束，结束≤今天）
       ↓
IPC调用 kline:download { stockCode, startDate, endDate }
       ↓
主进程调用 stock-sdk getHistoryKline(symbol, { adjust: '', startDate, endDate })
       ↓
获取 HistoryKline[] 数据
       ↓
转换为 KlineData 格式，批量 UPSERT 写入数据库
       ↓
返回下载结果 { success, count, error? }
       ↓
前端显示 Toast 通知
```

**数据转换映射**:
```
HistoryKline.date        → KlineData.tradeDate
HistoryKline.code        → KlineData.stockCode (去除前缀)
HistoryKline.open        → KlineData.open
HistoryKline.close       → KlineData.close
HistoryKline.high        → KlineData.high
HistoryKline.low         → KlineData.low
HistoryKline.volume      → KlineData.volume
HistoryKline.amount      → KlineData.amount
HistoryKline.amplitude   → KlineData.amplitude
HistoryKline.changePercent → KlineData.changePercent
HistoryKline.change      → KlineData.changeAmount
HistoryKline.turnoverRate → KlineData.turnoverRate
```

---

### 2. 自动下载当日K线数据流程

```
定时器15:10触发
       ↓
调用 getTradingCalendar 判断今天是否为交易日
       ↓
非交易日 → 记录日志"非交易日，跳过K线数据下载" → 结束
       ↓
交易日 → 获取所有自选股列表
       ↓
自选股列表为空 → 记录日志"自选股列表为空，跳过K线数据下载" → 结束
       ↓
串行逐只下载：
  for each stock in watchlist:
    try:
      klines = await sdk.getHistoryKline(stockCode, { adjust: '', startDate: today, endDate: today })
      saveKlineData(klines)
      successCount++
    catch:
      // 重试1次
      try:
        klines = await sdk.getHistoryKline(stockCode, { adjust: '', startDate: today, endDate: today })
        saveKlineData(klines)
        successCount++
      catch:
        failCount++
        failedStocks.push({ stockCode, stockName, error })
       ↓
记录汇总日志
```

---

### 3. 交易日历缓存流程

```
需要判断交易日
       ↓
检查缓存：是否有当日交易日历数据？
       ↓
有缓存 → 使用缓存数据判断 isOpen
       ↓
无缓存 → 调用 sdk.getTradingCalendar()
       ↓
缓存结果（当日有效）
       ↓
使用缓存数据判断 isOpen
       ↓
API不可用 → 回退到周末排除规则
```

---

## Type Definitions

### New TypeScript Interfaces

```typescript
// shared/types/index.ts

/** K线数据记录 */
export interface KlineData {
  /** 唯一标识符 */
  id: number;
  /** 股票代码（纯数字） */
  stockCode: string;
  /** 交易日期 (YYYY-MM-DD) */
  tradeDate: string;
  /** 开盘价 */
  open: number | null;
  /** 收盘价 */
  close: number | null;
  /** 最高价 */
  high: number | null;
  /** 最低价 */
  low: number | null;
  /** 成交量 */
  volume: number | null;
  /** 成交额 */
  amount: number | null;
  /** 振幅(%) */
  amplitude: number | null;
  /** 涨跌幅(%) */
  changePercent: number | null;
  /** 涨跌额 */
  changeAmount: number | null;
  /** 换手率(%) */
  turnoverRate: number | null;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/** K线数据下载结果 */
export interface KlineDownloadResult {
  /** 是否成功 */
  success: boolean;
  /** 获取的数据条数 */
  count?: number;
  /** 失败原因 */
  error?: string;
}

/** K线数据下载输入参数 */
export interface KlineDownloadInput {
  /** 股票代码 */
  stockCode: string;
  /** 开始日期 (YYYYMMDD) */
  startDate: string;
  /** 结束日期 (YYYYMMDD) */
  endDate: string;
}

/** K线数据API类型 - 通过 preload contextBridge 暴露给渲染进程 */
export interface KlineAPI {
  /** 下载指定股票的K线数据 */
  downloadKline(input: KlineDownloadInput): Promise<KlineDownloadResult>;
  /** 获取指定股票的K线数据 */
  getKlineData(stockCode: string, startDate?: string, endDate?: string): Promise<KlineData[]>;
}
```

---

## Validation Rules

### 日期范围验证
- 开始日期不能晚于结束日期
- 结束日期不能晚于当前日期
- 日期格式必须为 YYYY-MM-DD（前端输入）或 YYYYMMDD（stock-sdk参数）

### K线数据验证
- stockCode 不能为空
- tradeDate 不能为空，格式 YYYY-MM-DD
- 数值字段允许为 null（stock-sdk 可能返回 null）
- UPSERT 按 stock_code + trade_date 去重

### 自动下载验证
- 仅在交易日15:10触发
- 非交易日跳过并记录日志
- 自选股列表为空时跳过并记录日志
- 失败时自动重试1次
