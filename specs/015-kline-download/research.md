# Research: 自选股K线数据下载功能

**Date**: 2026-05-08  
**Feature**: 015-kline-download

## Technical Decisions & Rationale

### 1. stock-sdk 集成方式

**Decision**: 在 Electron 主进程中安装并使用 stock-sdk，通过 `StockSDK` 类实例化后调用 `getHistoryKline` 方法获取K线数据

**Rationale**:
- stock-sdk 支持 Node.js 18+ 环境，Electron 28.x 的主进程完全兼容
- 零依赖，不会增加打包体积
- 提供完整的 TypeScript 类型定义
- 支持不复权参数（`adjust: ''`），满足需求

**Implementation approach**:
```typescript
import { StockSDK } from 'stock-sdk';

const sdk = new StockSDK();

// 获取不复权日K线数据
const klines = await sdk.getHistoryKline('000001', {
  period: 'daily',
  adjust: '',       // 不复权原始数据
  startDate: '20260101',
  endDate: '20260508',
});
```

**stock-sdk getHistoryKline API 详情**:
- 参数 `symbol`: 股票代码，支持 `'000001'` 或 `'sz000001'` 格式
- 参数 `period`: `'daily'` | `'weekly'` | `'monthly'`，默认 `'daily'`
- 参数 `adjust`: `''`（不复权）| `'qfq'`（前复权）| `'hfq'`（后复权），默认 `'qfq'`
- 参数 `startDate` / `endDate`: 格式 `YYYYMMDD`
- 返回 `HistoryKline[]`:
  - `date`: string (YYYY-MM-DD)
  - `code`: string
  - `open`: number | null
  - `close`: number | null
  - `high`: number | null
  - `low`: number | null
  - `volume`: number | null
  - `amount`: number | null
  - `changePercent`: number | null (涨跌幅%)
  - `change`: number | null (涨跌额)
  - `amplitude`: number | null (振幅%)
  - `turnoverRate`: number | null (换手率%)

**Alternatives considered**:
- 在渲染进程中使用：受限于 Electron sandbox 限制，无法直接使用 Node.js API
- 使用其他数据源（新浪/腾讯）：需要自行解析GBK编码，stock-sdk已封装好
- 自行封装API：重复造轮子，stock-sdk已提供完整功能

---

### 2. 股票代码格式转换

**Decision**: 复用项目已有的 `getStockCodeWithPrefix` 逻辑，在调用 stock-sdk 时根据需要添加/移除前缀

**Rationale**:
- 项目中自选股代码存储为纯数字格式（如 `000001`、`600519`）
- stock-sdk 的 `getHistoryKline` 支持纯数字格式和带前缀格式
- 数据库中存储纯数字代码，与自选股表保持一致
- 已有 `priceFetcher.ts` 中的 `getStockCodeWithPrefix` 函数可参考

**Implementation approach**:
```typescript
// stock-sdk 支持纯数字代码，无需转换
const klines = await sdk.getHistoryKline('000001', { ... });

// 如果需要带前缀格式
function getStockCodeWithPrefix(code: string): string {
  if (code.startsWith('6') || code.startsWith('5')) return `sh${code}`;
  if (code.startsWith('0') || code.startsWith('1') || code.startsWith('3')) return `sz${code}`;
  return code;
}
```

**Alternatives considered**:
- 统一使用带前缀格式：stock-sdk两种格式都支持，纯数字更简洁
- 存储时带前缀：与现有数据库设计不一致

---

### 3. 交易日判断策略

**Decision**: 使用 stock-sdk 的 `getTradingCalendar` API 获取交易日历，结合简单周末排除规则

**Rationale**:
- stock-sdk 提供 `getTradingCalendar` API，返回交易日历数据
- 日历数据包含 `date` 和 `isOpen` 字段，可精确判断是否为交易日
- 比简单的周末排除更准确（能处理法定节假日调休）
- 缓存交易日历数据，避免频繁请求

**Implementation approach**:
```typescript
// 获取交易日历
const calendar = await sdk.getTradingCalendar();
const today = calendar.find(item => item.date === '2026-05-08');
const isTradingDay = today?.isOpen ?? false;

// 缓存策略：每天最多请求一次交易日历
// 简单回退：如果API不可用，使用周末排除规则
function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}
```

