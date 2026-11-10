import { app } from 'electron';
import log from 'electron-log';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import initSqlJs, { Database } from 'sql.js';
import type { AddTradeResult, AppConfig, KlinePeriod } from '../shared/types';
import { calcHoldingPrice, type CalcResult } from './services/tradeService';

/**
 * 自选股实体类型
 */
export interface WatchlistStock {
  id: number;
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
  monitorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** 用户自定义排序值，升序展示 */
  sortOrder: number;
}

/**
 * 添加股票输入类型
 */
export interface AddStockInput {
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
}

/**
 * 更新股票输入类型
 */
export interface UpdateStockInput {
  buyThreshold?: number;
  sellThreshold?: number;
  monitorEnabled?: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  trading: {
    morningStart: '09:30',
    morningEnd: '11:30',
    afternoonStart: '13:00',
    afternoonEnd: '15:00',
  },
  polling: {
    interval: 1,
  },
  api: {
    provider: 'sina',
    url: 'https://hq.sinajs.cn/list=',
  },
};

let db: Database | null = null;

export function getDatabasePath(): string {
  return join(app.getPath('home'), '.stockanalyzer', 'stockanalyzer.db');
}

/**
 * K线三张表的建表语句（与 sql/init.sql 保持一致）
 * 运行时无法可靠读取 sql/init.sql（打包后不在 files 白名单内），故内联；
 * 修改K线表字段时必须同步 sql/init.sql 与本处 DDL
 */
export const KLINE_TABLE_DDL = ['kline_daily', 'kline_weekly', 'kline_monthly']
  .map(
    table => `
CREATE TABLE IF NOT EXISTS ${table} (
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
CREATE INDEX IF NOT EXISTS idx_${table}_code ON ${table}(stock_code);
CREATE INDEX IF NOT EXISTS idx_${table}_date ON ${table}(trade_date);
CREATE INDEX IF NOT EXISTS idx_${table}_code_date_adjust ON ${table}(stock_code, trade_date, adjust_type);`
  )
  .join('\n');

/**
 * 判断数据库对象（表/索引）是否存在
 */
