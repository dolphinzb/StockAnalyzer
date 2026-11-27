/**
 * 全市场行情库仓储层：证券、日历、原始日线、复权因子、派生周期、任务状态、质量记录
 *
 * 所有 SQL 只允许访问传入的行情库句柄，禁止混用业务库连接。
 * 表名一律来自白名单映射常量，禁止拼接外部输入。
 */

import type { SqlValue } from '../sqliteEngine';
import {
  executeMarket,
  queryMarketRows,
  queryMarketValue,
  setMarketMeta,
  transactionMarket,
  type MarketDatabase,
} from '../marketDatabase';
import {
  aggregateAdjustedBars,
  aggregateBars,
  periodStartOf,
  type MarketAdjustedPeriodBar,
  type MarketDailyBar,
  type MarketDerivedBar,
  type MarketPeriod,
} from './marketPeriod';
import type { MarketQualityIssue } from './marketQuality';
import {
  buildTaskKey,
  MARKET_LEVEL_KINDS,
  type MarketDataKind,
} from './marketSyncPolicy';

/** 交易所 */
export type MarketExchange = 'SH' | 'SZ' | 'BJ';

/** 证券代码来源 */
export type MarketCodeSource =
  | 'sse_name'
  | 'szse_name'
  | 'bse_name'
  | 'sse_delist'
  | 'szse_delist'
  | 'sdk_active'
  | 'manual';

/** 证券主数据写入项 */
export interface MarketSecurityInput {
  code: string;
  exchange: MarketExchange;
  name: string;
  listDate: string | null;
  delistDate: string | null;
  isActive: boolean;
  codeSource: MarketCodeSource;
  fetchedAt: number;
}

/** 证券主数据读取行 */
export interface MarketSecurityRow {
  code: string;
  exchange: MarketExchange;
  name: string;
  listDate: string | null;
  delistDate: string | null;
  isActive: boolean;
  codeSource: MarketCodeSource;
}

/** 任务状态 */
export type MarketTaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'disabled';

/** 任务读取行 */
export interface MarketTaskRow {
  taskKey: string;
  stockCode: string | null;
  dataKind: MarketDataKind;
  lastSuccessDate: string | null;
  status: MarketTaskStatus;
  retryCount: number;
  nextRetryAt: number | null;
  lastError: string | null;
}

/** 任务状态计数 */
export interface MarketTaskCounts {
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  disabled: number;
}

/** 派生周期表名白名单 */
const DERIVED_TABLES: Record<MarketPeriod, string> = {
  weekly: 'kline_weekly_raw',
  monthly: 'kline_monthly_raw',
};

/** 派生数据源标识 */
export const DERIVED_SOURCE = 'derived:kline_daily_raw';
/** 因子数据源标识 */
export const FACTOR_SOURCE = 'derived:sohu_hisHq';
/** Pseudo code 占位（证券名缺失时） */
export const UNKNOWN_SECURITY_NAME = '未知证券';

/** 代码来源优先级：manual > 退市清单 > 交易所在市名录 > sdk 兜底 */
const CODE_SOURCE_RANK: Record<MarketCodeSource, number> = {
  manual: 4,
  sse_delist: 3,
  szse_delist: 3,
  sse_name: 2,
  szse_name: 2,
  bse_name: 2,
  sdk_active: 1,
};

/**
 * 按来源优先级合并单条证券记录
 * @param existing 库内已有记录（无则 null）
 * @param incoming 新来源记录
 * @returns 合并后的记录；若新来源优先级更低则返回 null（不覆盖）
 */
export function mergeSecurityRecord(
  existing: MarketSecurityRow | null,
  incoming: MarketSecurityInput
): MarketSecurityRow | null {
  if (!existing) {
    return {
      code: incoming.code,
      exchange: incoming.exchange,
      name: incoming.name.trim() !== '' ? incoming.name.trim() : incoming.code,
      listDate: incoming.listDate,
      delistDate: incoming.delistDate,
      isActive: incoming.isActive,
      codeSource: incoming.codeSource,
    };
  }

  const incomingRank = CODE_SOURCE_RANK[incoming.codeSource];
  const existingRank = CODE_SOURCE_RANK[existing.codeSource];
  if (incomingRank < existingRank) {
    return null;
  }

  return {
    code: incoming.code,
    exchange: incoming.exchange,
    name:
      incoming.name.trim() !== ''
        ? incoming.name.trim()
        : existing.name !== ''
          ? existing.name
          : incoming.code,
    // 低优先级来源只能补空字段，不能清空已有日期
    listDate: incoming.listDate ?? existing.listDate,
    delistDate: incoming.delistDate ?? existing.delistDate,
    // 同优先级或更高优先级来源决定在市状态；低优先级不会走到这里
    isActive: incoming.isActive,
    codeSource: incoming.codeSource,
  };
}