**Alternatives considered**:
- 纯周末排除：无法处理法定节假日和调休
- 硬编码节假日列表：维护成本高，每年需要更新
- 第三方交易日历API：增加额外依赖，stock-sdk已内置

---

### 4. K线数据存储方案

**Decision**: 在现有 SQLite 数据库中新建 `kline_data` 表，使用 UPSERT 语义按股票代码+日期去重

**Rationale**:
- 所有自选股的K线数据存储在同一张表中（FR-005要求）
- UPSERT语义确保重复下载时新数据覆盖旧数据（FR-006要求）
- 使用股票代码+日期作为唯一约束，保证数据唯一性
- 表结构与 stock-sdk 返回的 HistoryKline 字段对齐

**Implementation approach**:
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

-- UPSERT 语义
INSERT OR REPLACE INTO kline_data (...) VALUES (...);
```

**Alternatives considered**:
- 每只股票一张表：管理复杂，FR-005明确要求同一张表
- 不使用唯一约束：无法保证去重，数据可能重复
- 使用 INSERT OR IGNORE：无法更新已有数据，违反FR-006

---

### 5. 自动下载定时任务实现

**Decision**: 参考现有 `backupService.ts` 的调度模式，在 `klineDownloadService.ts` 中实现定时调度

**Rationale**:
- 项目已有 `backupService.ts` 使用 setTimeout 递归调度模式，成熟可靠
- 每天15:10触发，使用 setTimeout 计算到目标时间的延迟
- 交易日判断在触发时执行，非交易日跳过并记录日志
- 串行逐只下载，避免API限流（FR-008a要求）

**Implementation approach**:
```typescript
// 参考 backupService.ts 的调度模式
let downloadTimeout: NodeJS.Timeout | null = null;

function scheduleNextDownload(): void {
  const now = new Date();
  const target = new Date();
  target.setHours(17, 0, 0, 0);
  
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  
  const delay = target.getTime() - now.getTime();
  downloadTimeout = setTimeout(async () => {
    await performAutoDownload();
    scheduleNextDownload();
  }, delay);
}

async function performAutoDownload(): Promise<void> {
  // 1. 判断是否为交易日
  // 2. 获取所有自选股
  // 3. 串行逐只下载
  // 4. 记录结果到日志
}
```

**Alternatives considered**:
- 使用 cron 库：增加依赖，项目已有调度模式可复用
- 使用 setInterval：不够精确，可能错过触发时间
- 在渲染进程中调度：依赖窗口状态，不可靠

---

### 6. 手动下载UI交互方案

**Decision**: 在 StockItem.vue 的操作列中增加"下载K线"按钮，点击后弹出 Modal 对话框包含 DateRangePicker 组件

**Rationale**:
- 项目已有 `Modal.vue` 组件和 `DateRangePicker.vue` 组件，可直接复用
- DateRangePicker 已实现日期验证逻辑（开始日期不能晚于结束日期）
- 需要扩展 DateRangePicker 增加默认值和结束日期不能晚于当前日期的验证
- 下载过程中按钮显示加载状态，防止重复触发（FR-011）

**Implementation approach**:
- StockItem.vue: 增加"下载K线"按钮，调整 grid 列宽
- StockList.vue: 增加"下载K线"列头
- 新建 KlineDownloadDialog.vue: 封装下载对话框逻辑
- 复用 Modal.vue + DateRangePicker.vue

**Alternatives considered**:
- 在 StockList 顶部添加批量下载按钮：FR-001a明确不支持批量手动下载
- 使用独立页面：交互过于复杂，3次点击内完成的需求无法满足
- 使用右键菜单：不够直观，用户可能不知道有此功能

---

### 7. 下载状态管理方案

**Decision**: 在 watchlist store 中增加下载状态管理，使用 Map 跟踪每只股票的下载状态

**Rationale**:
- 下载状态是运行时状态，不需要持久化
- 使用 Map<stockCode, DownloadStatus> 跟踪每只股票的下载进度
- 与现有 watchlist store 集成，避免创建额外 store

**Implementation approach**:
```typescript
interface DownloadStatus {
  isDownloading: boolean;
  result?: {
    success: boolean;
    count?: number;
    error?: string;
  };
}

