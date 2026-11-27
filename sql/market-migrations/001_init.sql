-- ============================================================
-- V1：全市场行情库 `market_data.db` 初始结构
--
-- 与业务库 `stockanalyzer.db` 完全独立的版本序列（独立 PRAGMA user_version）。
-- 约定：
--   - 时间戳列为 INTEGER epoch 秒（UTC）
--   - 日期列为 TEXT `YYYY-MM-DD`
--   - stock_code 为 6 位纯数字，exchange 单独存储
--   - 迁移文件内不得出现 BEGIN / COMMIT（执行器统一包事务）
-- ============================================================

-- ============================================
-- 1. 全库级元数据（不参与行情事实查询）
-- ============================================
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ============================================
-- 2. 证券主数据（沪市 / 深市 / 北交所 A 股普通股，含已退市）
-- ============================================
CREATE TABLE IF NOT EXISTS securities (
  code TEXT PRIMARY KEY,
  exchange TEXT NOT NULL CHECK (exchange IN ('SH', 'SZ', 'BJ')),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'STOCK',
  list_date TEXT,
  delist_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  code_source TEXT NOT NULL CHECK (
    code_source IN (
      'sse_name', 'szse_name', 'bse_name',
      'sse_delist', 'szse_delist',
      'sdk_active', 'manual'
    )
  ),
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_securities_exchange_active
  ON securities (exchange, is_active);

-- ============================================
-- 3. 交易日历（只保存开市交易日）
-- ============================================
CREATE TABLE IF NOT EXISTS trading_calendar (
  trade_date TEXT PRIMARY KEY
) WITHOUT ROWID;

-- ============================================
-- 4. 原始日线事实表（唯一事实源，不保存复权类型）
-- ============================================
CREATE TABLE IF NOT EXISTS kline_daily_raw (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  amplitude REAL,
  change_percent REAL,
  change_amount REAL,
  turnover_rate REAL,
  source TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, trade_date)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_kline_daily_raw_date_code
  ON kline_daily_raw (trade_date, stock_code);

-- ============================================
-- 5. 复权因子（按股票全量替换，不保存版本列）
--    qfq_close = close_raw × qfq_factor
--    hfq_close = close_raw × hfq_factor
-- ============================================
CREATE TABLE IF NOT EXISTS adjust_factors (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  qfq_factor REAL NOT NULL,
  hfq_factor REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, trade_date)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_adjust_factors_date_code
  ON adjust_factors (trade_date, stock_code);

-- ============================================
-- 6. 周线派生缓存（不复权聚合）
-- ============================================
CREATE TABLE IF NOT EXISTS kline_weekly_raw (
  stock_code TEXT NOT NULL,
  period_start_date TEXT NOT NULL,
  period_end_date TEXT NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  turnover_rate REAL,
  source TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, period_start_date),
  CHECK (period_start_date <= period_end_date)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_kline_weekly_raw_end_code
  ON kline_weekly_raw (period_end_date, stock_code);

-- ============================================
-- 7. 月线派生缓存（不复权聚合）
-- ============================================
CREATE TABLE IF NOT EXISTS kline_monthly_raw (
  stock_code TEXT NOT NULL,
  period_start_date TEXT NOT NULL,
  period_end_date TEXT NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  turnover_rate REAL,
  source TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, period_start_date),
  CHECK (period_start_date <= period_end_date)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_kline_monthly_raw_end_code
  ON kline_monthly_raw (period_end_date, stock_code);

-- ============================================
-- 8. 同步任务状态（task_key = <stock_code>:<data_kind> 或 __MARKET__:<data_kind>）
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
  task_key TEXT PRIMARY KEY,
  stock_code TEXT,
  data_kind TEXT NOT NULL CHECK (
    data_kind IN (
      'active_codes', 'delisted_codes', 'calendar',
      'raw_daily', 'qfq_daily', 'hfq_daily'
    )
  ),
  last_success_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'success', 'failed', 'disabled')
  ),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  last_attempt_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_state_due
  ON sync_state (status, next_retry_at);

CREATE INDEX IF NOT EXISTS idx_sync_state_stock
  ON sync_state (stock_code, data_kind);

-- ============================================
-- 9. 数据质量异常（只追加，不作为行情事实源）
-- ============================================
CREATE TABLE IF NOT EXISTS data_quality_issues (
  id INTEGER PRIMARY KEY,
  stock_code TEXT NOT NULL,
  trade_date TEXT,
  issue_type TEXT NOT NULL CHECK (
    issue_type IN (
      'gap', 'ohlc_invalid', 'duplicate',
      'price_jump', 'stale', 'factor_invalid'
    )
  ),
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_quality_issues_stock_date
  ON data_quality_issues (stock_code, trade_date);