/** 批量来源包 */
export interface MarketSecurityBatch {
  codeSource: MarketCodeSource;
  rows: Array<Omit<MarketSecurityInput, 'codeSource' | 'fetchedAt'>>;
}

/**
 * 按 manual > 退市清单 > 交易所名录 > sdk 的优先级合并多来源证券池
 * @param existing 库内已有证券（code → 行）
 * @param batches 来源批次（调用方按任意顺序传入，本函数按优先级应用）
 * @param fetchedAt 抓取时间（epoch 秒）
 * @returns 需要写入的完整记录（已去重）
 */
export function mergeSecurityBatches(
  existing: ReadonlyMap<string, MarketSecurityRow>,
  batches: readonly MarketSecurityBatch[],
  fetchedAt: number
): MarketSecurityInput[] {
  const merged = new Map<string, MarketSecurityRow>();
  existing.forEach((row, code) => {
    merged.set(code, row);
  });

  // 按来源优先级从低到高应用，高优先级来源最终覆盖
  const sorted = [...batches].sort(
    (left, right) => CODE_SOURCE_RANK[left.codeSource] - CODE_SOURCE_RANK[right.codeSource]
  );

  for (const batch of sorted) {
    for (const row of batch.rows) {
      const incoming: MarketSecurityInput = { ...row, codeSource: batch.codeSource, fetchedAt };
      const current = merged.get(row.code) ?? null;
      const next = mergeSecurityRecord(current, incoming);
      if (next) {
        merged.set(row.code, next);
      }
    }
  }

  return Array.from(merged.values()).map(row => ({ ...row, fetchedAt }));
}

/**
 * 写入证券主数据（UPSERT）
 */
export function saveSecurities(
  db: MarketDatabase,
  rows: readonly MarketSecurityInput[],
  now: number = Math.floor(Date.now() / 1000)
): void {
  transactionMarket(() => {
    for (const row of rows) {
      executeMarket(
        `INSERT INTO securities
           (code, exchange, name, type, list_date, delist_date, is_active, code_source, fetched_at, updated_at)
         VALUES (?, ?, ?, 'STOCK', ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           exchange = excluded.exchange,
           name = excluded.name,
           list_date = excluded.list_date,
           delist_date = excluded.delist_date,
           is_active = excluded.is_active,
           code_source = excluded.code_source,
           fetched_at = excluded.fetched_at,
           updated_at = excluded.updated_at`,
        [
          row.code,
          row.exchange,
          row.name,
          row.listDate,
          row.delistDate,
          row.isActive ? 1 : 0,
          row.codeSource,
          row.fetchedAt,
          now,
        ],
        db
      );
    }
  }, db);
}

/** 读取全部证券（可选仅在市） */
export function listSecurities(
  db: MarketDatabase,
  options: { activeOnly?: boolean } = {}
): MarketSecurityRow[] {
  const where = options.activeOnly ? 'WHERE is_active = 1' : '';
  const rows = queryMarketRows(
    `SELECT code, exchange, name, list_date, delist_date, is_active, code_source
     FROM securities ${where} ORDER BY code`,
    [],
    db
  );
  return rows.map(toSecurityRow);
}

/** 读取单只证券 */
export function getSecurity(db: MarketDatabase, code: string): MarketSecurityRow | null {
  const rows = queryMarketRows(
    `SELECT code, exchange, name, list_date, delist_date, is_active, code_source
     FROM securities WHERE code = ?`,
    [code],
    db
  );
  return rows.length > 0 ? toSecurityRow(rows[0]) : null;
}

/** 证券总数 */
export function countSecurities(db: MarketDatabase, activeOnly = false): number {
  const value = queryMarketValue<number>(
    `SELECT COUNT(*) FROM securities${activeOnly ? ' WHERE is_active = 1' : ''}`,
    [],
    db
  );
  return Number(value ?? 0);
}

function toSecurityRow(row: SqlValue[]): MarketSecurityRow {
  return {
    code: String(row[0]),
    exchange: String(row[1]) as MarketExchange,
    name: String(row[2]),
    listDate: row[3] === null ? null : String(row[3]),
    delistDate: row[4] === null ? null : String(row[4]),
    isActive: Number(row[5]) === 1,
    codeSource: String(row[6]) as MarketCodeSource,
  };
}