// 在 watchlist store 中
const downloadStatusMap = ref<Map<string, DownloadStatus>>(new Map());
```

**Alternatives considered**:
- 独立 klineDownload store：过度设计，下载功能与自选股紧密关联
- 组件内部状态：无法跨组件共享下载状态
- 数据库持久化：下载状态是临时状态，不需要持久化

---

### 8. 错误处理与重试策略

**Decision**: 自动下载失败时重试1次，手动下载不自动重试但显示错误提示

**Rationale**:
- FR-010a要求自动下载失败时自动重试1次
- 手动下载由用户主动触发，失败后用户可自行决定是否重试
- stock-sdk 内置重试机制（可配置 retry），但应用层仍需处理业务级重试
- 错误信息需友好化，不暴露技术细节

**Implementation approach**:
```typescript
async function downloadWithRetry(stockCode: string, startDate: string, endDate: string, retry = false): Promise<DownloadResult> {
  try {
    const klines = await sdk.getHistoryKline(stockCode, {
      period: 'daily',
      adjust: '',
      startDate,
      endDate,
    });
    return { success: true, count: klines.length, data: klines };
  } catch (error) {
    if (!retry) {
      // 自动下载时重试1次
      return downloadWithRetry(stockCode, startDate, endDate, true);
    }
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
}
```

**Alternatives considered**:
- 手动下载也自动重试：用户体验不佳，应让用户决定
- 指数退避重试：过度设计，1次重试足够
- 不重试：网络抖动等临时性错误会导致不必要的失败

---

## Best Practices Identified

### 数据库操作
- 使用 UPSERT 语义确保数据去重和更新
- 批量插入使用事务，提升性能
- 下载完成后调用 saveDatabase() 持久化

### 错误处理
- 自动下载失败不阻塞其他股票的下载
- 使用 electron-log 记录详细日志
- 前端使用 Toast 通知展示结果

### 代码复用
- 复用 DateRangePicker.vue 和 Modal.vue 组件
- 复用 backupService.ts 的调度模式
- 复用 priceFetcher.ts 的股票代码前缀逻辑

### 性能优化
- 串行下载避免API限流
- 交易日历缓存减少API调用
- 下载状态实时反馈

## Integration Points

### 1. 与 stock-sdk 集成
- 安装 stock-sdk npm 包
- 在 klineDownloadService.ts 中创建 StockSDK 实例
- 调用 getHistoryKline 获取K线数据
- 调用 getTradingCalendar 获取交易日历

### 2. 与数据库集成
- 在 database.ts 中新建 kline_data 表
- 实现 saveKlineData / getKlineData 方法
- 使用 UPSERT 语义去重

### 3. 与 IPC 集成
- 新增 kline:download IPC 通道（手动下载）
- 新增 kline:get-data IPC 通道（查询K线数据）
- 在 preload 中暴露 KlineAPI

### 4. 与自选股列表集成
- 修改 StockItem.vue 增加下载按钮
- 修改 StockList.vue 增加列头
- 在 watchlist store 中管理下载状态

## Risk Assessment

### Low Risk
- stock-sdk 集成：成熟的npm包，TypeScript类型完整
- 数据库表设计：与现有模式一致
- UI组件复用：DateRangePicker和Modal已验证

### Medium Risk
- 交易日历API可用性：getTradingCalendar 可能返回大量数据，需要缓存策略
- 自动下载定时任务：需确保Electron主进程持续运行
- StockItem列宽调整：增加按钮后可能需要调整整体布局

### Mitigation Strategies
- 交易日历缓存：每天最多请求一次，API不可用时回退到周末排除
- 定时任务可靠性：参考已有backupService的成熟模式
- 布局调整：使用更紧凑的按钮样式，必要时调整grid列宽

## Open Questions (Resolved)

✅ All NEEDS CLARIFICATION items from Technical Context have been resolved through this research phase.
