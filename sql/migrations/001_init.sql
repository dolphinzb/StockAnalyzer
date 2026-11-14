-- ============================================================
-- V1：初始结构（基线）
-- 内容等于引入迁移框架时的线上库结构，作为版本起点。
-- 已被基线标记的存量库不会重复执行本文件。
-- 约束：迁移文件内不得出现 BEGIN / COMMIT（执行器统一包事务）。
-- ============================================================

-- ============================================
-- 1. 配置表
-- ============================================
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER
);

-- ============================================
-- 2. 交易记录表
-- ============================================
CREATE TABLE IF NOT EXISTS trade_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT DEFAULT NULL,
  stock_name TEXT DEFAULT NULL,
  trade_date TEXT DEFAULT NULL,
  trade_type TEXT DEFAULT NULL,
  trade_price REAL DEFAULT NULL,
  trade_count INTEGER DEFAULT NULL,
  holding_count INTEGER DEFAULT NULL,
  holding_price REAL DEFAULT NULL
);

-- ============================================
-- 3. 自选股表
-- ============================================
CREATE TABLE IF NOT EXISTS watchlist_stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT UNIQUE NOT NULL,
  stock_name TEXT NOT NULL,
  buy_threshold REAL NOT NULL,
  sell_threshold REAL NOT NULL,
  monitor_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_monitor_enabled
ON watchlist_stocks(monitor_enabled);

CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_stock_code
ON watchlist_stocks(stock_code);

-- ============================================
-- 4. 转账记录表（资金管理）
-- ============================================
CREATE TABLE IF NOT EXISTS transfer_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK(amount > 0),
  type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX', 'STOCK_BUY', 'STOCK_SELL', 'INTEREST')),
  account_balance REAL NOT NULL DEFAULT 0,
  trade_record_id INTEGER,  -- 关联的交易记录ID,可为NULL
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_transfer_date_desc ON transfer_records(transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_type_date ON transfer_records(type, transfer_date);

-- ============================================
-- 5. K线数据表（日线 / 周线 / 月线，三表同构）
-- 注意：三张表结构必须保持完全一致（字段集合与唯一键），
--       任何字段变更都必须同步修改 kline_daily / kline_weekly / kline_monthly 三处。
-- ============================================

-- 日线
CREATE TABLE IF NOT EXISTS kline_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  adjust_type TEXT NOT NULL DEFAULT '',
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
  UNIQUE(stock_code, trade_date, adjust_type)
);

-- 周线
CREATE TABLE IF NOT EXISTS kline_weekly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  adjust_type TEXT NOT NULL DEFAULT '',
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
  UNIQUE(stock_code, trade_date, adjust_type)
);

-- 月线
CREATE TABLE IF NOT EXISTS kline_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  adjust_type TEXT NOT NULL DEFAULT '',
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
  UNIQUE(stock_code, trade_date, adjust_type)
);

-- 创建索引优化查询性能（三表索引命名按周期区分）
CREATE INDEX IF NOT EXISTS idx_kline_daily_code ON kline_daily(stock_code);
CREATE INDEX IF NOT EXISTS idx_kline_daily_date ON kline_daily(trade_date);
CREATE INDEX IF NOT EXISTS idx_kline_daily_code_date_adjust ON kline_daily(stock_code, trade_date, adjust_type);

CREATE INDEX IF NOT EXISTS idx_kline_weekly_code ON kline_weekly(stock_code);
CREATE INDEX IF NOT EXISTS idx_kline_weekly_date ON kline_weekly(trade_date);
CREATE INDEX IF NOT EXISTS idx_kline_weekly_code_date_adjust ON kline_weekly(stock_code, trade_date, adjust_type);

CREATE INDEX IF NOT EXISTS idx_kline_monthly_code ON kline_monthly(stock_code);
CREATE INDEX IF NOT EXISTS idx_kline_monthly_date ON kline_monthly(trade_date);
CREATE INDEX IF NOT EXISTS idx_kline_monthly_code_date_adjust ON kline_monthly(stock_code, trade_date, adjust_type);

-- ============================================
-- 6. 初始化默认配置（新库首次启动即有默认配置）
-- ============================================
INSERT OR IGNORE INTO config (key, value, updated_at)
VALUES ('app_config', '{"trading":{"morningStart":"09:30","morningEnd":"11:30","afternoonStart":"13:00","afternoonEnd":"15:00"},"polling":{"interval":1},"api":{"provider":"sina","url":"https://hq.sinajs.cn/list="}}', strftime('%s', 'now') * 1000);