/**
 * 整表替换交易日历（单事务内先清空再写入），并记录来源与抓取时间
 * @param dates 源文件全部交易日（YYYY-MM-DD，含未来已公布日期）
 */
export function replaceTradingCalendar(
  db: MarketDatabase,
  dates: readonly string[],
  source: string,
  now: number = Math.floor(Date.now() / 1000)
): number {
  const unique = Array.from(
    new Set(dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))
  ).sort();
  transactionMarket(() => {
    executeMarket('DELETE FROM trading_calendar', [], db);
    for (const date of unique) {
      executeMarket('INSERT INTO trading_calendar (trade_date) VALUES (?)', [date], db);
    }
    setMarketMeta({ calendar_source: source, calendar_synced_at: now }, db);
  }, db);
  return unique.length;
}

/** 读取全部交易日（升序） */
export function listTradingCalendar(db: MarketDatabase): string[] {
  return queryMarketRows('SELECT trade_date FROM trading_calendar ORDER BY trade_date', [], db).map(
    row => String(row[0])
  );
}

/**
 * 原始日线写入行：在基础 OHLCV 之外携带数据源口径的涨跌/振幅字段
 */
export interface MarketDailyRawInput extends MarketDailyBar {
  amplitude?: number | null;
  changePercent?: number | null;
  changeAmount?: number | null;
}

/** 原始日线读取行 */
export interface MarketDailyRawRow extends MarketDailyBar {
  amplitude: number | null;
  changePercent: number | null;
  changeAmount: number | null;
}

/**
 * 原始日线批量 UPSERT（幂等，重复下载不新增行）
 * @returns 写入行数
 */
export function upsertDailyRaw(
  db: MarketDatabase,
  stockCode: string,
  bars: readonly MarketDailyRawInput[],
  source: string,
  now: number = Math.floor(Date.now() / 1000)
): number {
  if (bars.length === 0) {
    return 0;
  }
  transactionMarket(() => {
    for (const bar of bars) {
      executeMarket(
        `INSERT INTO kline_daily_raw
           (stock_code, trade_date, open, high, low, close, volume, amount,
            amplitude, change_percent, change_amount, turnover_rate, source, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stock_code, trade_date) DO UPDATE SET
           open = excluded.open,
           high = excluded.high,
           low = excluded.low,
           close = excluded.close,
           volume = excluded.volume,
           amount = excluded.amount,
           amplitude = excluded.amplitude,
           change_percent = excluded.change_percent,
           change_amount = excluded.change_amount,
           turnover_rate = excluded.turnover_rate,
           source = excluded.source,
           fetched_at = excluded.fetched_at`,
        [
          stockCode,
          bar.tradeDate,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          bar.amount,
          bar.amplitude ?? null,
          bar.changePercent ?? null,
          bar.changeAmount ?? null,
          bar.turnoverRate,
          source,
          now,
        ],
        db
      );
    }
  }, db);
  return bars.length;
}

/**
 * 读取原始日线区间（升序）
 */
export function readDailyRaw(
  db: MarketDatabase,
  stockCode: string,
  startDate?: string,
  endDate?: string
): MarketDailyRawRow[] {
  let sql =
    `SELECT trade_date, open, high, low, close, volume, amount, turnover_rate,
            amplitude, change_percent, change_amount
     FROM kline_daily_raw WHERE stock_code = ?`;
  const params: unknown[] = [stockCode];
  if (startDate) {
    sql += ' AND trade_date >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND trade_date <= ?';
    params.push(endDate);
  }
  sql += ' ORDER BY trade_date ASC';

  return queryMarketRows(sql, params, db).map(row => ({
    tradeDate: String(row[0]),
    open: toNumber(row[1]),
    high: toNumber(row[2]),
    low: toNumber(row[3]),
    close: toNumber(row[4]),
    volume: toNumber(row[5]),
    amount: toNumber(row[6]),
    turnoverRate: toNumber(row[7]),
    amplitude: toNumber(row[8]),
    changePercent: toNumber(row[9]),
    changeAmount: toNumber(row[10]),
  }));
}

/** 读取某股票原始日线的最早/最晚交易日 */
export function getRawDateRange(
  db: MarketDatabase,
  stockCode: string
): { earliest: string | null; latest: string | null } {
  const rows = queryMarketRows(
    'SELECT MIN(trade_date), MAX(trade_date) FROM kline_daily_raw WHERE stock_code = ?',
    [stockCode],
    db
  );
  if (rows.length === 0) {
    return { earliest: null, latest: null };
  }
  return {
    earliest: rows[0][0] === null ? null : String(rows[0][0]),
    latest: rows[0][1] === null ? null : String(rows[0][1]),
  };
}