function hasDbObject(database: Database, type: 'table' | 'index', name: string): boolean {
  const result = database.exec(
    `SELECT name FROM sqlite_master WHERE type = '${type}' AND name = '${name}'`
  );
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * 统计表行数
 */
function countTableRows(database: Database, table: string): number {
  const result = database.exec(`SELECT COUNT(*) FROM ${table}`);
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  return Number(result[0].values[0][0]);
}

/**
 * K线表拆分自动迁移（幂等）
 * - kline_data 存在且 kline_daily 不存在：改名（不搬行数据）并清理旧索引
 * - 三表/索引缺失：按新结构补齐（IF NOT EXISTS）
 * - kline_data 与 kline_daily 同时存在：跳过自动迁移，保留现状并告警
 * @param database 已加载的数据库实例
 * @returns 是否发生了需要落盘的变更
 */
function migrateKlineTables(database: Database): boolean {
  const hasLegacy = hasDbObject(database, 'table', 'kline_data');
  const hasDaily = hasDbObject(database, 'table', 'kline_daily');

  if (hasLegacy && hasDaily) {
    log.warn('检测到 kline_data 与 kline_daily 同时存在，跳过K线表自动迁移（需人工确认数据归属）');
    return false;
  }

  let changed = false;

  if (hasLegacy && !hasDaily) {
    const beforeCount = countTableRows(database, 'kline_data');
    database.run('ALTER TABLE kline_data RENAME TO kline_daily');
    for (const index of [
      'idx_kline_data_stock_code',
      'idx_kline_data_trade_date',
      'idx_kline_data_stock_date_adjust',
    ]) {
      database.run(`DROP INDEX IF EXISTS ${index}`);
    }

    database.run(KLINE_TABLE_DDL);

    const afterCount = countTableRows(database, 'kline_daily');
    if (afterCount !== beforeCount) {
      throw new Error(`K线表迁移失败：日线记录数不一致（${beforeCount} → ${afterCount}）`);
    }

    log.info(`K线表迁移完成：kline_data → kline_daily，日线 ${afterCount} 条，已创建周线/月线表`);
    changed = true;
  }

  // 补齐缺失的表与索引（新库、已迁移库、旧库改名后都会走到这里）
  const needEnsure =
    !hasDaily ||
    !hasDbObject(database, 'table', 'kline_weekly') ||
    !hasDbObject(database, 'table', 'kline_monthly') ||
    !hasDbObject(database, 'index', 'idx_kline_daily_code_date_adjust');

  if (needEnsure) {
    database.run(KLINE_TABLE_DDL);
    log.info('K线三表与索引已就绪（kline_daily / kline_weekly / kline_monthly）');
    changed = true;
  }

  return changed;
}

/**
 * 自选股顺序字段自动迁移（幂等）
 * - 表不存在：跳过（新建库由 sql/init.sql 建表，已含该字段）
 * - 字段已存在：跳过，保留用户已保存的顺序
 * - 字段缺失：新增列，并按升级前的可见顺序（监控优先、更新时间倒序、id 兜底）回填，
 *   保证升级后列表外观与升级前一致
 * @param database 已加载的数据库实例
 * @returns 是否发生了需要落盘的变更
 */
function migrateWatchlistSortOrder(database: Database): boolean {
  if (!hasDbObject(database, 'table', 'watchlist_stocks')) {
    log.warn('watchlist_stocks 表不存在，跳过自选股顺序字段迁移');
    return false;
  }

  const tableInfo = database.exec('PRAGMA table_info(watchlist_stocks)');
  const columns = tableInfo.length > 0 ? tableInfo[0].values.map(row => String(row[1])) : [];
  if (columns.includes('sort_order')) {
    return false;
  }

  database.run('ALTER TABLE watchlist_stocks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');

  const result = database.exec(
    'SELECT id FROM watchlist_stocks ORDER BY monitor_enabled DESC, updated_at DESC, id ASC'
  );
  const ids = result.length > 0 ? result[0].values.map(row => Number(row[0])) : [];
  ids.forEach((id, index) => {
    database.run('UPDATE watchlist_stocks SET sort_order = ? WHERE id = ?', [index, id]);
  });

  log.info(`自选股顺序字段迁移完成：回填 ${ids.length} 条记录`);
  return true;
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDatabasePath();
  log.info(`初始化数据库: ${dbPath}`);

  const SQL = await initSqlJs();

  const configDir = join(dbPath, '..');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    if (existsSync(dbPath)) {
      const fileBuffer = readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      log.info('数据库文件加载成功');

      // 存量库自动迁移（均为幂等操作，全部在内存完成后统一落盘）
      const klineMigrated = migrateKlineTables(db);
      const watchlistMigrated = migrateWatchlistSortOrder(db);
      if (klineMigrated || watchlistMigrated) {
        saveDatabase();
      }
    } else {
      log.warn('数据库文件不存在:', dbPath);
      throw new Error('数据库文件不存在，请先通过迁移脚本初始化数据库');
    }
  } catch (error) {
    log.error('数据库初始化失败:', error);
    throw error;
  }
}

export function saveDatabase(): void {
  if (!db) {
    log.warn('saveDatabase: db is null');
    return;
  }
  const dbPath = getDatabasePath();
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
  log.info('saveDatabase: 数据库已保存到', dbPath);
}

export function loadConfig(): AppConfig {
  if (!db) {
    log.warn('数据库未初始化，使用默认配置');
    return { ...DEFAULT_CONFIG };
  }

  try {
    const result = db.exec("SELECT value FROM config WHERE key = 'app_config'");
    if (result.length > 0 && result[0].values.length > 0) {
      const configJson = result[0].values[0][0] as string;
      const config = JSON.parse(configJson) as AppConfig;
      log.info('从数据库加载配置成功');
      return config;
    }
  } catch (error) {
    log.error('从数据库加载配置失败:', error);
  }

  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: AppConfig): boolean {
  if (!db) {
    log.error('数据库未初始化，无法保存配置');
    return false;
  }

  try {
    const configJson = JSON.stringify(config);
    db.run(
      "UPDATE config SET value = ?, updated_at = ? WHERE key = 'app_config'",
      [configJson, Date.now()]
    );
    saveDatabase();
    log.info('配置保存到数据库成功');
    return true;
  } catch (error) {
    log.error('保存配置到数据库失败:', error);
    return false;
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase();
    db.close();
    db = null;
  }
}

export function getDb(): Database {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return db;
}

/** 自选股查询列清单（sort_order 固定追加在末尾，避免既有下标错位） */
const WATCHLIST_SELECT_COLUMNS =
  'id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order';

