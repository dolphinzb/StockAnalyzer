import { app } from 'electron';
import log from 'electron-log';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import initSqlJs, { Database } from 'sql.js';
import type { AppConfig } from '../shared/types';

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
  currentPrice: number | null;
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
  currentPrice?: number;
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
      db = new SQL.Database();
      log.info('创建新的数据库实例');
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER
      )
    `);

    db.run(`
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
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS watchlist_stocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_code TEXT UNIQUE NOT NULL,
        stock_name TEXT NOT NULL,
        buy_threshold REAL NOT NULL,
        sell_threshold REAL NOT NULL,
        monitor_enabled INTEGER NOT NULL DEFAULT 1,
        current_price REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_monitor_enabled
      ON watchlist_stocks(monitor_enabled)
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_watchlist_stocks_stock_code
      ON watchlist_stocks(stock_code)
    `);

    log.info('自选股数据库表初始化完成');

    const result = db.exec("SELECT * FROM config WHERE key = 'app_config'");
    if (result.length === 0 || result[0].values.length === 0) {
      const defaultConfigJson = JSON.stringify(DEFAULT_CONFIG);
      db.run(
        "INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)",
        ['app_config', defaultConfigJson, Date.now()]
      );
      saveDatabase();
      log.info('默认配置已插入数据库');
    }

    log.info('数据库表初始化完成');
  } catch (error) {
    log.error('数据库初始化失败:', error);
    db = new SQL.Database();
  }
}

function saveDatabase(): void {
  if (!db) return;
  const dbPath = getDatabasePath();
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
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

function getDb(): Database {
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
    currentPrice: row[6] as number | null,
    createdAt: row[7] as string,
    updatedAt: row[8] as string,
  };
}

export function getWatchlist(): WatchlistStock[] {
  const database = getDb();
  const result = database.exec(
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, current_price, created_at, updated_at FROM watchlist_stocks ORDER BY monitor_enabled DESC, updated_at DESC'
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToWatchlistStock);
}

export function getWatchlistById(id: number): WatchlistStock | null {
  const database = getDb();
  const result = database.exec(
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, current_price, created_at, updated_at FROM watchlist_stocks WHERE id = ?',
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
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, current_price, created_at, updated_at FROM watchlist_stocks WHERE monitor_enabled = 1'
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(rowToWatchlistStock);
}

export function getStockByCode(stockCode: string): WatchlistStock | null {
  const database = getDb();
  const result = database.exec(
    'SELECT id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, current_price, created_at, updated_at FROM watchlist_stocks WHERE stock_code = ?',
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
    'INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, current_price, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, ?, ?)',
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
  if (input.currentPrice !== undefined) {
    updates.push('current_price = ?');
    values.push(input.currentPrice);
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

export function updateStockPrice(stockCode: string, price: number): void {
  const database = getDb();
  const now = new Date().toISOString();
  database.run(
    'UPDATE watchlist_stocks SET current_price = ?, updated_at = ? WHERE stock_code = ?',
    [price, now, stockCode]
  );
  saveDatabase();
}