/** 因子写入行 */
export interface MarketFactorRow {
  tradeDate: string;
  qfqFactor: number;
  hfqFactor: number;
}

/**
 * 按股票全量替换复权因子：同一事务内删除旧因子并写入新因子
 */
export function replaceAdjustFactors(
  db: MarketDatabase,
  stockCode: string,
  rows: readonly MarketFactorRow[],
  source: string = FACTOR_SOURCE,
  now: number = Math.floor(Date.now() / 1000)
): number {
  transactionMarket(() => {
    executeMarket('DELETE FROM adjust_factors WHERE stock_code = ?', [stockCode], db);
    insertFactors(db, stockCode, rows, source, now);
  }, db);
  return rows.length;
}

/**
 * 局部写入因子（增量场景：只有新区间的原始与复权价，无法重建全历史因子）
 */
export function upsertAdjustFactors(
  db: MarketDatabase,
  stockCode: string,
  rows: readonly MarketFactorRow[],
  source: string = FACTOR_SOURCE,
  now: number = Math.floor(Date.now() / 1000)
): number {
  if (rows.length === 0) {
    return 0;
  }
  transactionMarket(() => {
    insertFactors(db, stockCode, rows, source, now);
  }, db);
  return rows.length;
}

function insertFactors(
  db: MarketDatabase,
  stockCode: string,
  rows: readonly MarketFactorRow[],
  source: string,
  now: number
): void {
  for (const row of rows) {
    executeMarket(
      `INSERT INTO adjust_factors (stock_code, trade_date, qfq_factor, hfq_factor, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(stock_code, trade_date) DO UPDATE SET
         qfq_factor = excluded.qfq_factor,
         hfq_factor = excluded.hfq_factor,
         source = excluded.source,
         fetched_at = excluded.fetched_at`,
      [stockCode, row.tradeDate, row.qfqFactor, row.hfqFactor, source, now],
      db
    );
  }
}

/** 因子数量 */
export function countAdjustFactors(db: MarketDatabase, stockCode: string): number {
  return Number(
    queryMarketValue<number>('SELECT COUNT(*) FROM adjust_factors WHERE stock_code = ?', [stockCode], db) ?? 0
  );
}

/**
 * 读取某股票某复权类型的逐日因子
 * @param adjust 'qfq' | 'hfq'
 */
export function readAdjustFactors(
  db: MarketDatabase,
  stockCode: string,
  adjust: 'qfq' | 'hfq'
): Map<string, number> {
  const column = adjust === 'qfq' ? 'qfq_factor' : 'hfq_factor';
  const rows = queryMarketRows(
    `SELECT trade_date, ${column} FROM adjust_factors WHERE stock_code = ? ORDER BY trade_date`,
    [stockCode],
    db
  );
  const factors = new Map<string, number>();
  for (const row of rows) {
    const value = toNumber(row[1]);
    if (value !== null) {
      factors.set(String(row[0]), value);
    }
  }
  return factors;
}

/**
 * 重建派生周/月线
 * @param db 行情库
 * @param stockCode 股票代码
 * @param period 周期类型
 * @param options.fromDate 增量起点（包含）；缺省表示整只股票全量重建
 * @param options.calendar 升序交易日（用于 is_final）
 * @returns 写入的周期行数
 */