function rowToWatchlistStock(row: any[]): WatchlistStock {
  return {
    id: row[0] as number,
    stockCode: row[1] as string,
    stockName: row[2] as string,
    buyThreshold: row[3] as number,
    sellThreshold: row[4] as number,
    monitorEnabled: row[5] === 1,
    createdAt: row[6] as string,
    updatedAt: row[7] as string,
    sortOrder: row[8] as number,
  };
}

export function getWatchlist(): WatchlistStock[] {
  const database = getDb();
  const result = database.exec(
    `SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks ORDER BY sort_order ASC, id ASC`
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToWatchlistStock);
}

export function getWatchlistById(id: number): WatchlistStock | null {
  const database = getDb();
  const result = database.exec(
    `SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks WHERE id = ?`,
    [id]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  return rowToWatchlistStock(result[0].values[0]);
}

export function getEnabledStocks(): WatchlistStock[] {
  const database = getDb();
  const result = database.exec(
    `SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks WHERE monitor_enabled = 1 ORDER BY sort_order ASC, id ASC`
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToWatchlistStock);
}

export function getStockByCode(stockCode: string): WatchlistStock | null {
  const database = getDb();
  const result = database.exec(
    `SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks WHERE stock_code = ?`,
    [stockCode]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  return rowToWatchlistStock(result[0].values[0]);
}

export function addStock(input: AddStockInput): WatchlistStock {
  const database = getDb();
  const now = new Date().toISOString();
  database.run(
    `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
     VALUES (?, ?, ?, ?, 0, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM watchlist_stocks))`,
    [input.stockCode, input.stockName, input.buyThreshold, input.sellThreshold, now, now]
  );
  saveDatabase();
  const inserted = getStockByCode(input.stockCode);
  if (!inserted) {
    throw new Error('添加股票失败');
  }
  return inserted;
}

export function updateStock(id: number, input: UpdateStockInput): WatchlistStock | null {
  const database = getDb();
  const existing = getWatchlistById(id);
  if (!existing) {
    return null;
  }
  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];
  if (input.buyThreshold !== undefined) {
    updates.push('buy_threshold = ?');
    values.push(input.buyThreshold);
  }
  if (input.sellThreshold !== undefined) {
    updates.push('sell_threshold = ?');
    values.push(input.sellThreshold);
  }
  if (input.monitorEnabled !== undefined) {
    updates.push('monitor_enabled = ?');
    values.push(input.monitorEnabled ? 1 : 0);
  }
  values.push(id);
  database.run(
    `UPDATE watchlist_stocks SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
  saveDatabase();
  return getWatchlistById(id);
}

export function deleteStock(id: number): boolean {
  const database = getDb();
  const existing = getWatchlistById(id);
  if (!existing) {
    return false;
  }
  database.run('DELETE FROM watchlist_stocks WHERE id = ?', [id]);
  saveDatabase();
  return true;
}

/**
 * 按给定顺序值恢复自选股的排序（仅作用于内存库，不落盘）
 * 用于落盘失败时回滚已提交的内存变更
 * @param database 数据库实例
 * @param orders 重排前的 id 与顺序值
 */
function restoreSortOrders(
  database: Database,
  orders: Array<{ id: number; sortOrder: number }>
): void {
  database.run('BEGIN');
  try {
    orders.forEach(order => {
      database.run('UPDATE watchlist_stocks SET sort_order = ? WHERE id = ?', [
        order.sortOrder,
        order.id,
      ]);
    });
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    log.error('恢复自选股顺序失败:', error);
  }
}

/**
 * 按给定 id 顺序重写自选股排序值
 * 说明：整表重写为连续的 0..N-1，同时压缩删除产生的空缺；重排不改写 updated_at
 * 事务提交成功但落盘失败时，会按重排前的顺序值恢复内存库，保证界面与磁盘一致
 * @param orderedIds 完整的有序自选股 id 列表
 * @returns 重排后的完整自选股列表
 */
export function reorderWatchlist(orderedIds: number[]): WatchlistStock[] {
  const database = getDb();
  const beforeResult = database.exec('SELECT id, sort_order FROM watchlist_stocks');
  const beforeOrders =
    beforeResult.length > 0
      ? beforeResult[0].values.map(row => ({
          id: Number(row[0]),
          sortOrder: Number(row[1]),
        }))
      : [];

  database.run('BEGIN');
  try {
    orderedIds.forEach((id, index) => {
      database.run('UPDATE watchlist_stocks SET sort_order = ? WHERE id = ?', [index, id]);
    });
    database.run('COMMIT');
  } catch (error) {
    database.run('ROLLBACK');
    log.error('重排自选股顺序失败，已回滚:', error);
    throw error;
  }

  try {
    saveDatabase();
  } catch (error) {
    // 内存库已提交但磁盘未写入：恢复内存顺序，避免重启后顺序回退造成不一致
    log.error('重排自选股顺序落盘失败，恢复内存顺序:', error);
    restoreSortOrders(database, beforeOrders);
    throw error;
  }

  return getWatchlist();
}

export interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;
  holdingPrice: number;
  lastTradeDate: string;
  currentPrice: number | null;
  profitAmount: number | null;
  profitRatio: number | null;
}

export interface TradeRecord {
  id: number;
  stockCode: string;
  stockName: string;
  tradeDate: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradePrice: number;
  tradeCount: number;
  holdingCount: number;
  holdingPrice: number;
}

export interface AddTradeInput {
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}

function rowToTradeRecord(row: any[]): TradeRecord {
  return {
    id: row[0] as number,
    stockCode: row[1] as string,
    stockName: row[2] as string,
    tradeDate: row[3] as string,
    tradeType: row[4] as 'BUY' | 'SELL' | 'DIVIDEND',
    tradePrice: row[5] as number,
    tradeCount: row[6] as number,
    holdingCount: row[7] as number,
    holdingPrice: row[8] as number,
  };
}

export function getPositions(): Position[] {
  const database = getDb();
  // 获取每个股票的最新交易记录（按id最大），然后过滤出持仓数量大于0的股票
  const result = database.exec(`
    SELECT t1.stock_code, t1.stock_name, t1.holding_count, t1.holding_price, t1.trade_date
    FROM trade_record t1
    INNER JOIN (
      SELECT stock_code, MAX(id) as max_id
      FROM trade_record
      GROUP BY stock_code
    ) t2 ON t1.id = t2.max_id
    WHERE t1.holding_count > 0
  `);
  if (result.length === 0 || result[0].values.length === 0) {
    return [];
  }
  return result[0].values.map(row => ({
    stockCode: row[0] as string,
    stockName: row[1] as string,
    holdingCount: row[2] as number,
    holdingPrice: row[3] as number,
    lastTradeDate: row[4] as string,
    currentPrice: null,
    profitAmount: null,
    profitRatio: null,
  }));
}

export function getLastZeroTrade(stockCode: string): TradeRecord | null {
  const database = getDb();
  const result = database.exec(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     WHERE stock_code = ? AND holding_count = 0
     ORDER BY trade_date DESC LIMIT 1`,
    [stockCode]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  return rowToTradeRecord(result[0].values[0]);
}

function getFirstOpenAfterZero(stockCode: string, zeroDate: string): TradeRecord | null {
  const database = getDb();
  const result = database.exec(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     WHERE stock_code = ? AND trade_date > ? AND trade_type = 'BUY' AND holding_count > 0
     ORDER BY trade_date ASC LIMIT 1`,
    [stockCode, zeroDate]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }
  return rowToTradeRecord(result[0].values[0]);
}

export interface UpdateTradeInput {
  id: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
  holdingCount: number;
  holdingPrice: number;
}

export function updateTradeRecord(input: UpdateTradeInput): TradeRecord {
  const database = getDb();
  log.info('updateTradeRecord input:', JSON.stringify(input));
  database.run(
    `UPDATE trade_record
     SET stock_code = ?, stock_name = ?, trade_date = ?, trade_type = ?, trade_price = ?, trade_count = ?, holding_count = ?, holding_price = ?
     WHERE id = ?`,
    [input.stockCode, input.stockName, input.tradeDate, input.tradeType, input.tradePrice, input.tradeCount, input.holdingCount, input.holdingPrice, input.id]
  );
  saveDatabase();
  const result = database.exec(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record WHERE id = ?`,
    [input.id]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error('更新交易记录失败');
  }
  return rowToTradeRecord(result[0].values[0]);
}

export function deleteTradeRecord(id: number): void {
  const database = getDb();
  
  // 先删除关联的资金明细记录
  database.run(`DELETE FROM transfer_records WHERE trade_record_id = ?`, [id]);
  
  // 再删除交易记录
  database.run(`DELETE FROM trade_record WHERE id = ?`, [id]);
  
  saveDatabase();
}

/**
 * 分页查询交易记录的返回结果
 */
export interface PaginatedTradeRecords {
  records: TradeRecord[];
  total: number;
  hasMore: boolean;
}

/**
 * 分页查询交易记录
 * @param stockCode 股票代码
 * @param page 页码，从1开始
 * @param pageSize 每页条数，默认20
 * @returns 分页结果，包含记录列表、总数和是否还有更多记录
 */
export function getTradeRecords(stockCode: string, page: number = 1, pageSize: number = 20): PaginatedTradeRecords {
  const database = getDb();
  const lastZero = getLastZeroTrade(stockCode);

  // 构建查询条件：如果有上次清仓记录，只查询该清仓之后的交易记录（不包括清仓记录）
  let countQuery: string;
  let countParams: any[];
  let dataQuery: string;
  let dataParams: any[];

  if (lastZero) {
    // 找到清仓后的第一笔买入记录
    const firstOpenAfterZero = getFirstOpenAfterZero(stockCode, lastZero.tradeDate);

    if (firstOpenAfterZero) {
      // 如果有新的开仓记录，从该记录开始查询
      countQuery = `SELECT COUNT(*) as total FROM trade_record WHERE stock_code = ? AND trade_date >= ?`;
      countParams = [stockCode, firstOpenAfterZero.tradeDate];
      dataQuery = `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
                   FROM trade_record
                   WHERE stock_code = ? AND trade_date >= ?
                   ORDER BY trade_date DESC, id DESC
                   LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
      dataParams = [stockCode, firstOpenAfterZero.tradeDate];
    } else {
      // 如果清仓后没有新的交易，返回空结果
      return { records: [], total: 0, hasMore: false };
    }
  } else {
    // 没有清仓记录，查询所有交易记录
    countQuery = `SELECT COUNT(*) as total FROM trade_record WHERE stock_code = ?`;
    countParams = [stockCode];
    dataQuery = `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
                 FROM trade_record
                 WHERE stock_code = ?
                 ORDER BY trade_date DESC, id DESC
                 LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    dataParams = [stockCode];
  }

  // 查询总数
  const countResult = database.exec(countQuery, countParams);
  const total = countResult.length > 0 && countResult[0].values.length > 0
    ? (countResult[0].values[0][0] as number)
    : 0;

  // 查询分页数据
  const dataResult = database.exec(dataQuery, dataParams);
  const records = dataResult.length > 0
    ? dataResult[0].values.map(rowToTradeRecord)
    : [];

  // 计算是否还有更多记录
  const hasMore = page * pageSize < total;
  log.info(`getTradeRecords: stockCode=${stockCode}, page=${page}, pageSize=${pageSize}, total=${total}, hasMore=${hasMore}`);
  return { records, total, hasMore };
}

export function addTradeRecord(input: AddTradeInput): AddTradeResult {
  const database = getDb();
  // 获取最新交易记录用于计算持仓，只需第一页第一条
  const paginatedResult = getTradeRecords(input.stockCode, 1, 1);
  let preRecord: TradeRecord | null = null;
  if (paginatedResult.records.length > 0) {
    preRecord = paginatedResult.records[0];
  }
  const calcResult: CalcResult = calcHoldingPrice(
    preRecord,
    input.tradeType,
    input.tradePrice,
    input.tradeCount,
    input.stockCode
  );
  database.run(
    `INSERT INTO trade_record (stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.stockCode, input.stockName, input.tradeDate, input.tradeType, input.tradePrice, input.tradeCount, calcResult.holdingCount, calcResult.holdingPrice]
  );
  saveDatabase();
  const result = database.exec(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record WHERE stock_code = ? ORDER BY trade_date DESC LIMIT 1`,
    [input.stockCode]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error('添加交易记录失败');
  }
  const record = rowToTradeRecord(result[0].values[0]);
  return { record, fundSyncSuccess: true };
}

/**
 * 获取所有交易记录
 * @returns 所有交易记录数组，按股票代码和交易日期排序
 */
export function getAllTradeRecords(): TradeRecord[] {
  const database = getDb();
  const result = database.exec(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     ORDER BY stock_code, trade_date ASC`
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToTradeRecord);
}

/**
 * 按股票代码查询交易记录
 * @param stockCode 股票代码
 * @returns 该股票的所有交易记录数组，按交易日期正序排列
 */
export function getTradeRecordsByStockCode(stockCode: string): TradeRecord[] {
  const database = getDb();
  const result = database.exec(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     WHERE stock_code = ?
     ORDER BY trade_date ASC`,
    [stockCode]
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToTradeRecord);
}



/**
 * K线周期 → 数据表名 的白名单映射
 * 所有拼接表名的 SQL 必须经 tableOf() 取表名，禁止直接用外部入参拼接
 */
export const KLINE_TABLES: Record<KlinePeriod, string> = {
  d: 'kline_daily',
  w: 'kline_weekly',
  m: 'kline_monthly',
};

/**
 * 获取周期对应的K线数据表名（白名单校验）
 * @param period K线周期 d|w|m
 * @returns 数据表名
 * @throws 周期非法时抛错 INVALID_PERIOD（不静默返回空结果）
 */
export function tableOf(period: KlinePeriod): string {
  const table = KLINE_TABLES[period];
  if (!table) {
    throw new Error(`INVALID_PERIOD: 不支持的K线周期 ${String(period)}`);
  }
  return table;
}

/**
 * stock-sdk 返回的K线数据项类型
 */
interface HistoryKlineItem {
  date: string;
  code: string;
  open: number | null;
  close: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  amount: number | null;
  amplitude: number | null;
  changePercent: number | null;
  change: number | null;
  turnoverRate: number | null;
}

/**
 * 计算当前周期的起始日（周线取本周一，月线取本月 1 号）
 * 用本地时间手工拼串，避免 toISOString 的 UTC 时区偏移
 * @param period K线周期（周线/月线）
 * @returns 起始日期 YYYY-MM-DD
 */
export function getCurrentPeriodStart(period: 'w' | 'm'): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  if (period === 'm') {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  }
  // getDay(): 周日=0，转换为「周一=0」后再回退到本周一
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

/**
 * 批量保存K线数据到数据库
 * 使用事务批量 UPSERT（ON CONFLICT DO UPDATE），按股票代码+交易日期+复权类型去重
 * 使用 UPSERT 而非 INSERT OR REPLACE：后者冲突时先删后插，会导致 id 变化、created_at 被重置
 * 周线/月线：写入前清除当前周期内的旧记录，避免未完成周期按不同 trade_date 堆出多行
 * @param stockCode 股票代码（纯数字）
 * @param klines stock-sdk返回的K线数据数组
 * @param adjustType 复权类型：'' 不复权 | 'qfq' 前复权
 * @param period K线周期：d 日线 | w 周线 | m 月线（决定写入的数据表）
 * @param target 目标数据库实例（默认取全局库，测试可注入内存库）
 * @returns 保存的数据条数
 */
export function saveKlineData(
  stockCode: string,
  klines: HistoryKlineItem[],
  adjustType: '' | 'qfq' = '',
  period: KlinePeriod = 'd',
  target?: Database
): number {
  const database = target ?? getDb();
  const now = new Date().toISOString();
  const table = tableOf(period);

  try {
    // 开启事务
    database.run('BEGIN TRANSACTION');

    // 周线/月线：数据源对未完成周期返回的 trade_date 是「最新交易日」（11-04 → 11-05 → …），
    // 不清理会按不同日期堆出同一周期的多行。仅当本批数据包含当前周期的记录时才清理，
    // 避免下载纯历史区间时误删库中已有的当前周期数据。
    if (period !== 'd') {
      const periodStart = getCurrentPeriodStart(period);
      const hasCurrentPeriodBar = klines.some(kline => (kline.date || '') >= periodStart);
      if (hasCurrentPeriodBar) {
        database.run(
          `DELETE FROM ${table} WHERE stock_code = ? AND adjust_type = ? AND trade_date >= ?`,
          [stockCode, adjustType, periodStart]
        );
      }
    }

    for (const kline of klines) {
      // 去除股票代码前缀（如 sz000001 → 000001）
      const pureCode = kline.code ? kline.code.replace(/^(sh|sz)/, '') : stockCode;
      const tradeDate = kline.date || '';

      // UPSERT：唯一键冲突时走 DO UPDATE，保留原 id 与 created_at（首次入库时间），
      // 仅刷新行情字段与 updated_at；or REPLACE 会先删后插，导致 id 变化、created_at 丢失
      database.run(
        `INSERT INTO ${table} 
         (stock_code, trade_date, adjust_type, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stock_code, trade_date, adjust_type) DO UPDATE SET
           open = excluded.open,
           close = excluded.close,
           high = excluded.high,
           low = excluded.low,
           volume = excluded.volume,
           amount = excluded.amount,
           amplitude = excluded.amplitude,
           change_percent = excluded.change_percent,
           change_amount = excluded.change_amount,
           turnover_rate = excluded.turnover_rate,
           updated_at = excluded.updated_at`,
        [
          pureCode,
          tradeDate,
          adjustType,
          kline.open ?? null,
          kline.close ?? null,
          kline.high ?? null,
          kline.low ?? null,
          kline.volume ?? null,
          kline.amount ?? null,
          kline.amplitude ?? null,
          kline.changePercent ?? null,
          kline.change ?? null,
          kline.turnoverRate ?? null,
          now,
          now,
        ]
      );
    }

    // 提交事务
    database.run('COMMIT');
    // 注入外部数据库实例（测试）时不落全局库文件
    if (!target) {
      saveDatabase();
    }
    log.info(`K线数据保存成功: ${stockCode}, 周期: ${period}, 复权类型: ${adjustType}, 共 ${klines.length} 条`);
    return klines.length;
  } catch (error) {
    // 事务回滚
    database.run('ROLLBACK');
    log.error(`K线数据保存失败: ${stockCode}, 周期: ${period}, 复权类型: ${adjustType}`, error);
    throw error;
  }
}

/**
 * 将数据库行转换为KlineData对象
 */
function rowToKlineData(row: any[]): import('../shared/types').KlineData {
  return {
    id: row[0] as number,
    stockCode: row[1] as string,
    tradeDate: row[2] as string,
    adjustType: row[3] as '' | 'qfq',
    open: row[4] as number | null,
    close: row[5] as number | null,
    high: row[6] as number | null,
    low: row[7] as number | null,
    volume: row[8] as number | null,
    amount: row[9] as number | null,
    amplitude: row[10] as number | null,
    changePercent: row[11] as number | null,
    changeAmount: row[12] as number | null,
    turnoverRate: row[13] as number | null,
    createdAt: row[14] as string,
    updatedAt: row[15] as string,
  };
}

/**
 * 查询K线数据
 * @param stockCode 股票代码（纯数字）
 * @param period K线周期：d 日线 | w 周线 | m 月线（决定查询的数据表）
 * @param startDate 开始日期 (YYYY-MM-DD)，可选
 * @param endDate 结束日期 (YYYY-MM-DD)，可选
 * @returns K线数据数组，按交易日期升序排列
 */
export function getKlineData(
  stockCode: string,
  period: KlinePeriod = 'd',
  startDate?: string,
  endDate?: string
): import('../shared/types').KlineData[] {
  const database = getDb();
  const table = tableOf(period);

  let query = `SELECT id, stock_code, trade_date, adjust_type, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at
               FROM ${table} WHERE stock_code = ?`;
  const params: any[] = [stockCode];

  // 添加日期范围过滤
  if (startDate) {
    query += ` AND trade_date >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND trade_date <= ?`;
    params.push(endDate);
  }

  query += ` ORDER BY trade_date ASC`;

  const result = database.exec(query, params);

  if (result.length === 0) {
    return [];
  }

  return result[0].values.map(rowToKlineData);
}

/**
 * 获取K线图展示数据（从数据库查询，支持周期与前复权/不复权切换）
 * @param stockCode 股票代码
 * @param adjustType 复权类型：'' 不复权 | 'qfq' 前复权
 * @param period K线周期：d 日线 | w 周线 | m 月线（决定查询的数据表）
 * @returns K线数据数组，按交易日期升序排列
 */
export function getChartData(
  stockCode: string,
  adjustType: '' | 'qfq',
  period: KlinePeriod = 'd'
): import('../shared/types').KlineData[] {
  const database = getDb();
  const table = tableOf(period);

  const query = `SELECT id, stock_code, trade_date, adjust_type, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at
                 FROM ${table} WHERE stock_code = ? AND adjust_type = ? ORDER BY trade_date ASC`;

  const result = database.exec(query, [stockCode, adjustType]);

  if (result.length === 0) {
    return [];
  }

  return result[0].values.map(rowToKlineData);
}
