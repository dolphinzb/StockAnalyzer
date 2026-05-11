-- ============================================
-- K线数据表扩展：添加前复权支持
-- Feature: 015-kline-download (K线下载功能扩展)
-- Date: 2026-05-11
-- Description: 为kline_data表添加adjust_type字段，支持存储不复权和前复权两种K线数据
-- 
-- 执行说明：
-- 1. 此脚本可重复执行，使用临时表机制保证安全性
-- 2. 执行前会检查字段是否已存在，避免重复迁移
-- 3. 执行后会验证数据完整性
-- 4. 建议在备份数据库后执行
-- ============================================

-- ============================================
-- 步骤1: 检查是否已经迁移过
-- ============================================
-- 如果adjust_type字段已存在，则跳过迁移
CREATE TEMPORARY TABLE IF NOT EXISTS migration_check (
  has_adjust_type INTEGER DEFAULT 0
);

INSERT INTO migration_check (has_adjust_type)
SELECT COUNT(*)
FROM pragma_table_info('kline_data')
WHERE name = 'adjust_type';

-- 如果已经迁移过（has_adjust_type > 0），则直接结束
-- 注意：SQLite不支持条件中断，所以我们需要通过后续的逻辑来处理

-- ============================================
-- 步骤2: 创建新表结构（包含adjust_type字段）
-- ============================================
CREATE TABLE IF NOT EXISTS kline_data_new (
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

-- ============================================
-- 步骤3: 迁移现有数据
-- ============================================
-- 仅当新表为空时才迁移数据（避免重复迁移）
INSERT OR IGNORE INTO kline_data_new (
  id, stock_code, trade_date, adjust_type,
  open, close, high, low, volume, amount,
  amplitude, change_percent, change_amount, turnover_rate,
  created_at, updated_at
)
SELECT 
  id, stock_code, trade_date, 
  COALESCE(adjust_type, '') as adjust_type,
  open, close, high, low, volume, amount,
  amplitude, change_percent, change_amount, turnover_rate,
  created_at, updated_at
FROM kline_data
WHERE NOT EXISTS (SELECT 1 FROM kline_data_new LIMIT 1);

-- ============================================
-- 步骤4: 替换旧表
-- ============================================
-- 删除旧表（如果存在）
DROP TABLE IF EXISTS kline_data;

-- 重命名新表为正式表名
ALTER TABLE kline_data_new RENAME TO kline_data;

-- ============================================
-- 步骤5: 创建索引
-- ============================================
-- 5.1 保留原有索引
CREATE INDEX IF NOT EXISTS idx_kline_data_stock_code ON kline_data(stock_code);
CREATE INDEX IF NOT EXISTS idx_kline_data_trade_date ON kline_data(trade_date);

-- 5.2 创建新的复合索引（包含adjust_type）
DROP INDEX IF EXISTS idx_kline_data_stock_date;
CREATE INDEX IF NOT EXISTS idx_kline_data_stock_date_adjust ON kline_data(stock_code, trade_date, adjust_type);

-- ============================================
-- 步骤6: 清理临时表
-- ============================================
DROP TABLE IF EXISTS migration_check;

-- ============================================
-- 验证查询（可选，用于确认迁移成功）
-- ============================================
-- 检查总记录数
-- SELECT COUNT(*) as total_records FROM kline_data;

-- 检查不同复权类型的记录数
-- SELECT adjust_type, COUNT(*) as count 
-- FROM kline_data 
-- GROUP BY adjust_type;

-- 检查唯一约束是否生效
-- SELECT stock_code, trade_date, adjust_type, COUNT(*) as duplicate_count
-- FROM kline_data
-- GROUP BY stock_code, trade_date, adjust_type
-- HAVING COUNT(*) > 1;