export function rebuildDerivedPeriods(
  db: MarketDatabase,
  stockCode: string,
  period: MarketPeriod,
  options: { fromDate?: string; calendar?: readonly string[]; source?: string; now?: number } = {}
): MarketDerivedBar[] {
  const table = DERIVED_TABLES[period];
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const source = options.source ?? DERIVED_SOURCE;
  const fromPeriodStart = options.fromDate ? periodStartOf(options.fromDate, period) : null;
  const bars = readDailyRaw(db, stockCode, fromPeriodStart ?? undefined);
  const derived = aggregateBars(bars, period, options.calendar ?? []);

  transactionMarket(() => {
    if (fromPeriodStart) {
      // 按 period_start_date 删除受影响周期：禁止用 period_end_date 作为周期身份
      executeMarket(
        `DELETE FROM ${table} WHERE stock_code = ? AND period_start_date >= ?`,
        [stockCode, fromPeriodStart],
        db
      );
    } else {
      executeMarket(`DELETE FROM ${table} WHERE stock_code = ?`, [stockCode], db);
    }

    for (const bar of derived) {
      executeMarket(
        `INSERT INTO ${table}
           (stock_code, period_start_date, period_end_date, is_final, open, high, low, close,
            volume, amount, turnover_rate, source, generated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stockCode,
          bar.periodStartDate,
          bar.periodEndDate,
          bar.isFinal ? 1 : 0,
          bar.open,
          bar.high,
          bar.low,
          bar.close,
          bar.volume,
          bar.amount,
          bar.turnoverRate,
          source,
          now,
        ],
        db
      );
    }
  }, db);

  return derived;
}

/** 读取不复权派生周期 */
export function readDerivedPeriods(
  db: MarketDatabase,
  stockCode: string,
  period: MarketPeriod
): MarketDerivedBar[] {
  const table = DERIVED_TABLES[period];
  const rows = queryMarketRows(
    `SELECT period_start_date, period_end_date, is_final, open, high, low, close, volume, amount, turnover_rate
     FROM ${table} WHERE stock_code = ? ORDER BY period_start_date ASC`,
    [stockCode],
    db
  );
  return rows.map(row => ({
    periodStartDate: String(row[0]),
    periodEndDate: String(row[1]),
    isFinal: Number(row[2]) === 1,
    open: toNumber(row[3]),
    high: toNumber(row[4]),
    low: toNumber(row[5]),
    close: toNumber(row[6]),
    volume: toNumber(row[7]),
    amount: toNumber(row[8]),
    turnoverRate: toNumber(row[9]),
  }));
}

/**
 * 读取复权周/月线：先对日线逐日应用因子，再按周/月聚合
 *
 * 因子完全缺失时返回空数组（复权周期数据不可用），不得退化为不复权数据。
 * 个别日期缺因子时跳过该日，避免用错误因子污染整段聚合。
 */
export function readAdjustedPeriodKline(
  db: MarketDatabase,
  stockCode: string,
  period: MarketPeriod,
  adjust: 'qfq' | 'hfq',
  calendar: readonly string[] = []
): MarketAdjustedPeriodBar[] {
  const factors = readAdjustFactors(db, stockCode, adjust);
  if (factors.size === 0) {
    return [];
  }
  const bars = readDailyRaw(db, stockCode);
  const withFactor = bars
    .filter(bar => factors.has(bar.tradeDate))
    .map(bar => ({ ...bar, factor: factors.get(bar.tradeDate) as number }));
  if (withFactor.length === 0) {
    return [];
  }
  return aggregateAdjustedBars(withFactor, period, calendar);
}

/**
 * 追加质量异常记录（只追加，不阻断导入）
 */
export function insertQualityIssues(
  db: MarketDatabase,
  issues: readonly MarketQualityIssue[],
  now: number = Math.floor(Date.now() / 1000)
): number {
  if (issues.length === 0) {
    return 0;
  }
  transactionMarket(() => {
    for (const issue of issues) {
      executeMarket(
        `INSERT INTO data_quality_issues (stock_code, trade_date, issue_type, detail, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [issue.stockCode, issue.tradeDate, issue.issueType, issue.detail, now],
        db
      );
    }
  }, db);
  return issues.length;
}

/** 质量异常数量（测试与状态展示用） */
export function countQualityIssues(db: MarketDatabase, issueType?: string): number {
  return Number(
    queryMarketValue<number>(
      issueType
        ? 'SELECT COUNT(*) FROM data_quality_issues WHERE issue_type = ?'
        : 'SELECT COUNT(*) FROM data_quality_issues',
      issueType ? [issueType] : [],
      db
    ) ?? 0
  );
}

/**
 * 幂等生成待执行任务：已存在的 task_key 不重复插入
 * @returns 新插入的任务数
 */
export function insertPendingTasks(
  db: MarketDatabase,
  tasks: ReadonlyArray<{ stockCode: string | null; dataKind: MarketDataKind }>,
  now: number = Math.floor(Date.now() / 1000)
): number {
  let inserted = 0;
  transactionMarket(() => {
    for (const task of tasks) {
      const taskKey = buildTaskKey(task.stockCode, task.dataKind);
      // ON CONFLICT DO NOTHING：changes() = 1 表示本次真正插入
      const modified = executeMarket(
        `INSERT INTO sync_state (task_key, stock_code, data_kind, status, retry_count, updated_at)
         VALUES (?, ?, ?, 'pending', 0, ?)
         ON CONFLICT(task_key) DO NOTHING`,
        [taskKey, task.stockCode, task.dataKind, now],
        db
      );
      inserted += modified;
    }
  }, db);
  return inserted;
}

/** 读取任务 */
export function getTask(db: MarketDatabase, taskKey: string): MarketTaskRow | null {
  const rows = queryMarketRows(
    `SELECT task_key, stock_code, data_kind, last_success_date, status, retry_count, next_retry_at, last_error
     FROM sync_state WHERE task_key = ?`,
    [taskKey],
    db
  );
  return rows.length > 0 ? toTaskRow(rows[0]) : null;
}

/**
 * 领取一个可执行任务并置为 running
 *
 * 可执行：`pending`，或 `failed` 且 `next_retry_at` 已到期（未达到最大重试次数）
 * 排序：市场级任务优先（证券池/日历是日线任务的前提），其余按插入顺序
 */
export function claimNextTask(db: MarketDatabase, now: number = Date.now()): MarketTaskRow | null {
  const rows = queryMarketRows(
    `SELECT task_key, stock_code, data_kind, last_success_date, status, retry_count, next_retry_at, last_error
     FROM sync_state
     WHERE status = 'pending'
        OR (status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?)
     ORDER BY
       CASE data_kind
         WHEN 'active_codes' THEN 0
         WHEN 'delisted_codes' THEN 1
         WHEN 'calendar' THEN 2
         ELSE 3
       END,
       rowid ASC
     LIMIT 1`,
    [now],
    db
  );
  if (rows.length === 0) {
    return null;
  }
  const task = toTaskRow(rows[0]);
  const nowSec = Math.floor(now / 1000);
  executeMarket(
    `UPDATE sync_state SET status = 'running', last_attempt_at = ?, updated_at = ?
     WHERE task_key = ?`,
    [nowSec, nowSec, task.taskKey],
    db
  );
  return { ...task, status: 'running' };
}

/** 标记任务成功 */
export function markTaskSuccess(
  db: MarketDatabase,
  taskKey: string,
  lastSuccessDate: string | null,
  now: number = Math.floor(Date.now() / 1000)
): void {
  executeMarket(
    `UPDATE sync_state
     SET status = 'success', last_success_date = COALESCE(?, last_success_date),
         retry_count = 0, next_retry_at = NULL, last_error = NULL, updated_at = ?
     WHERE task_key = ?`,
    [lastSuccessDate, now, taskKey],
    db
  );
}

/** 标记任务失败并安排下一次自动重试（已达到上限时不再排期） */
export function markTaskRetry(
  db: MarketDatabase,
  taskKey: string,
  options: { retryCount: number; nextRetryAt: number | null; error: string },
  now: number = Math.floor(Date.now() / 1000)
): void {
  executeMarket(
    `UPDATE sync_state
     SET status = 'failed', retry_count = ?, next_retry_at = ?, last_error = ?, updated_at = ?
     WHERE task_key = ?`,
    [
      options.retryCount,
      options.nextRetryAt === null ? null : Math.floor(options.nextRetryAt / 1000),
      options.error,
      now,
      taskKey,
    ],
    db
  );
}

/**
 * 进程重启恢复：running 任务回退 pending，控制状态置 idle
 * @returns 回退的任务数
 */
export function resetInterruptedTasks(
  db: MarketDatabase,
  now: number = Math.floor(Date.now() / 1000)
): number {
  const modified = executeMarket(
    `UPDATE sync_state SET status = 'pending', updated_at = ? WHERE status = 'running'`,
    [now],
    db
  );
  setMarketMeta({ sync_control_state: 'idle' }, db);
  return modified;
}

/**
 * 重试失败任务：只重置 failed 任务，success 任务与已完成数据保持不变
 * @returns 被重置的任务数
 */
export function resetFailedTasks(
  db: MarketDatabase,
  now: number = Date.now()
): number {
  const nowSec = Math.floor(now / 1000);
  return executeMarket(
    `UPDATE sync_state
     SET status = 'pending', retry_count = 0, next_retry_at = ?, last_error = NULL, updated_at = ?
     WHERE status = 'failed'`,
    [nowSec, nowSec],
    db
  );
}

/** 把指定股票的任务重置为 pending（增量更新/因子补算用，不新建任务键） */
export function resetTasksForStocks(
  db: MarketDatabase,
  stockCodes: readonly string[],
  now: number = Math.floor(Date.now() / 1000)
): number {
  let modified = 0;
  transactionMarket(() => {
    for (const stockCode of stockCodes) {
      for (const kind of ['raw_daily'] as const) {
        modified += executeMarket(
          `UPDATE sync_state
           SET status = 'pending', retry_count = 0, next_retry_at = NULL, last_error = NULL, updated_at = ?
           WHERE task_key = ?`,
          [now, buildTaskKey(stockCode, kind)],
          db
        );
      }
    }
  }, db);
  return modified;
}

/** 把指定任务重置为 pending（增量补跑用，不新建任务键） */
export function setTasksPending(
  db: MarketDatabase,
  taskKeys: readonly string[],
  now: number = Math.floor(Date.now() / 1000)
): number {
  let modified = 0;
  transactionMarket(() => {
    for (const taskKey of taskKeys) {
      modified += executeMarket(
        `UPDATE sync_state
         SET status = 'pending', retry_count = 0, next_retry_at = NULL, last_error = NULL, updated_at = ?
         WHERE task_key = ?`,
        [now, taskKey],
        db
      );
    }
  }, db);
  return modified;
}

/** 增量补跑汇总（只统计在市证券的日线任务） */
export interface MarketIncrementalSummary {
  /** 在市证券的日线任务总数（应为 在市政券数 × 1） */
  activeTaskCount: number;
  /** 尚无 last_success_date 的任务数（>0 表示全量回填未完成） */
  missingLastSuccess: number;
  /** last_success_date 早于最新交易日的任务数 */
  behindCount: number;
  /** 所有在市任务中最小的 last_success_date */
  earliestLastSuccess: string | null;
}

/**
 * 汇总增量补跑所需信息（聚合查询，供 1 秒轮询状态使用）
 * @param latestTradeDate 最新交易日（YYYY-MM-DD）
 */
export function summarizeIncrementalTasks(
  db: MarketDatabase,
  latestTradeDate: string
): MarketIncrementalSummary {
  const rows = queryMarketRows(
    `SELECT COUNT(*),
            SUM(CASE WHEN s.last_success_date IS NULL THEN 1 ELSE 0 END),
            SUM(CASE WHEN s.last_success_date IS NOT NULL AND s.last_success_date < ? THEN 1 ELSE 0 END),
            MIN(s.last_success_date)
     FROM sync_state s
     JOIN securities sec ON sec.code = s.stock_code
     WHERE sec.is_active = 1
       AND s.data_kind IN ('raw_daily', 'qfq_daily', 'hfq_daily')`,
    [latestTradeDate],
    db
  );
  const row = rows[0] ?? [];
  return {
    activeTaskCount: Number(row[0] ?? 0),
    missingLastSuccess: Number(row[1] ?? 0),
    behindCount: Number(row[2] ?? 0),
    earliestLastSuccess: row[3] === null || row[3] === undefined ? null : String(row[3]),
  };
}

/** 任务状态计数 */
export function countTasks(db: MarketDatabase): MarketTaskCounts {
  const rows = queryMarketRows('SELECT status, COUNT(*) FROM sync_state GROUP BY status', [], db);
  const counts: MarketTaskCounts = {
    total: 0,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    disabled: 0,
  };
  for (const row of rows) {
    const status = String(row[0]) as MarketTaskStatus;
    const count = Number(row[1]);
    if (status in counts) {
      counts[status] = count;
    }
    counts.total += count;
  }
  return counts;
}

/** 日线任务数量（按状态过滤可选） */
export function countDailyTasks(db: MarketDatabase, status?: MarketTaskStatus): number {
  const params: unknown[] = [];
  let sql = `SELECT COUNT(*) FROM sync_state WHERE data_kind IN ('raw_daily', 'qfq_daily', 'hfq_daily')`;
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  return Number(queryMarketValue<number>(sql, params, db) ?? 0);
}

/** 存在未完成（pending/running）的日线任务时返回数量 */
export function countUnfinishedDailyTasks(db: MarketDatabase): number {
  return Number(
    queryMarketValue<number>(
      `SELECT COUNT(*) FROM sync_state
       WHERE data_kind IN ('raw_daily', 'qfq_daily', 'hfq_daily')
         AND status IN ('pending', 'running')`,
      [],
      db
    ) ?? 0
  );
}

/** 距离下一次到期重试的毫秒数；无排期时返回 null */
export function nextScheduledRetryAt(db: MarketDatabase): number | null {
  const value = queryMarketValue<number>(
    `SELECT MIN(next_retry_at) FROM sync_state
     WHERE status = 'failed' AND next_retry_at IS NOT NULL`,
    [],
    db
  );
  return value === null ? null : Number(value) * 1000;
}

/** 失败任务读取行（页面失败任务表） */
export interface MarketFailedTaskRow {
  taskKey: string;
  stockCode: string | null;
  dataKind: MarketDataKind;
  retryCount: number;
  lastError: string | null;
  nextRetryAt: number | null;
}

/** 读取失败任务（按最近更新时间倒序） */
export function listFailedTasks(db: MarketDatabase, limit = 50): MarketFailedTaskRow[] {
  const rows = queryMarketRows(
    `SELECT task_key, stock_code, data_kind, retry_count, last_error, next_retry_at
     FROM sync_state WHERE status = 'failed'
     ORDER BY updated_at DESC LIMIT ?`,
    [Math.max(1, Math.floor(limit))],
    db
  );
  return rows.map(row => ({
    taskKey: String(row[0]),
    stockCode: row[1] === null ? null : String(row[1]),
    dataKind: String(row[2]) as MarketDataKind,
    retryCount: Number(row[3]),
    lastError: row[4] === null ? null : String(row[4]),
    nextRetryAt: row[5] === null ? null : Number(row[5]) * 1000,
  }));
}

/** 最近一条失败错误 */
export function lastFailedError(db: MarketDatabase): string | null {
  const value = queryMarketValue<string>(
    `SELECT last_error FROM sync_state
     WHERE status = 'failed' AND last_error IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
    [],
    db
  );
  return value === null ? null : String(value);
}

/**
 * 清理按复权类型拆分的旧日线任务（升级到一证券一任务时执行一次）
 *
 * `qfq_daily / hfq_daily` 任务没有数据产物（因子写入 `adjust_factors`），
 * 删除任务行不影响任何行情数据。
 * @returns 删除的任务数
 */
export function purgeLegacyDailyTasks(db: MarketDatabase): number {
  return executeMarket(
    `DELETE FROM sync_state WHERE data_kind IN ('qfq_daily', 'hfq_daily')`,
    [],
    db
  );
}

/**
 * 列出「日线任务已成功但因子缺失或不完整」的证券
 *
 * 一证券一任务改造后，因子由同一任务内的原始日线推导；旧库中因子缺失的证券
 * 需要重置任务补算，因子完整的证券保持不动，避免重复下载。
 * @returns 需要补算因子的证券代码
 */
export function listStocksWithIncompleteFactors(db: MarketDatabase): string[] {
  const rows = queryMarketRows(
    `SELECT s.stock_code
     FROM sync_state s
     WHERE s.data_kind = 'raw_daily'
       AND s.status = 'success'
       AND s.stock_code IS NOT NULL
       AND (SELECT COUNT(*) FROM adjust_factors f WHERE f.stock_code = s.stock_code)
           < (SELECT COUNT(*) FROM kline_daily_raw r WHERE r.stock_code = s.stock_code)
     ORDER BY s.stock_code`,
    [],
    db
  );
  return rows
    .map(row => (row[0] === null || row[0] === undefined ? '' : String(row[0])))
    .filter(code => code !== '');
}

/** 读取全部日线任务（增量计划用） */
export function listDailyTasks(
  db: MarketDatabase
): Array<{ stockCode: string | null; dataKind: MarketDataKind; lastSuccessDate: string | null; status: MarketTaskStatus }> {
  const rows = queryMarketRows(
    `SELECT stock_code, data_kind, last_success_date, status FROM sync_state
     WHERE data_kind IN ('raw_daily', 'qfq_daily', 'hfq_daily')`,
    [],
    db
  );
  return rows.map(row => ({
    stockCode: row[0] === null ? null : String(row[0]),
    dataKind: String(row[1]) as MarketDataKind,
    lastSuccessDate: row[2] === null ? null : String(row[2]),
    status: String(row[3]) as MarketTaskStatus,
  }));
}

/** 市场级任务的插入批次 */
export function marketLevelTasks(): Array<{ stockCode: null; dataKind: MarketDataKind }> {
  return MARKET_LEVEL_KINDS.map(kind => ({ stockCode: null, dataKind: kind }));
}

function toTaskRow(row: SqlValue[]): MarketTaskRow {
  return {
    taskKey: String(row[0]),
    stockCode: row[1] === null ? null : String(row[1]),
    dataKind: String(row[2]) as MarketDataKind,
    lastSuccessDate: row[3] === null ? null : String(row[3]),
    status: String(row[4]) as MarketTaskStatus,
    retryCount: Number(row[5] ?? 0),
    nextRetryAt: row[6] === null || row[6] === undefined ? null : Number(row[6]) * 1000,
    lastError: row[7] === null || row[7] === undefined ? null : String(row[7]),
  };
}

function toNumber(value: SqlValue | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
