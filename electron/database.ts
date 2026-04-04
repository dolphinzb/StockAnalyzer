import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import log from 'electron-log';
import type { AppConfig } from '../shared/types';
import initSqlJs, { Database } from 'sql.js';

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
