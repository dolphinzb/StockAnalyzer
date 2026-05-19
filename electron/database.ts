import { app } from 'electron';
import log from 'electron-log';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import initSqlJs, { Database } from 'sql.js';
import type { AddTradeResult, AppConfig } from '../shared/types';
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
  };
}

export function getWatchlist(): WatchlistStock[] {
  const database = getDb();
  const result = database.exec(
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at FROM watchlist_stocks ORDER BY monitor_enabled DESC, updated_at DESC'
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToWatchlistStock);
}

export function getWatchlistById(id: number): WatchlistStock | null {
  const database = getDb();
  const result = database.exec(
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at FROM watchlist_stocks WHERE id = ?',
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
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at FROM watchlist_stocks WHERE monitor_enabled = 1'
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToWatchlistStock);
}

export function getStockByCode(stockCode: string): WatchlistStock | null {
  const database = getDb();
  const result = database.exec(
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at FROM watchlist_stocks WHERE stock_code = ?',
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
    'INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
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
  // 先获取每个股票的最新交易记录，然后过滤出持仓数量大于0的股票
  const result = database.exec(`
    SELECT t1.stock_code, t1.stock_name, t1.holding_count, t1.holding_price, t1.trade_date
    FROM trade_record t1
    INNER JOIN (
      SELECT stock_code, MAX(trade_date) as max_date
      FROM trade_record
      GROUP BY stock_code
    ) t2 ON t1.stock_code = t2.stock_code AND t1.trade_date = t2.max_date
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
                   ORDER BY trade_date DESC
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
                 ORDER BY trade_date DESC
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
 * 批量保存K线数据到数据库
 * 使用事务批量INSERT OR REPLACE，按股票代码+交易日期去重
 * @param stockCode 股票代码（纯数字）
 * @param klines stock-sdk返回的K线数据数组
 * @returns 保存的数据条数
 */
/**
 * 批量保存K线数据到数据库
 * 使用事务批量INSERT OR REPLACE，按股票代码+交易日期+复权类型去重
 * @param stockCode 股票代码（纯数字）
 * @param klines stock-sdk返回的K线数据数组
 * @param adjustType 复权类型：'' 不复权 | 'qfq' 前复权
 * @returns 保存的数据条数
 */
export function saveKlineData(stockCode: string, klines: HistoryKlineItem[], adjustType: '' | 'qfq' = ''): number {
  const database = getDb();
  const now = new Date().toISOString();

  try {
    // 开启事务
    database.run('BEGIN TRANSACTION');

    for (const kline of klines) {
      // 去除股票代码前缀（如 sz000001 → 000001）
      const pureCode = kline.code ? kline.code.replace(/^(sh|sz)/, '') : stockCode;
      const tradeDate = kline.date || '';

      database.run(
        `INSERT OR REPLACE INTO kline_data 
         (stock_code, trade_date, adjust_type, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    saveDatabase();
    log.info(`K线数据保存成功: ${stockCode}, 复权类型: ${adjustType}, 共 ${klines.length} 条`);
    return klines.length;
  } catch (error) {
    // 事务回滚
    database.run('ROLLBACK');
    log.error(`K线数据保存失败: ${stockCode}, 复权类型: ${adjustType}`, error);
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
 * @param startDate 开始日期 (YYYY-MM-DD)，可选
 * @param endDate 结束日期 (YYYY-MM-DD)，可选
 * @returns K线数据数组，按交易日期升序排列
 */
export function getKlineData(stockCode: string, startDate?: string, endDate?: string): import('../shared/types').KlineData[] {
  const database = getDb();

  let query = `SELECT id, stock_code, trade_date, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at
               FROM kline_data WHERE stock_code = ?`;
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
 * 获取K线图展示数据（从数据库查询，支持前复权/不复权切换）
 * @param stockCode 股票代码
 * @param adjustType 复权类型：'' 不复权 | 'qfq' 前复权
 * @returns K线数据数组，按交易日期升序排列
 */
export function getChartData(stockCode: string, adjustType: '' | 'qfq'): import('../shared/types').KlineData[] {
  const database = getDb();

  const query = `SELECT id, stock_code, trade_date, adjust_type, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at
                 FROM kline_data WHERE stock_code = ? AND adjust_type = ? ORDER BY trade_date ASC`;

  const result = database.exec(query, [stockCode, adjustType]);

  if (result.length === 0) {
    return [];
  }

  return result[0].values.map(rowToKlineData);
}
