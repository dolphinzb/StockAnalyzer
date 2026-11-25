/**
 * 全市场行情库 `market_data.db` 连接与基础访问层
 *
 * 职责边界：
 * - 只负责「独立连接 + PRAGMA + 版本化迁移 + 原语 + 元数据 + 轻量快照」
 * - 不得与业务库 `stockanalyzer.db` 混用连接，不使用 ATTACH 后省略库名
 * - 业务语义（证券、日线、因子、任务）由 `services/marketRepository.ts` 承载
 */

import { app } from 'electron';
import log from 'electron-log';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { SqliteDatabase, type DatabaseLike, type SqlValue } from './sqliteEngine';
import { getMarketMigrationsDir, runMigrations } from './migrations';

/** 行情库句柄类型（引擎最小接口，测试可注入内存库） */
export type MarketDatabase = DatabaseLike;

/** 行情库额外 PRAGMA：WAL + 适中的 fsync + 长锁等待 + 64MB WAL 上限 */
const MARKET_PRAGMAS: Array<[string, string | number]> = [
  ['journal_mode', 'WAL'],
  ['synchronous', 'NORMAL'],
  ['busy_timeout', 10000],
  ['journal_size_limit', 64 * 1024 * 1024],
  ['temp_store', 'MEMORY'],
];

let marketDb: MarketDatabase | null = null;

/**
 * 行情库文件路径：`~/.stockanalyzer/market_data.db`
 */
export function getMarketDatabasePath(): string {
  return join(app.getPath('home'), '.stockanalyzer', 'market_data.db');
}

/**
 * 打开行情库并应用 PRAGMA（不改结构）
 * @param filename 数据库文件路径或 `:memory:`
 * @param isNewFile 是否为新文件（用于迁移基线判定）
 * @returns 数据库句柄
 */
