import { app } from 'electron';
import log from 'electron-log';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { SqliteDatabase, type DatabaseLike, type SqlValue } from './sqliteEngine';
import type { AddTradeResult, AppConfig, KlinePeriod, QuoteProviderId } from '../shared/types';
import { getQuoteEndpoint } from '../shared/types';
import { getUserVersion, getPendingMigrations, runMigrations } from './migrations';
import { recalculateBalancesFrom } from './services/fundService';
import {
  calcHoldingPrice,
  calcStockBuyAmount,
  calcStockSellAmount,
  type CalcResult,
} from './services/tradeService';

/**
 * 数据库句柄类型（引擎最小接口，测试可注入内存库）
 */
export type Database = DatabaseLike;

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

const PROVIDER_IDS: QuoteProviderId[] = ['sina', 'eastmoney', 'tencent'];

/**
 * 按 provider 派生唯一的合法 API 配置。
 * `url` 不接受外部输入，始终等于该 provider 的只读端点；非法 provider 回退新浪。
 */
export function normalizeApiConfig(provider: unknown): AppConfig['api'] {
  const normalized = PROVIDER_IDS.includes(provider as QuoteProviderId)
    ? (provider as QuoteProviderId)
    : 'sina';
  return { provider: normalized, url: getQuoteEndpoint(normalized) };
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
  api: normalizeApiConfig('sina'),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 把库内读出的配置与默认值逐字段合并。
 * 坏值（缺字段、类型错误、非法枚举）一律回落到默认值，避免后续流程拿到畸形对象。
 */
export function mergeWithDefaultConfig(raw: unknown): AppConfig {
  const source = isRecord(raw) ? raw : {};
  const trading = isRecord(source.trading) ? source.trading : {};
  const polling = isRecord(source.polling) ? source.polling : {};
  const api = isRecord(source.api) ? source.api : {};

  const timeOr = (value: unknown, fallback: string): string =>
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;

  return {
    trading: {
      morningStart: timeOr(trading.morningStart, DEFAULT_CONFIG.trading.morningStart),
      morningEnd: timeOr(trading.morningEnd, DEFAULT_CONFIG.trading.morningEnd),
      afternoonStart: timeOr(trading.afternoonStart, DEFAULT_CONFIG.trading.afternoonStart),
      afternoonEnd: timeOr(trading.afternoonEnd, DEFAULT_CONFIG.trading.afternoonEnd),
    },
    polling: {
      interval: typeof polling.interval === 'number' && Number.isFinite(polling.interval) && polling.interval > 0
        ? polling.interval
        : DEFAULT_CONFIG.polling.interval,
    },
    // url 一律由 provider 派生，库中的历史地址（如东财单只端点）在读取时被纠正
    api: normalizeApiConfig(api.provider),
  };
}

let db: Database | null = null;
/** 事务进行中标记：事务内禁止落盘，避免把未提交的中间态写进磁盘 */
let inTransaction = false;

export function getDatabasePath(): string {
  return join(app.getPath('home'), '.stockanalyzer', 'stockanalyzer.db');
}

/** 迁移备份保留份数 */
const MIGRATION_BACKUP_LIMIT = 5;

/**
 * 生成迁移备份文件名中的时间戳（本地时间 YYYYMMDD-HHmmss）
 * 手工拼串，避免 toISOString 的 UTC 时区偏移
 * @param date 时间点，默认当前时间
 * @returns 时间戳字符串
 */
function formatBackupTimestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * 清理过期的迁移备份，仅保留最近 MIGRATION_BACKUP_LIMIT 份
 * @param dbPath 数据库文件路径
 */
function cleanupMigrationBackups(dbPath: string): void {
  const dir = join(dbPath, '..');
  const prefix = `${basename(dbPath)}.bak-`;

  let entries: Array<{ file: string; mtime: number }>;
  try {
    entries = readdirSync(dir)
      .filter(name => name.startsWith(prefix))
      .map(name => ({ file: name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime);
  } catch (error) {
    log.warn('清理迁移备份失败:', error);
    return;
  }

  for (const entry of entries.slice(MIGRATION_BACKUP_LIMIT)) {
    try {
      unlinkSync(join(dir, entry.file));
      log.info(`已清理过期迁移备份: ${entry.file}`);
    } catch (error) {
      log.warn(`删除迁移备份失败 ${entry.file}:`, error);
    }
  }
}

/**
 * 迁移前备份数据库文件
 * 命名刻意避开 backupService 的清理规则（stockanalyzer_YYYYMMDD.db），
 * 避免迁移备份被「保留最近 3 天」的每日备份清理逻辑删除
 * @param dbPath 数据库文件路径
 * @returns 备份文件路径
 */
function backupBeforeMigration(dbPath: string): string {
  const backupPath = `${dbPath}.bak-${formatBackupTimestamp()}`;
  // 引擎快照：包含当时所有已提交事务（WAL 下也完整）
  writeFileSync(backupPath, Buffer.from(getDb().export()));
  cleanupMigrationBackups(dbPath);
  log.info(`迁移前已备份数据库: ${backupPath}`);
  return backupPath;
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDatabasePath();
  log.info(`初始化数据库: ${dbPath}`);

  const configDir = join(dbPath, '..');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const fileExisted = existsSync(dbPath);

  try {
    // 引擎直接打开文件：事务提交即持久化，不需要序列化整库后再替换文件
    db = new SqliteDatabase(dbPath);
    if (fileExisted) {
      log.info('数据库文件加载成功');
    } else {
      log.warn('数据库文件不存在，按 V1 结构新建:', dbPath);
    }

    const pending = getPendingMigrations(db, { isNewDatabase: !fileExisted });
    // 有待执行迁移，或需要给存量库补写版本记录时，先留一份迁移前快照
    const needsBackup = fileExisted && (pending.length > 0 || getUserVersion(db) === 0);
    if (needsBackup) {
      backupBeforeMigration(dbPath);
    }

    const result = runMigrations(db, { isNewDatabase: !fileExisted });

    log.info(`数据库初始化完成: 版本 v${result.toVersion}`);
  } catch (error) {
    log.error('数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 写操作选项
 * @remarks 引擎在事务提交时即持久化，无需「跳过落盘」之类的批次控制
 */
export interface WriteOptions {
  /** 目标数据库实例（测试可注入内存库） */
  target?: Database;
}

/**
 * 在单个事务内执行一批写操作；任一步失败回滚全部写入。
 * 引擎在事务提交时即完成持久化，调用方无需再做额外落盘。
 */
export async function runInTransaction<T>(
  fn: () => T | Promise<T>,
  target?: Database
): Promise<T> {
  const database = target ?? getDb();
  if (inTransaction) {
    throw new Error('NESTED_TRANSACTION: 不支持嵌套事务');
  }
  database.run('BEGIN TRANSACTION');
  inTransaction = true;
  try {
    const result = await fn();
    database.run('COMMIT');
    return result;
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (rollbackError) {
      log.error('runInTransaction: 回滚失败', rollbackError);
    }
    throw error;
  } finally {
    inTransaction = false;
  }
}

export function loadConfig(): AppConfig {
  if (!db) {
    log.warn('数据库未初始化，使用默认配置');
    return { ...DEFAULT_CONFIG };
  }

  try {
    const configJson = queryValue<string>("SELECT value FROM config WHERE key = 'app_config'");
    if (configJson) {
      const config = JSON.parse(configJson) as unknown;
      log.info('从数据库加载配置成功');
      return mergeWithDefaultConfig(config);
    }
  } catch (error) {
    log.error('从数据库加载配置失败:', error);
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * 保存配置：落盘前按 provider 归一化 api.url，渲染层提交的地址一律不生效
 * @param config 渲染层提交的配置
 * @param target 目标数据库实例（测试可注入内存库）
 * @returns 是否保存成功
 */
export function saveConfig(config: AppConfig, target?: Database): boolean {
  const database = target ?? db;
  if (!database) {
    log.error('数据库未初始化，无法保存配置');
    return false;
  }

  try {
    // 落盘前再次归一化：渲染层提交的 api.url 一律不生效
    const normalized: AppConfig = { ...config, api: normalizeApiConfig(config.api?.provider) };
    const configJson = JSON.stringify(normalized);
    execute("UPDATE config SET value = ?, updated_at = ? WHERE key = 'app_config'", [
      configJson,
      Date.now(),
    ], database);
    log.info('配置保存到数据库成功');
    return true;
  } catch (error) {
    log.error('保存配置到数据库失败:', error);
    return false;
  }
}

export function closeDatabase(): void {
  if (!db) {
    return;
  }
  try {
    // 关闭连接：WAL 会在此合并回主库，无需额外落盘
    db.close();
  } catch (error) {
    log.error('关闭数据库失败:', error);
  } finally {
    db = null;
  }
}

export function getDb(): Database {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return db;
}

/** SQL 值类型（引擎无关，与 sqliteEngine 保持一致） */
export type { SqlValue }; 

/**
 * 执行查询并返回行数组（保持 SELECT 的列顺序）
 * 业务层统一通过本函数访问数据库，禁止直接持有驱动的 exec/run
 * @param sql 参数化 SQL（占位符统一用 ?）
 * @param params 绑定参数
 * @param target 目标数据库实例（测试可注入内存库）
 * @returns 行数组，无结果时为空数组
 */
export function queryRows(sql: string, params: unknown[] = [], target?: Database): SqlValue[][] {
  const database = target ?? getDb();
  const result = params.length > 0 ? database.exec(sql, params as never) : database.exec(sql);
  if (result.length === 0) {
    return [];
  }
  return result[0].values as SqlValue[][];
}

/**
 * 执行查询并返回首行首列
 * @param sql 参数化 SQL
 * @param params 绑定参数
 * @param target 目标数据库实例
 * @returns 首行首列的值，无结果时为 null
 */
export function queryValue<T = SqlValue>(sql: string, params: unknown[] = [], target?: Database): T | null {
  const rows = queryRows(sql, params, target);
  if (rows.length === 0 || rows[0].length === 0) {
    return null;
  }
  return rows[0][0] as T;
}

/**
 * 执行写语句（INSERT/UPDATE/DELETE/DDL），返回受影响行数
 * @param sql 参数化 SQL
 * @param params 绑定参数
 * @param target 目标数据库实例
 * @returns 受影响行数
 */
export function execute(sql: string, params: unknown[] = [], target?: Database): number {
  const database = target ?? getDb();
  if (params.length > 0) {
    database.run(sql, params as never);
  } else {
    database.run(sql);
  }
  return database.getRowsModified();
}

/**
 * 在单个事务内执行，抛错时回滚并向上抛出
 * 事务内禁止落盘（由 inTransaction 标记拦截）
 * @param fn 事务体
 * @param target 目标数据库实例
 * @returns 事务体的返回值
 */
export function transaction<T>(fn: () => T, target?: Database): T {
  const database = target ?? getDb();
  if (inTransaction) {
    throw new Error('NESTED_TRANSACTION: 不支持嵌套事务');
  }
  inTransaction = true;
  database.run('BEGIN');
  try {
    const result = fn();
    database.run('COMMIT');
    return result;
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (rollbackError) {
      log.error('transaction: 回滚失败', rollbackError);
    }
    throw error;
  } finally {
    inTransaction = false;
  }
}

/**
 * 生成数据库的一致性备份到指定路径
 * 备份内容为当前已提交的全部数据
 * @param destPath 备份文件路径
 */
export async function backupTo(destPath: string): Promise<void> {
  const database = getDb();
  writeFileSync(destPath, Buffer.from(database.export()));
}

/** 自选股查询列清单（sort_order 固定追加在末尾，避免既有下标错位） */
const WATCHLIST_SELECT_COLUMNS =
  'id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order';

function rowToWatchlistStock(row: SqlValue[]): WatchlistStock {
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
  return queryRows(
    `SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks ORDER BY sort_order ASC, id ASC`
  ).map(rowToWatchlistStock);
}

export function getWatchlistById(id: number): WatchlistStock | null {
  const rows = queryRows(`SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks WHERE id = ?`, [id]);
  return rows.length > 0 ? rowToWatchlistStock(rows[0]) : null;
}

export function getEnabledStocks(): WatchlistStock[] {
  return queryRows(
    `SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks WHERE monitor_enabled = 1 ORDER BY sort_order ASC, id ASC`
  ).map(rowToWatchlistStock);
}

export function getStockByCode(stockCode: string): WatchlistStock | null {
  const rows = queryRows(`SELECT ${WATCHLIST_SELECT_COLUMNS} FROM watchlist_stocks WHERE stock_code = ?`, [
    stockCode,
  ]);
  return rows.length > 0 ? rowToWatchlistStock(rows[0]) : null;
}

export function addStock(input: AddStockInput): WatchlistStock {
  const now = new Date().toISOString();
  execute(
    `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
     VALUES (?, ?, ?, ?, 0, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM watchlist_stocks))`,
    [input.stockCode, input.stockName, input.buyThreshold, input.sellThreshold, now, now]
  );
  const inserted = getStockByCode(input.stockCode);
  if (!inserted) {
    throw new Error('添加股票失败');
  }
  return inserted;
}

export function updateStock(id: number, input: UpdateStockInput): WatchlistStock | null {
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
  execute(`UPDATE watchlist_stocks SET ${updates.join(', ')} WHERE id = ?`, values);
  return getWatchlistById(id);
}

export function deleteStock(id: number): boolean {
  const existing = getWatchlistById(id);
  if (!existing) {
    return false;
  }
  execute('DELETE FROM watchlist_stocks WHERE id = ?', [id]);
  return true;
}

/**
 * 按给定 id 顺序重写自选股排序值
 * 说明：整表重写为连续的 0..N-1，同时压缩删除产生的空缺；重排不改写 updated_at
 * 引擎在事务提交时即持久化，失败会整体回滚，不存在「内存已提交但磁盘未写」的中间态
 * @param orderedIds 完整的有序自选股 id 列表
 * @returns 重排后的完整自选股列表
 */
export function reorderWatchlist(orderedIds: number[]): WatchlistStock[] {
  transaction(() => {
    orderedIds.forEach((id, index) => {
      execute('UPDATE watchlist_stocks SET sort_order = ? WHERE id = ?', [index, id]);
    });
  });

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
  // 获取每个股票的最新交易记录（按id最大），然后过滤出持仓数量大于0的股票
  const rows = queryRows(`
    SELECT t1.stock_code, t1.stock_name, t1.holding_count, t1.holding_price, t1.trade_date
    FROM trade_record t1
    INNER JOIN (
      SELECT stock_code, MAX(id) as max_id
      FROM trade_record
      GROUP BY stock_code
    ) t2 ON t1.id = t2.max_id
    WHERE t1.holding_count > 0
  `);
  return rows.map(row => ({
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

export function getLastZeroTrade(stockCode: string, target?: Database): TradeRecord | null {
  const rows = queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     WHERE stock_code = ? AND holding_count = 0
     ORDER BY trade_date DESC LIMIT 1`,
    [stockCode],
    target
  );
  return rows.length > 0 ? rowToTradeRecord(rows[0]) : null;
}

function getFirstOpenAfterZero(stockCode: string, zeroDate: string, target?: Database): TradeRecord | null {
  const rows = queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     WHERE stock_code = ? AND trade_date > ? AND trade_type = 'BUY' AND holding_count > 0
     ORDER BY trade_date ASC LIMIT 1`,
    [stockCode, zeroDate],
    target
  );
  return rows.length > 0 ? rowToTradeRecord(rows[0]) : null;
}

export interface UpdateTradeInput {
  id: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}

/**
 * 按交易日期 + id 顺序，以零持仓为起点重放该股票的持仓快照链。
 * 编辑/删除任意历史交易后调用，快照字段只由服务端计算。
 */
export function rebuildHoldingChain(stockCode: string, target?: Database): void {
  const rows = queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record WHERE stock_code = ?
     ORDER BY trade_date ASC, id ASC`,
    [stockCode],
    target
  );
  if (rows.length === 0) {
    return;
  }

  let previous: TradeRecord | null = null;
  for (const row of rows) {
    const record = rowToTradeRecord(row);
    const calc: CalcResult = calcHoldingPrice(
      previous,
      record.tradeType,
      record.tradePrice,
      record.tradeCount,
      record.stockCode
    );
    execute(
      `UPDATE trade_record SET holding_count = ?, holding_price = ? WHERE id = ?`,
      [calc.holdingCount, calc.holdingPrice, record.id],
      target
    );
    previous = { ...record, holdingCount: calc.holdingCount, holdingPrice: calc.holdingPrice };
  }
}

/** 编辑价格/数量/类型后，同步关联 STOCK_BUY / STOCK_SELL 明细的金额与日期；不新建明细 */
function syncLinkedTransferAmounts(database: Database, tradeId: number, trade: UpdateTradeInput): void {
  const linked = queryRows(`SELECT id, type FROM transfer_records WHERE trade_record_id = ?`, [tradeId], database);
  for (const row of linked) {
    const transferId = row[0] as number;
    const type = row[1] as string;
    let amount: number | null = null;
    if (trade.tradeType === 'BUY' && type === 'STOCK_BUY') {
      amount = calcStockBuyAmount(trade.tradePrice, trade.tradeCount, trade.stockCode);
    } else if (trade.tradeType === 'SELL' && type === 'STOCK_SELL') {
      amount = calcStockSellAmount(trade.tradePrice, trade.tradeCount, trade.stockCode);
    }
    if (amount === null || amount <= 0) {
      continue;
    }
    execute(
      `UPDATE transfer_records SET amount = ?, transfer_date = ?, updated_at = ? WHERE id = ?`,
      [amount, trade.tradeDate, new Date().toISOString(), transferId],
      database
    );
  }
}

/** 关联资金明细中最早的日期，作为余额链重算起点 */
function earliestLinkedDate(database: Database, tradeId: number): string | null {
  const value = queryValue<string>(
    `SELECT MIN(transfer_date) AS earliest FROM transfer_records WHERE trade_record_id = ?`,
    [tradeId],
    database
  );
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function updateTradeRecord(input: UpdateTradeInput, options: WriteOptions = {}): TradeRecord {
  const database = options.target ?? getDb();
  log.debug('updateTradeRecord input:', JSON.stringify(input));
  const original = queryRows(`SELECT stock_code FROM trade_record WHERE id = ?`, [input.id], database);
  if (original.length === 0) {
    throw new Error('交易记录不存在');
  }
  const previousStockCode = original[0][0] as string;
  const earliestDate = earliestLinkedDate(database, input.id);

  execute(
    `UPDATE trade_record
     SET stock_code = ?, stock_name = ?, trade_date = ?, trade_type = ?, trade_price = ?, trade_count = ?
     WHERE id = ?`,
    [input.stockCode, input.stockName, input.tradeDate, input.tradeType, input.tradePrice, input.tradeCount, input.id],
    database
  );

  rebuildHoldingChain(input.stockCode, database);
  if (previousStockCode !== input.stockCode) {
    rebuildHoldingChain(previousStockCode, database);
  }

  syncLinkedTransferAmounts(database, input.id, input);
  if (earliestDate) {
    // 交易日期可能被改到更早，重算起点必须覆盖新旧两个位置
    const recalcFrom = earliestDate < input.tradeDate ? earliestDate : input.tradeDate;
    recalculateBalancesFrom(database, recalcFrom);
  }

  const result = queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record WHERE id = ?`,
    [input.id],
    database
  );
  if (result.length === 0) {
    throw new Error('更新交易记录失败');
  }
  return rowToTradeRecord(result[0]);
}

export function deleteTradeRecord(id: number, options: WriteOptions = {}): void {
  const database = options.target ?? getDb();
  const original = queryRows(`SELECT stock_code FROM trade_record WHERE id = ?`, [id], database);
  if (original.length === 0) {
    throw new Error('交易记录不存在');
  }
  const stockCode = original[0][0] as string;
  const earliestDate = earliestLinkedDate(database, id);

  // 先删除关联的资金明细，再删除交易记录
  execute(`DELETE FROM transfer_records WHERE trade_record_id = ?`, [id], database);
  execute(`DELETE FROM trade_record WHERE id = ?`, [id], database);

  rebuildHoldingChain(stockCode, database);
  if (earliestDate) {
    recalculateBalancesFrom(database, earliestDate);
  }
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
export function getTradeRecords(
  stockCode: string,
  page: number = 1,
  pageSize: number = 20,
  target?: Database
): PaginatedTradeRecords {
  const database = target ?? getDb();
  // 数据层二次防护：非法值回落到默认分页，超大值限制到 100，且分页值只用占位符传入
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeSize = Number.isInteger(pageSize) && pageSize >= 1 ? Math.min(pageSize, 100) : 20;
  const lastZero = getLastZeroTrade(stockCode, database);

  // 构建查询条件：如果有上次清仓记录，只查询该清仓之后的交易记录（不包括清仓记录）
  let countQuery: string;
  let countParams: any[];
  let dataQuery: string;
  let dataParams: any[];

  if (lastZero) {
    // 找到清仓后的第一笔买入记录
    const firstOpenAfterZero = getFirstOpenAfterZero(stockCode, lastZero.tradeDate, database);

    if (firstOpenAfterZero) {
      // 如果有新的开仓记录，从该记录开始查询
      countQuery = `SELECT COUNT(*) as total FROM trade_record WHERE stock_code = ? AND trade_date >= ?`;
      countParams = [stockCode, firstOpenAfterZero.tradeDate];
      dataQuery = `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
                   FROM trade_record
                   WHERE stock_code = ? AND trade_date >= ?
                   ORDER BY trade_date DESC, id DESC
                   LIMIT ? OFFSET ?`;
      dataParams = [stockCode, firstOpenAfterZero.tradeDate, safeSize, (safePage - 1) * safeSize];
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
                 LIMIT ? OFFSET ?`;
    dataParams = [stockCode, safeSize, (safePage - 1) * safeSize];
  }

  // 查询总数
  const total = queryValue<number>(countQuery, countParams, database) ?? 0;

  // 查询分页数据
  const records = queryRows(dataQuery, dataParams, database).map(rowToTradeRecord);

  // 计算是否还有更多记录
  const hasMore = safePage * safeSize < total;
  log.debug(`getTradeRecords: stockCode=${stockCode}, page=${safePage}, pageSize=${safeSize}, total=${total}, hasMore=${hasMore}`);
  return { records, total, hasMore };
}

export function addTradeRecord(input: AddTradeInput, options: WriteOptions = {}): AddTradeResult {
  const database = options.target ?? getDb();
  // 获取最新交易记录用于计算持仓，只需第一页第一条
  const paginatedResult = getTradeRecords(input.stockCode, 1, 1, database);
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
  execute(
    `INSERT INTO trade_record (stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.stockCode, input.stockName, input.tradeDate, input.tradeType, input.tradePrice, input.tradeCount, calcResult.holdingCount, calcResult.holdingPrice],
    database
  );
  const result = queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record WHERE stock_code = ? ORDER BY trade_date DESC, id DESC LIMIT 1`,
    [input.stockCode],
    database
  );
  if (result.length === 0) {
    throw new Error('添加交易记录失败');
  }
  const record = rowToTradeRecord(result[0]);
  return { record };
}

/**
 * 获取所有交易记录
 * @returns 所有交易记录数组，按股票代码和交易日期排序
 */
export function getAllTradeRecords(): TradeRecord[] {
  return queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     ORDER BY stock_code, trade_date ASC`
  ).map(rowToTradeRecord);
}

/**
 * 按股票代码查询交易记录
 * @param stockCode 股票代码
 * @returns 该股票的所有交易记录数组，按交易日期正序排列
 */
export function getTradeRecordsByStockCode(stockCode: string): TradeRecord[] {
  return queryRows(
    `SELECT id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price
     FROM trade_record
     WHERE stock_code = ?
     ORDER BY trade_date ASC`,
    [stockCode]
  ).map(rowToTradeRecord);
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
 * 单只股票在某周期表中的最新交易日（按复权类型区分）
 */
export interface LatestTradeDateEntry {
  /** 不复权最新交易日（YYYYMMDD），无数据时为 null */
  unadjusted: string | null;
  /** 前复权最新交易日（YYYYMMDD），无数据时为 null */
  adjusted: string | null;
}

/**
 * 批量查询多只股票在某周期表中的最新交易日
 * 用途：自动增量下载据此计算每只股票的下载起点
 * @param stockCodes 股票代码列表（纯数字）
 * @param period K线周期 d|w|m
 * @param target 目标数据库实例（默认取全局库，测试可注入内存库）
 * @returns 股票代码 → 两种复权各自的最新交易日（无数据的股票为 null）
 * @remarks 表名必须经 tableOf() 白名单取得，代码逐个绑定占位符，不接受外部拼接。
 *          查询异常直接向上抛出，由调用方按股票/周期降级处理。
 */
export function getLatestTradeDates(
  stockCodes: string[],
  period: KlinePeriod,
  target?: Database
): Map<string, LatestTradeDateEntry> {
  const latest = new Map<string, LatestTradeDateEntry>();
  if (!Array.isArray(stockCodes) || stockCodes.length === 0) {
    return latest;
  }

  const table = tableOf(period);
  const database = target ?? getDb();

  // 先为所有请求的代码建立空条目，保证「无数据」与「未请求」在调用方可区分
  for (const stockCode of stockCodes) {
    latest.set(stockCode, { unadjusted: null, adjusted: null });
  }

  const placeholders = stockCodes.map(() => '?').join(', ');
  const rows = queryRows(
    `SELECT stock_code, adjust_type, MAX(trade_date) AS latest
     FROM ${table}
     WHERE stock_code IN (${placeholders})
     GROUP BY stock_code, adjust_type`,
    stockCodes,
    database
  );

  for (const row of rows) {
    const stockCode = String(row[0] ?? '');
    const adjustType = String(row[1] ?? '');
    const tradeDate = row[2] === null || row[2] === undefined ? '' : String(row[2]);
    const entry = latest.get(stockCode);
    // 库内 trade_date 为 YYYY-MM-DD，对外统一转 YYYYMMDD
    if (!entry || tradeDate === '') continue;
    const ymd = tradeDate.replace(/-/g, '');
    if (adjustType === 'qfq') {
      entry.adjusted = ymd;
    } else if (adjustType === '') {
      entry.unadjusted = ymd;
    }
  }

  return latest;
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
 * @remarks 写入在单个事务内完成，提交即持久化（引擎页级写入，不需要整库序列化）
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
    transaction(() => {
      // 周线/月线：数据源对未完成周期返回的 trade_date 是「最新交易日」（11-04 → 11-05 → …），
      // 不清理会按不同日期堆出同一周期的多行。仅当本批数据包含当前周期的记录时才清理，
      // 避免下载纯历史区间时误删库中已有的当前周期数据。
      if (period !== 'd') {
        const periodStart = getCurrentPeriodStart(period);
        const hasCurrentPeriodBar = klines.some(kline => (kline.date || '') >= periodStart);
        if (hasCurrentPeriodBar) {
          execute(
            `DELETE FROM ${table} WHERE stock_code = ? AND adjust_type = ? AND trade_date >= ?`,
            [stockCode, adjustType, periodStart],
            database
          );
        }
      }

      for (const kline of klines) {
        // 去除股票代码前缀（如 sz000001 → 000001）
        const pureCode = kline.code ? kline.code.replace(/^(sh|sz)/, '') : stockCode;
        const tradeDate = kline.date || '';

        // UPSERT：唯一键冲突时走 DO UPDATE，保留原 id 与 created_at（首次入库时间），
        // 仅刷新行情字段与 updated_at；or REPLACE 会先删后插，导致 id 变化、created_at 丢失
        execute(
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
          ],
          database
        );
      }
    }, database);

    log.debug(`K线数据保存成功: ${stockCode}, 周期: ${period}, 复权类型: ${adjustType}, 共 ${klines.length} 条`);
    return klines.length;
  } catch (error) {
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

  return queryRows(query, params, database).map(rowToKlineData);
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

  return queryRows(query, [stockCode, adjustType], database).map(rowToKlineData);
}