export function openMarketDatabase(filename: string, isNewFile: boolean): MarketDatabase {
  const database = new SqliteDatabase(filename);
  for (const [name, value] of MARKET_PRAGMAS) {
    try {
      database.run(`PRAGMA ${name} = ${String(value)}`);
    } catch (error) {
      log.debug(`行情库 PRAGMA ${name} 设置未生效: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  runMigrations(database, { isNewDatabase: isNewFile, dir: getMarketMigrationsDir() });
  return database;
}

/**
 * 初始化行情库（应用启动时调用）
 * - 不生成迁移前整库备份：迁移失败由事务回滚保证结构一致性
 * - 初始化完成后做一次 WAL checkpoint，避免 WAL 长期增长
 */
export async function initMarketDatabase(): Promise<void> {
  if (marketDb) {
    return;
  }

  const dbPath = getMarketDatabasePath();
  log.info(`初始化行情库: ${dbPath}`);

  const dir = join(dbPath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const fileExisted = existsSync(dbPath);
  marketDb = openMarketDatabase(dbPath, !fileExisted);
  checkpointMarketDatabase();
  log.info('行情库初始化完成');
}

/**
 * 获取行情库句柄
 * @throws 未初始化时抛错，避免降级为业务库或空库
 */
export function getMarketDb(): MarketDatabase {
  if (!marketDb) {
    throw new Error('行情库未初始化');
  }
  return marketDb;
}

/** 关闭行情库连接（WAL 在关闭时合并） */
export function closeMarketDatabase(): void {
  if (!marketDb) {
    return;
  }
  try {
    checkpointMarketDatabase();
    marketDb.close();
  } catch (error) {
    log.error('关闭行情库失败:', error);
  } finally {
    marketDb = null;
  }
}

/**
 * 执行 WAL checkpoint（TRUNCATE），把 WAL 内容合回主库并截断
 * @param target 目标数据库，缺省取全局行情库
 */
export function checkpointMarketDatabase(target?: MarketDatabase): void {
  const database = target ?? marketDb;
  if (!database) {
    return;
  }
  try {
    database.run('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (error) {
    log.debug(`行情库 WAL checkpoint 未生效: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 查询并返回行数组
 */
export function queryMarketRows(
  sql: string,
  params: unknown[] = [],
  target?: MarketDatabase
): SqlValue[][] {
  const database = target ?? getMarketDb();
  const result = params.length > 0 ? database.exec(sql, params as never) : database.exec(sql);
  if (result.length === 0) {
    return [];
  }
  return result[0].values as SqlValue[][];
}

/**
 * 查询首行首列
 */
export function queryMarketValue<T = SqlValue>(
  sql: string,
  params: unknown[] = [],
  target?: MarketDatabase
): T | null {
  const rows = queryMarketRows(sql, params, target);
  if (rows.length === 0 || rows[0].length === 0) {
    return null;
  }
  return rows[0][0] as T;
}

/**
 * 执行写语句并返回受影响行数
 */
export function executeMarket(
  sql: string,
  params: unknown[] = [],
  target?: MarketDatabase
): number {
  const database = target ?? getMarketDb();
  if (params.length > 0) {
    database.run(sql, params as never);
  } else {
    database.run(sql);
  }
  return database.getRowsModified();
}

/**
 * 在单个事务内执行；抛错回滚并向上抛出
 * 行情库写入一律走本函数，保证「单任务事务」语义
 */
export function transactionMarket<T>(fn: () => T, target?: MarketDatabase): T {
  const database = target ?? getMarketDb();
  database.run('BEGIN');
  try {
    const result = fn();
    database.run('COMMIT');
    return result;
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (rollbackError) {
      log.error('transactionMarket: 回滚失败', rollbackError);
    }
    throw error;
  }
}

/** 读取单个 meta 值 */
export function getMarketMeta(key: string, target?: MarketDatabase): string | null {
  return queryMarketValue<string>('SELECT value FROM meta WHERE key = ?', [key], target);
}

/**
 * 写入/覆盖 meta 键值
 * @param entries 键值对（值为 null 时删除该键）
 */
export function setMarketMeta(
  entries: Record<string, string | number | null>,
  target?: MarketDatabase
): void {
  const now = Math.floor(Date.now() / 1000);
  for (const [key, value] of Object.entries(entries)) {
    if (value === null) {
      executeMarket('DELETE FROM meta WHERE key = ?', [key], target);
      continue;
    }
    executeMarket(
      `INSERT INTO meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, String(value), now],
      target
    );
  }
}

/** 轻量快照保留份数 */
const SNAPSHOT_LIMIT = 5;

/** 轻量快照目录（行情库同目录下的 market-snapshots/） */
export function getMarketSnapshotDir(dbPath = getMarketDatabasePath()): string {
  return join(dbPath, '..', 'market-snapshots');
}

/**
 * 导出轻量元数据快照（meta / securities / sync_state / adjust_factors）
 *
 * 行情事实可从数据源重建，因此不复制整库；快照只用于故障排查与状态回顾。
 * @param target 目标数据库，缺省取全局行情库
 * @param dbPath 行情库文件路径，用于推导快照目录
 * @param options.includeFactorRows 是否导出全量因子行（默认 true）。
 *        全市场因子可达千万行，同步结束后的自动快照应传 false，仅保留元数据以免占用大量内存与磁盘。
 * @returns 快照文件路径
 */
export function exportMarketSnapshot(
  target?: MarketDatabase,
  dbPath = getMarketDatabasePath(),
  options: { includeFactorRows?: boolean } = {}
): string {
  const database = target ?? getMarketDb();
  const dir = getMarketSnapshotDir(dbPath);
  mkdirSync(dir, { recursive: true });

  // 保留毫秒，避免同一秒内多次导出互相覆盖，便于验证「只保留最近 5 份」
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `market-meta-${timestamp}.json`);

  const includeFactorRows = options.includeFactorRows ?? true;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    meta: queryMarketRows('SELECT key, value, updated_at FROM meta ORDER BY key', [], database),
    securities: queryMarketRows(
      'SELECT code, exchange, name, type, list_date, delist_date, is_active, code_source, fetched_at, updated_at FROM securities ORDER BY code',
      [],
      database
    ),
    syncState: queryMarketRows(
      `SELECT task_key, stock_code, data_kind, last_success_date, status, retry_count,
              next_retry_at, last_attempt_at, last_error, updated_at
       FROM sync_state ORDER BY task_key`,
      [],
      database
    ),
    adjustFactors: includeFactorRows
      ? queryMarketRows(
          'SELECT stock_code, trade_date, qfq_factor, hfq_factor, source, fetched_at FROM adjust_factors ORDER BY stock_code, trade_date',
          [],
          database
        )
      : [],
    adjustFactorRows: includeFactorRows
      ? null
      : Number(queryMarketValue<number>('SELECT COUNT(*) FROM adjust_factors', [], database) ?? 0),
  };

  writeFileSync(file, JSON.stringify(snapshot), 'utf-8');
  setMarketMeta({ last_snapshot_at: Math.floor(Date.now() / 1000) }, database);
  pruneMarketSnapshots(dir);
  log.info(`行情库轻量快照已导出: ${file}`);
  return file;
}

/**
 * 清理过期轻量快照，仅保留最近 SNAPSHOT_LIMIT 份
 */
function pruneMarketSnapshots(dir: string): void {
  let entries: Array<{ file: string; mtime: number }>;
  try {
    entries = readdirSync(dir)
      .filter(name => name.startsWith('market-meta-') && name.endsWith('.json'))
      .map(name => ({ file: name, mtime: statSync(join(dir, name)).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime);
  } catch (error) {
    log.warn('清理行情库快照失败:', error);
    return;
  }

  for (const entry of entries.slice(SNAPSHOT_LIMIT)) {
    try {
      unlinkSync(join(dir, entry.file));
    } catch (error) {
      log.warn(`删除行情库快照失败 ${basename(entry.file)}:`, error);
    }
  }
}
