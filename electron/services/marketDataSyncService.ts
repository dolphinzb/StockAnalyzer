/**
 * 全市场行情库同步服务
 *
 * 职责：
 * - 任务生成：全量回填任务（证券 × raw/qfq/hfq）与手动增量补跑任务
 * - 调度执行：动态工作池（并发默认 10 / 上限 15）+ 最小间隔匀速限流（默认 333ms / 3 req/s）
 * - 失败处理：最多 3 次自动重试，指数退避 + 抖动 + Retry-After，超限置 failed
 * - 断点续跑：任务持久化在 sync_state，重启后 running → pending，控制状态 idle，不自动继续
 * - 写入：原始日线 UPSERT、因子全量/局部刷新、周/月派生重建、质量异常记录
 *
 * 本服务不注册任何每日自动调度器：全量回填与增量更新都只能由管理页面显式触发。
 */

import log from 'electron-log';
import { getMarketDb, exportMarketSnapshot, getMarketMeta, setMarketMeta, type MarketDatabase } from '../marketDatabase';
import type {
  MarketDataKind,
  MarketFailedTask,
  MarketSyncControlResult,
  MarketSyncMode,
  MarketSyncState,
  MarketSyncStatus,
} from '../../shared/types';
import {
  areDailyTasksSucceeded,
  claimNextTask,
  countAdjustFactors,
  countDailyTasks,
  countSecurities,
  countTasks,
  countUnfinishedDailyTasks,
  getSecurity,
  getTask,
  insertPendingTasks,
  insertQualityIssues,
  lastFailedError,
  listDailyTasks,
  listFailedTasks,
  listSecurities,
  listTradingCalendar,
  markTaskRetry,
  markTaskSuccess,
  marketLevelTasks,
  nextScheduledRetryAt,
  readAdjustFactors,
  readDailyRaw,
  rebuildDerivedPeriods,
  replaceAdjustFactors,
  resetFailedTasks,
  resetInterruptedTasks,
  setTasksPending,
  summarizeIncrementalTasks,
  upsertAdjustFactors,
  upsertDailyRaw,
  type MarketDailyRawRow,
  type MarketFactorRow,
  type MarketSecurityRow,
  type MarketTaskCounts,
  type MarketTaskRow,
} from './marketRepository';
import {
  detectDuplicateDates,
  detectFactorInvalid,
  detectGap,
  detectOhlcInvalid,
  detectPriceJump,
  detectStale,
  type MarketQualityIssue,
} from './marketQuality';
import type { MarketDailyBar } from './marketPeriod';
import {
  BACKFILL_START_DATE,
  buildTaskKey,
  clampConcurrency,
  clampRequestsPerSecond,
  computeNextRetryAt,
  createPacedRateLimiter,
  DAILY_KINDS,
  intervalMsForRps,
  isoToYmd,
  latestTradingDay,
  localTodayIso,
  MARKET_LEVEL_KINDS,
  MAX_AUTO_RETRIES,
  nextTradingDay,
  parseRetryAfter,
  runWorkerPool,
  ymdToIso,
  type RateLimiter,
} from './marketSyncPolicy';
import {
  CALENDAR_SOURCE,
  syncSecuritiesUniverse,
  syncTradingCalendar,
  type MarketHttpFetch,
  type UniverseScope,
} from './marketUniverseService';
import { createMarketSdkClient, type MarketKlineItem, type MarketSdkLike } from './marketSdkClient';
import { createSohuKlineClient } from './sohuKlineClient';

/** 原始日线数据源标识 */
export const DAILY_RAW_SOURCE = 'sohu_hisHq';
/** 会话内因子缓存上限（防止长时间运行时内存膨胀） */
const SESSION_CACHE_LIMIT = 500;
/** 复权事件判定的兜底最小相对阈值（低于此变化无法与舍入噪声区分） */
const MIN_CORPORATE_ACTION_DELTA = 1e-4;

/** 相邻交易日的后复权因子采样点（用于判断区间内是否发生除权除息） */
export interface HfqFactorPoint {
  tradeDate: string;
  /** 当日不复权收盘价 */
  rawClose: number;
  /** 当日后复权因子 = hfq_close / raw_close */
  hfqFactor: number;
}

/**
 * 判断两个相邻交易点之间是否发生了除权除息（后复权因子发生跳变）
 *
 * 无事件时 `hfq_factor` 在同一周期内是常数，相邻日期的差异只来自复权价与原始价
 * 两位小数的舍入；因此阈值取「舍入噪声上限 × 3」，并随股价自动缩放：
 * 低价股噪声更大、阈值更高，高价股能识别更小的分红送转。
 *
 * 局限：小于舍入噪声的极小额分红（通常对应前复权 <0.1% 的变化）无法识别，
 * 但其影响低于数据源自身精度，不触发全历史重算。
 */
export function isHfqFactorJump(previous: HfqFactorPoint, next: HfqFactorPoint): boolean {
  const values = [previous.rawClose, next.rawClose, previous.hfqFactor, next.hfqFactor];
  if (values.some(value => !Number.isFinite(value) || value <= 0)) {
    return false;
  }
  const previousHfqClose = previous.rawClose * previous.hfqFactor;
  const nextHfqClose = next.rawClose * next.hfqFactor;
  // 两端各两个两位小数价格，单点舍入误差上限 = 0.005 / 价格
  const roundingNoise =
    0.005 *
    (1 / previous.rawClose +
      1 / previousHfqClose +
      1 / next.rawClose +
      1 / nextHfqClose);
  const threshold = Math.max(roundingNoise * 3, MIN_CORPORATE_ACTION_DELTA);
  return Math.abs(next.hfqFactor / previous.hfqFactor - 1) > threshold;
}

/**
 * 判断区间内是否发生除权除息（相邻点按日期升序传入）
 */
export function detectCorporateAction(points: readonly HfqFactorPoint[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (isHfqFactorJump(points[index - 1], points[index])) {
      return true;
    }
  }
  return false;
}

/** 同步服务依赖（测试可全部注入） */
export interface MarketSyncDeps {
  db: MarketDatabase;
  sdk: MarketSdkLike;
  fetchText: MarketHttpFetch;
  /** 当前时间（毫秒） */
  now?: () => number;
  /** 休眠（毫秒） */
  sleep?: (ms: number) => Promise<void>;
  /** 退避抖动随机源 */
  random?: () => number;
  /** 并发数覆盖（仍会被 clampConcurrency 收敛） */
  concurrency?: number;
  /** 请求速率覆盖（仍会被 clampRequestsPerSecond 收敛） */
  requestsPerSecond?: number;
  /** 同步结束后的轻量快照导出（生产环境注入；测试通常不注入） */
  exportSnapshot?: () => void;
}

/** 行情库同步服务对外接口 */
export interface MarketSyncService {
  getStatus(): MarketSyncStatus;
  /** 全量回填：首次先完成证券池/日历，再幂等生成日线任务；已有任务时恢复调度 */
  start(): Promise<MarketSyncControlResult>;
  /** 手动增量补跑：从各任务 last_success_date 的下一交易日补到最新交易日 */
  incremental(): Promise<MarketSyncControlResult>;
  /** 只重置 failed 任务并启动调度 */
  retryFailed(): Promise<MarketSyncControlResult>;
  /** 进程启动恢复：running → pending，控制状态 idle，不自动继续 */
  recover(): void;
  /** 停止调度（应用退出） */
  stop(): void;
  /** 当前是否正在运行 */
  isRunning(): boolean;
}

/** 会话内三类日线收盘价缓存（用于在三个任务都成功后推导因子） */
interface SessionEntry {
  raw?: Map<string, number>;
  qfq?: Map<string, number>;
  hfq?: Map<string, number>;
}

/** meta 键 */
const META_CONTROL_STATE = 'sync_control_state';
const META_SYNC_MODE = 'sync_mode';
const META_SYNC_STARTED_AT = 'sync_started_at';
const META_LAST_FULL = 'last_full_backfill_at';
const META_LAST_INCREMENTAL = 'last_incremental_at';
const META_BACKFILL_START = 'backfill_start_date';
const META_CONCURRENCY = 'sync_concurrency';
const META_RPS = 'sync_rps';

/**
 * 把异常展开为可读文本
 *
 * Node fetch 抛出的 `TypeError: fetch failed` 真正原因在 `error.cause`
 * （ECONNRESET / ENOTFOUND / ECONNREFUSED / TLS 错误等），只打 message 无法定位。
 * SDK 的异常也可能在 `code / status / syscall` 上带关键信息，这里一并展开。
 */
export function describeSyncError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const seen = new Set<unknown>();
  const chain: string[] = [];
  let current: unknown = error;

  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (seen.has(current)) {
      break;
    }
    seen.add(current);

    if (!(current instanceof Error)) {
      const text = String(current).trim();
      if (text !== '') {
        chain.push(text);
      }
      break;
    }

    const details = current as Error & {
      code?: unknown;
      status?: unknown;
      syscall?: unknown;
      hostname?: unknown;
      address?: unknown;
      port?: unknown;
      cause?: unknown;
    };
    const extras: string[] = [];
    if (typeof details.code === 'string' || typeof details.code === 'number') {
      extras.push(String(details.code));
    }
    if (typeof details.status === 'number') {
      extras.push(`HTTP ${details.status}`);
    }
    if (typeof details.syscall === 'string') {
      extras.push(details.syscall);
    }
    if (typeof details.address === 'string') {
      extras.push(details.port ? `${details.address}:${details.port}` : details.address);
    } else if (typeof details.hostname === 'string') {
      extras.push(details.hostname);
    }

    const message = current.message || current.name;
    chain.push(extras.length > 0 ? `${message} [${extras.join(' ')}]` : message);
    current = details.cause;
  }

  return chain.join(' <- cause: ');
}

/**
 * 默认 HTTP 实现（Node/Electron 全局 fetch + 超时 + Retry-After 透出）
 */
export function createDefaultFetchText(timeoutMs = 30000): MarketHttpFetch {
  return async request => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(request.url, {
        method: request.method ?? 'GET',
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
    } catch (error) {
      // Node fetch 的网络错误 message 通常只是 "fetch failed"，补上 URL 与底层 cause
      const original = error as (Error & { retryAfterMs?: number; status?: number }) | null;
      const wrapped = new Error(
        `${request.method ?? 'GET'} ${request.url} ${
          controller.signal.aborted ? `请求超时（${timeoutMs}ms）` : '请求失败'
        }`
      ) as Error & { cause?: unknown; retryAfterMs?: number; status?: number };
      wrapped.cause = error;
      if (typeof original?.retryAfterMs === 'number') {
        wrapped.retryAfterMs = original.retryAfterMs;
      }
      if (typeof original?.status === 'number') {
        wrapped.status = original.status;
      }
      throw wrapped;
    }
    try {
      const text = await response.text();
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim()) as Error & {
          status?: number;
          retryAfterMs?: number;
        };
        error.status = response.status;
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'), Date.now());
        if (retryAfter !== null) {
          error.retryAfterMs = retryAfter;
        }
        throw error;
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * 从异常中提取 `Retry-After`（毫秒）
 */
export function extractRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const candidate = error as {
    retryAfterMs?: unknown;
    retryAfter?: unknown;
    headers?: Record<string, unknown>;
    details?: Record<string, unknown>;
  };
  // retryAfterMs 已是毫秒；retryAfter 按秒或 HTTP 日期解析
  if (typeof candidate.retryAfterMs === 'number' && Number.isFinite(candidate.retryAfterMs)) {
    return Math.max(0, candidate.retryAfterMs);
  }
  const parsedDirect = parseRetryAfter(candidate.retryAfter);
  if (parsedDirect !== null) {
    return parsedDirect;
  }
  const header = candidate.headers?.['retry-after'] ?? candidate.headers?.['Retry-After'];
  const parsedHeader = parseRetryAfter(header);
  if (parsedHeader !== null) {
    return parsedHeader;
  }
  const detail = candidate.details?.retryAfter ?? candidate.details?.retryAfterMs;
  return parseRetryAfter(detail);
}

/** 代码前缀（stock-sdk 调用） */
export function sdkSymbol(code: string, exchange: string): string {
  const prefix = exchange === 'SH' ? 'sh' : exchange === 'BJ' ? 'bj' : 'sz';
  return `${prefix}${code}`;
}

/** 复权类型映射 */
function adjustOfKind(kind: MarketDataKind): '' | 'qfq' | 'hfq' {
  if (kind === 'qfq_daily') {
    return 'qfq';
  }
  if (kind === 'hfq_daily') {
    return 'hfq';
  }
  return '';
}

/**
 * 把 SDK 日线转换为仓储可写入的结构，并按日期去重排序
 */
export function toDailyBars(
  items: readonly MarketKlineItem[],
  startDate: string,
  endDate: string
): Array<MarketDailyBar & {
  amplitude: number | null;
  changePercent: number | null;
  changeAmount: number | null;
}> {
  const byDate = new Map<string, MarketDailyBar & {
    amplitude: number | null;
    changePercent: number | null;
    changeAmount: number | null;
  }>();

  for (const item of items) {
    const date = typeof item.date === 'string' ? item.date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < startDate || date > endDate) {
      continue;
    }
    byDate.set(date, {
      tradeDate: date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
      amount: item.amount,
      turnoverRate: item.turnoverRate,
      amplitude: item.amplitude,
      changePercent: item.changePercent,
      changeAmount: item.change,
    });
  }

  return Array.from(byDate.values()).sort((left, right) =>
    left.tradeDate.localeCompare(right.tradeDate)
  );
}

/**
 * 创建行情库同步服务
 */
export function createMarketSyncService(deps: MarketSyncDeps): MarketSyncService {
  const db = deps.db;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;

  let schedulerPromise: Promise<void> | null = null;
  let stopped = false;
  let limiter: RateLimiter | null = null;
  let current: { taskKey: string | null; stockCode: string | null } | null = null;
  let lastError: string | null = null;
  let calendarCache: string[] | null = null;
  const session = new Map<string, SessionEntry>();

  const nowSec = (): number => Math.floor(now() / 1000);

  /** meta 数值读取 */
  const readMetaNumber = (key: string, fallback?: number): number | undefined => {
    const value = getMarketMeta(key, db);
    if (value === null || value.trim() === '') {
      return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const readMode = (): MarketSyncMode | null => {
    const value = getMarketMeta(META_SYNC_MODE, db);
    return value === 'full' || value === 'incremental' ? value : null;
  };

  const readState = (): MarketSyncState => {
    const value = getMarketMeta(META_CONTROL_STATE, db);
    return value === 'running' || value === 'completed' || value === 'failed' || value === 'idle'
      ? value
      : 'idle';
  };

  const setControl = (state: MarketSyncState, mode?: MarketSyncMode): void => {
    const entries: Record<string, string | number> = {
      [META_CONTROL_STATE]: state,
      [META_BACKFILL_START]: BACKFILL_START_DATE,
    };
    if (mode) {
      entries[META_SYNC_MODE] = mode;
    }
    if (state === 'running') {
      entries[META_SYNC_STARTED_AT] = nowSec();
    }
    setMarketMeta(entries, db);
  };

  const getCalendar = (): string[] => {
    if (calendarCache === null) {
      calendarCache = listTradingCalendar(db);
    }
    return calendarCache;
  };

  const getLatestTradeDate = (): string | null =>
    latestTradingDay(getCalendar(), localTodayIso(now()));

  /** 限速包裹：所有 HTTP / SDK 请求（含重试）都必须经过 */
  const limited = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (limiter) {
      await limiter.acquire();
    }
    return fn();
  };

  /** 带限速的 SDK 视图 */
  const limitedSdk = (): MarketSdkLike => ({
    getHistoryKline: (symbol, options) => limited(() => deps.sdk.getHistoryKline(symbol, options)),
    getAShareCodeList: options => limited(() => deps.sdk.getAShareCodeList(options)),
    getTradingCalendar: () => limited(() => deps.sdk.getTradingCalendar()),
    getAllQuotesByCodes: deps.sdk.getAllQuotesByCodes
      ? codes => limited(() => (deps.sdk.getAllQuotesByCodes as NonNullable<MarketSdkLike['getAllQuotesByCodes']>)(codes))
      : undefined,
    search: deps.sdk.search ? keyword => limited(() => (deps.sdk.search as NonNullable<MarketSdkLike['search']>)(keyword)) : undefined,
  });

  /** 带限速的 HTTP 视图 */
  const limitedFetch: MarketHttpFetch = request => limited(() => deps.fetchText(request));

  /** 拉取某股票某复权类型的日线 */
  const fetchBars = async (
    security: MarketSecurityRow,
    adjust: '' | 'qfq' | 'hfq',
    startDate: string,
    endDate: string
  ): Promise<Array<MarketDailyBar & { amplitude: number | null; changePercent: number | null; changeAmount: number | null }>> => {
    const items = await limited(() =>
      deps.sdk.getHistoryKline(sdkSymbol(security.code, security.exchange), {
        period: 'daily',
        adjust,
        startDate: isoToYmd(startDate),
        endDate: isoToYmd(endDate),
      })
    );
    return toDailyBars(items, startDate, endDate);
  };

  /** 记录会话缓存（限制条目数） */
  const rememberCloses = (code: string, kind: MarketDataKind, bars: readonly MarketDailyBar[]): void => {
    const key = kind === 'raw_daily' ? 'raw' : kind === 'qfq_daily' ? 'qfq' : 'hfq';
    const entry = session.get(code) ?? {};
    const closes = new Map<string, number>();
    for (const bar of bars) {
      if (typeof bar.close === 'number' && Number.isFinite(bar.close)) {
        closes.set(bar.tradeDate, bar.close);
      }
    }
    entry[key] = closes;
    session.set(code, entry);
    if (session.size > SESSION_CACHE_LIMIT) {
      const firstKey = session.keys().next().value;
      if (firstKey !== undefined) {
        session.delete(firstKey);
      }
    }
  };

  /** 记录质量异常（失败不阻断导入） */
  const recordIssues = (issues: MarketQualityIssue[]): void => {
    if (issues.length === 0) {
      return;
    }
    try {
      insertQualityIssues(db, issues, nowSec());
    } catch (error) {
      log.warn(`质量异常写入失败（不阻断导入）: ${String(error)}`);
    }
  };

  /** 原始日线质量检查 */
  const collectRawIssues = (
    security: MarketSecurityRow,
    bars: readonly MarketDailyBar[],
    range: { startDate: string; endDate: string }
  ): MarketQualityIssue[] => {
    const issues: MarketQualityIssue[] = [
      ...detectDuplicateDates(security.code, bars),
      ...detectOhlcInvalid(security.code, bars),
      ...detectPriceJump(security.code, bars),
    ];

    const actualDates = bars.map(bar => bar.tradeDate);
    const firstBar = actualDates.length > 0 ? actualDates[0] : null;
    // 期望区间从「上市日与请求起点」的较晚者开始，避免未上市期间被误判为缺口
    const listDate = security.listDate;
    const expectedStart =
      listDate && listDate > range.startDate ? listDate : range.startDate;
    const gapEnd = firstBar && firstBar < expectedStart ? firstBar : range.endDate;
    const expected = getCalendar().filter(date => date >= expectedStart && date <= gapEnd);
    if (expected.length > 0) {
      issues.push(...detectGap(security.code, expected, actualDates));
    }

    if (actualDates.length > 0) {
      issues.push(...detectStale(security.code, actualDates[actualDates.length - 1], range.endDate));
    }

    return issues;
  };

  /** 执行市场级任务 */
  const runMarketTask = async (kind: MarketDataKind): Promise<void> => {
    if (kind === 'calendar') {
      const written = await syncTradingCalendar(db, {
        fetchText: limitedFetch,
        sdk: limitedSdk(),
        now,
      });
      calendarCache = null;
      log.info(`交易日历任务完成: ${written} 个交易日（来源 ${CALENDAR_SOURCE}）`);
      return;
    }
    const scope: UniverseScope = kind === 'active_codes' ? 'active' : 'delisted';
    const result = await syncSecuritiesUniverse(
      db,
      { fetchText: limitedFetch, sdk: limitedSdk(), now },
      scope
    );
    log.info(`证券池任务完成（${kind}）: 共 ${result.total} 只，在市 ${result.active} 只`);
  };

  /** 执行单只股票的日线任务 */
  const runDailyTask = async (task: MarketTaskRow): Promise<string | null> => {
    const stockCode = task.stockCode;
    if (!stockCode) {
      throw new Error(`日线任务缺少股票代码: ${task.taskKey}`);
    }
    const security = getSecurity(db, stockCode);
    if (!security) {
      throw new Error(`证券不存在: ${stockCode}`);
    }

    const mode = readMode() ?? 'full';
    const calendar = getCalendar();
    const endDate = latestTradingDay(calendar, localTodayIso(now()));
    if (!endDate) {
      throw new Error('交易日历为空，无法确定下载终点');
    }

    let startDate = BACKFILL_START_DATE;
    if (mode === 'incremental') {
      if (!task.lastSuccessDate) {
        throw new Error('增量任务缺少 last_success_date，请先完成全量回填');
      }
      const next = nextTradingDay(calendar, task.lastSuccessDate);
      if (!next || next > endDate) {
        // 已追平最新交易日：不发请求，保持原断点
        return task.lastSuccessDate;
      }
      startDate = next;
    }

    const startIso = ymdToIso(startDate);
    const adjust = adjustOfKind(task.dataKind);
    const bars = await fetchBars(security, adjust, startIso, endDate);

    if (adjust === '') {
      upsertDailyRaw(db, stockCode, bars, DAILY_RAW_SOURCE, nowSec());
      // 周/月派生只依赖原始日线；从受影响周期开始重建
      rebuildDerivedPeriods(db, stockCode, 'weekly', {
        fromDate: startIso,
        calendar,
        now: nowSec(),
      });
      rebuildDerivedPeriods(db, stockCode, 'monthly', {
        fromDate: startIso,
        calendar,
        now: nowSec(),
      });
      recordIssues(collectRawIssues(security, bars, { startDate: startIso, endDate }));
    }

    rememberCloses(stockCode, task.dataKind, bars);

    if (bars.length === 0) {
      // 未上市期间或区间内无交易日：视为正常结果，断点推进到终点
      return endDate;
    }
    return bars[bars.length - 1].tradeDate;
  };

  /**
   * 判断增量区间内是否发生除权除息
   *
   * 采样序列 = 区间前最近一个已存 hfq 因子点 + 区间内各点（按日期升序），
   * 任一相邻点发生 hfq 因子跳变即视为区间内存在复权事件。
   */
  const hasCorporateActionInIncrement = (
    rawByDate: Map<string, number | null>,
    storedHfq: Map<string, number>,
    factorRows: ReadonlyArray<{ tradeDate: string; hfqFactor: number }>
  ): boolean => {
    if (factorRows.length === 0 || storedHfq.size === 0) {
      return false;
    }
    const earliest = factorRows[0].tradeDate;
    let previousDate: string | null = null;
    storedHfq.forEach((_factor, date) => {
      if (date < earliest && (previousDate === null || date > previousDate)) {
        previousDate = date;
      }
    });

    const points: HfqFactorPoint[] = [];
    if (previousDate !== null) {
      const rawClose = rawByDate.get(previousDate);
      const previousFactor = storedHfq.get(previousDate);
      if (typeof rawClose === 'number' && rawClose > 0 && previousFactor && previousFactor > 0) {
        points.push({ tradeDate: previousDate, rawClose, hfqFactor: previousFactor });
      }
    }
    for (const row of factorRows) {
      const rawClose = rawByDate.get(row.tradeDate);
      if (typeof rawClose === 'number' && rawClose > 0) {
        points.push({ tradeDate: row.tradeDate, rawClose, hfqFactor: row.hfqFactor });
      }
    }
    return detectCorporateAction(points);
  };

  /**
   * 前复权重标定：补拉一次全历史 qfq 日线，按股票全量替换因子
   *
   * hfq 历史因子稳定，直接沿用库内值（不足处用会话内新区间数据补齐），不做重新推导。
   * @param factorRows 本次增量区间已推导出的因子（覆盖不完整时退化为局部写入）
   */
  const rescaleQfqHistory = async (
    security: MarketSecurityRow,
    rawRows: readonly MarketDailyRawRow[],
    storedHfq: Map<string, number>,
    factorRows: ReadonlyArray<{ tradeDate: string; qfqFactor: number; hfqFactor: number }>
  ): Promise<void> => {
    let lastRawDate = '';
    for (const row of rawRows) {
      if (row.tradeDate > lastRawDate) {
        lastRawDate = row.tradeDate;
      }
    }
    if (lastRawDate === '') {
      return;
    }

    log.info(`检测到除权除息，重标定前复权因子: ${security.code}`);
    const qfqBars = await fetchBars(security, 'qfq', ymdToIso(BACKFILL_START_DATE), lastRawDate);
    const qfqByDate = new Map<string, number>();
    for (const bar of qfqBars) {
      if (typeof bar.close === 'number' && bar.close > 0) {
        qfqByDate.set(bar.tradeDate, bar.close);
      }
    }

    // hfq 因子：库内历史值优先，区间内新推导出的因子覆盖
    const hfqFactors = new Map<string, number>(storedHfq);
    for (const row of factorRows) {
      hfqFactors.set(row.tradeDate, row.hfqFactor);
    }

    const rows: MarketFactorRow[] = [];
    for (const raw of rawRows) {
      const rawClose = raw.close;
      const qfqClose = qfqByDate.get(raw.tradeDate) ?? null;
      const hfqFactor = hfqFactors.get(raw.tradeDate) ?? null;
      if (
        rawClose === null ||
        rawClose <= 0 ||
        qfqClose === null ||
        hfqFactor === null ||
        hfqFactor <= 0
      ) {
        continue;
      }
      rows.push({ tradeDate: raw.tradeDate, qfqFactor: qfqClose / rawClose, hfqFactor });
    }

    if (rows.length !== rawRows.length) {
      // 覆盖不完整时不做全量替换，退化为局部写入，避免丢失仍有效的历史因子
      log.warn(
        `前复权重标定覆盖不完整（${rows.length}/${rawRows.length}），退化为局部写入: ${security.code}`
      );
      upsertAdjustFactors(db, security.code, factorRows, undefined, nowSec());
      return;
    }

    replaceAdjustFactors(db, security.code, rows, undefined, nowSec());
  };

  /**
   * 三类日线任务都成功后刷新复权因子
   *
   * - 会话内已拿到 raw/qfq/hfq 全历史收盘价：按股票全量替换
   * - 会话内只有增量区间数据且区间内无除权除息：局部 UPSERT（历史 hfq 与 qfq 因子不变）
   * - 会话内只有增量区间数据但区间内发生除权除息：前复权以最新价为基准，全部历史 qfq 因子
   *   都需要重标定，此时补拉一次全历史 qfq 并按股票全量替换；hfq 历史值稳定，取库内原值合并
   * - 会话内缺数据但库内已有因子：跳过（重启后的补跑场景，避免额外全历史请求）
   * - 既无会话数据也无因子：补拉全历史 qfq/hfq 后推导
   */
  const maybeRefreshFactors = async (stockCode: string): Promise<void> => {
    if (!areDailyTasksSucceeded(db, stockCode)) {
      return;
    }
    const security = getSecurity(db, stockCode);
    if (!security) {
      return;
    }

    const entry = session.get(stockCode);
    let qfq = entry?.qfq ?? null;
    let hfq = entry?.hfq ?? null;
    const hasFactors = countAdjustFactors(db, stockCode) > 0;

    if ((!qfq || !hfq || qfq.size === 0 || hfq.size === 0) && !hasFactors) {
      const endDate = getLatestTradeDate();
      if (!endDate) {
        return;
      }
      try {
        const qfqBars = await fetchBars(security, 'qfq', ymdToIso(BACKFILL_START_DATE), endDate);
        const hfqBars = await fetchBars(security, 'hfq', ymdToIso(BACKFILL_START_DATE), endDate);
        rememberCloses(stockCode, 'qfq_daily', qfqBars);
        rememberCloses(stockCode, 'hfq_daily', hfqBars);
        qfq = session.get(stockCode)?.qfq ?? null;
        hfq = session.get(stockCode)?.hfq ?? null;
      } catch (error) {
        log.warn(`补拉复权日线用于因子推导失败 ${stockCode}: ${String(error)}`);
        return;
      }
    }

    if (!qfq || !hfq || qfq.size === 0 || hfq.size === 0) {
      return;
    }

    const rawRows: MarketDailyRawRow[] = readDailyRaw(db, stockCode);
    const rawByDate = new Map<string, number | null>();
    for (const row of rawRows) {
      rawByDate.set(row.tradeDate, row.close);
    }

    // 写入前读取已存 hfq 因子：既用于事件判定，也用于重标定时保留历史 hfq 值
    const storedHfq = readAdjustFactors(db, stockCode, 'hfq');
    const factorRows: Array<{ tradeDate: string; qfqFactor: number; hfqFactor: number }> = [];
    const invalid: Array<{
      tradeDate: string;
      rawClose: number | null;
      qfqFactor: number | null;
      hfqFactor: number | null;
    }> = [];

    for (const row of rawRows) {
      const rawClose = row.close;
      const qfqClose = qfq.get(row.tradeDate) ?? null;
      const hfqClose = hfq.get(row.tradeDate) ?? null;
      if (rawClose === null || rawClose <= 0 || qfqClose === null || hfqClose === null) {
        invalid.push({
          tradeDate: row.tradeDate,
          rawClose,
          qfqFactor: qfqClose === null ? null : qfqClose,
          hfqFactor: hfqClose === null ? null : hfqClose,
        });
        continue;
      }
      const qfqFactor = qfqClose / rawClose;
      const hfqFactor = hfqClose / rawClose;
      if (!Number.isFinite(qfqFactor) || !Number.isFinite(hfqFactor) || qfqFactor <= 0 || hfqFactor <= 0) {
        invalid.push({ tradeDate: row.tradeDate, rawClose, qfqFactor, hfqFactor });
        continue;
      }
      factorRows.push({ tradeDate: row.tradeDate, qfqFactor, hfqFactor });
    }

    if (factorRows.length === 0) {
      recordIssues(detectFactorInvalid(stockCode, invalid));
      session.delete(stockCode);
      return;
    }

    const coversFullHistory = factorRows.length === rawRows.length;

    try {
      if (coversFullHistory) {
        // 覆盖全历史：按股票全量替换
        replaceAdjustFactors(db, stockCode, factorRows, undefined, nowSec());
      } else if (hasCorporateActionInIncrement(rawByDate, storedHfq, factorRows)) {
        await rescaleQfqHistory(security, rawRows, storedHfq, factorRows);
      } else {
        // 区间内无除权除息：历史因子不变，只追加新区间，避免删除仍有效的历史因子
        upsertAdjustFactors(db, stockCode, factorRows, undefined, nowSec());
      }
      const invalidRows = invalid.filter(row => row.rawClose !== null && row.rawClose > 0);
      recordIssues(detectFactorInvalid(stockCode, invalidRows));
    } catch (error) {
      log.warn(`复权因子写入失败 ${stockCode}: ${String(error)}`);
    } finally {
      session.delete(stockCode);
    }
  };

  /**
   * 失败处理：指数退避 + Retry-After
   *
   * `retry_count` 表示已完成的自动重试次数（0～3）；已重试 3 次后再失败即置 failed 且不再排期，
   * 因此「初始请求 + 3 次重试」共 4 次请求。
   */
  const handleFailure = (task: MarketTaskRow, error: unknown): void => {
    // 展开 fetch/SDK 异常的 cause 链，避免日志里只有 "fetch failed"
    const message = describeSyncError(error);
    lastError = message;
    const retryAfterMs = extractRetryAfterMs(error);

    if (task.retryCount >= MAX_AUTO_RETRIES) {
      markTaskRetry(
        db,
        task.taskKey,
        { retryCount: MAX_AUTO_RETRIES, nextRetryAt: null, error: message },
        nowSec()
      );
      log.warn(`任务失败且已达最大重试次数: ${task.taskKey} - ${message}`);
      return;
    }

    const retryCount = task.retryCount + 1;
    const nextRetryAt = computeNextRetryAt({
      retryCount,
      now: now(),
      retryAfterMs,
      random,
    });
    markTaskRetry(db, task.taskKey, { retryCount, nextRetryAt, error: message }, nowSec());
    log.warn(
      `任务失败，安排第 ${retryCount} 次自动重试: ${task.taskKey}（${Math.round(
        (nextRetryAt - now()) / 1000
      )}s 后）- ${message}`
    );
  };

  /** 执行单个任务（不抛出：异常转换为任务状态） */
  const executeTask = async (task: MarketTaskRow): Promise<void> => {
    if (stopped) {
      return;
    }
    current = { taskKey: task.taskKey, stockCode: task.stockCode };
    try {
      if ((MARKET_LEVEL_KINDS as readonly string[]).includes(task.dataKind)) {
        await runMarketTask(task.dataKind);
        markTaskSuccess(db, task.taskKey, localTodayIso(now()), nowSec());
      } else {
        const lastSuccessDate = await runDailyTask(task);
        markTaskSuccess(db, task.taskKey, lastSuccessDate, nowSec());
        if (task.stockCode) {
          await maybeRefreshFactors(task.stockCode);
        }
      }
    } catch (error) {
      handleFailure(task, error);
    } finally {
      current = null;
    }
  };

  /** 同步结束：写控制状态、完成时间与轻量快照 */
  const finish = (counts: MarketTaskCounts): void => {
    const mode = readMode() ?? 'full';
    const state: MarketSyncState = counts.failed > 0 ? 'failed' : 'completed';
    const entries: Record<string, string | number> = { [META_CONTROL_STATE]: state };
    if (state === 'completed') {
      if (mode === 'full') {
        entries[META_LAST_FULL] = nowSec();
      } else {
        entries[META_LAST_INCREMENTAL] = nowSec();
      }
    }
    setMarketMeta(entries, db);
    log.info(
      `行情库同步结束（${mode} / ${state}）: 共 ${counts.total}，成功 ${counts.success}，失败 ${counts.failed}`
    );
    if (deps.exportSnapshot) {
      try {
        deps.exportSnapshot();
      } catch (error) {
        log.warn(`行情库轻量快照导出失败: ${String(error)}`);
      }
    }
  };

  /** 调度主循环 */
  const runScheduler = async (): Promise<void> => {
    const concurrency = clampConcurrency(readMetaNumber(META_CONCURRENCY, deps.concurrency));
    const rps = clampRequestsPerSecond(readMetaNumber(META_RPS, deps.requestsPerSecond));
    const intervalMs = intervalMsForRps(rps);
    limiter = createPacedRateLimiter({ intervalMs, now, sleep });
    log.info(`行情库同步启动: 并发 ${concurrency}，速率 ${rps} req/s（最小间隔 ${intervalMs}ms）`);

    try {
      for (;;) {
        if (stopped) {
          return;
        }
        await runWorkerPool<MarketTaskRow>({
          concurrency,
          shouldContinue: () => !stopped,
          claim: () => claimNextTask(db, now()),
          run: executeTask,
        });
        if (stopped) {
          return;
        }

        const counts = countTasks(db);
        if (counts.pending > 0) {
          continue;
        }
        const retryAt = nextScheduledRetryAt(db);
        if (retryAt !== null) {
          // 等到最近的自动重试到期（最多 2 秒一段，便于及时响应停止）
          const wait = Math.min(Math.max(retryAt - now(), 20), 2000);
          await sleep(wait);
          continue;
        }
        finish(counts);
        return;
      }
    } finally {
      limiter = null;
      current = null;
    }
  };

  const startScheduler = (): void => {
    if (schedulerPromise) {
      return;
    }
    stopped = false;
    schedulerPromise = runScheduler()
      .catch(error => {
        const message = describeSyncError(error);
        lastError = message;
        log.error(`行情库同步调度异常: ${message}`);
        setMarketMeta({ [META_CONTROL_STATE]: 'failed' }, db);
      })
      .finally(() => {
        schedulerPromise = null;
      });
  };

  /** 首次全量：先跑证券池/日历，再幂等生成日线任务 */
  const bootstrapFullBackfill = async (): Promise<MarketSyncControlResult> => {
    insertPendingTasks(db, marketLevelTasks(), nowSec());

    for (const kind of MARKET_LEVEL_KINDS) {
      const taskKey = buildTaskKey(null, kind);
      const existing = getTask(db, taskKey);
      if (existing && existing.status === 'success') {
        continue;
      }
      const task: MarketTaskRow = existing ?? {
        taskKey,
        stockCode: null,
        dataKind: kind,
        lastSuccessDate: null,
        status: 'pending',
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
      };
      await executeTask(task);
    }

    if (countSecurities(db) === 0) {
      return { success: false, error: '证券池同步失败：未获取到任何证券，请检查网络或稍后重试' };
    }
    if (listTradingCalendar(db).length === 0) {
      return { success: false, error: '交易日历同步失败：请检查网络或稍后重试' };
    }

    const securityCount = countSecurities(db);
    const inserted = ensureDailyTasksForAllSecurities();
    log.info(`全量回填任务已生成: 新增 ${inserted} 个（证券 ${securityCount} 只 × 3）`);
    return { success: true };
  };

  /**
   * 幂等补建缺失的日线任务（覆盖全量回填后新上市的证券）
   * @returns 新增任务数
   */
  const ensureDailyTasksForAllSecurities = (): number => {
    const securities = listSecurities(db);
    if (securities.length === 0) {
      return 0;
    }
    return insertPendingTasks(
      db,
      securities.flatMap(security =>
        DAILY_KINDS.map(kind => ({ stockCode: security.code, dataKind: kind }))
      ),
      nowSec()
    );
  };

  /** 计算增量补跑需要重置的任务键 */
  const computeIncrementalTaskKeys = (latestTradeDate: string): string[] => {
    const calendar = getCalendar();
    const activeCodes = new Set(listSecurities(db, { activeOnly: true }).map(row => row.code));
    const keys: string[] = [];

    for (const task of listDailyTasks(db)) {
      const stockCode = task.stockCode;
      if (!stockCode || !activeCodes.has(stockCode)) {
        continue;
      }
      if (!task.lastSuccessDate) {
        continue;
      }
      const next = nextTradingDay(calendar, task.lastSuccessDate);
      if (!next || next > latestTradeDate) {
        continue;
      }
      keys.push(buildTaskKey(stockCode, task.dataKind));
    }
    return keys;
  };

  const service: MarketSyncService = {
    getStatus(): MarketSyncStatus {
      const counts = countTasks(db);
      const state = readState();
      const mode = readMode();
      const calendar = getCalendar();
      const latest = latestTradingDay(calendar, localTodayIso(now()));

      let earliestMissingDate: string | null = null;
      let incrementalTaskCount = 0;
      if (latest) {
        const summary = summarizeIncrementalTasks(db, latest);
        incrementalTaskCount = summary.behindCount;
        if (summary.earliestLastSuccess) {
          const next = nextTradingDay(calendar, summary.earliestLastSuccess);
          if (next && next <= latest) {
            earliestMissingDate = next;
          }
        }
      }

      const securityCache = new Map<string, string | null>();
      const nameOf = (code: string | null): string | null => {
        if (!code) {
          return null;
        }
        if (!securityCache.has(code)) {
          securityCache.set(code, getSecurity(db, code)?.name ?? null);
        }
        return securityCache.get(code) ?? null;
      };

      const failedTasks: MarketFailedTask[] = listFailedTasks(db, 50).map(row => ({
        taskKey: row.taskKey,
        stockCode: row.stockCode,
        stockName: nameOf(row.stockCode),
        dataKind: row.dataKind as MarketDataKind,
        retryCount: row.retryCount,
        lastError: row.lastError,
        nextRetryAt: row.nextRetryAt === null ? null : new Date(row.nextRetryAt).toISOString(),
      }));

      return {
        state,
        mode,
        total: counts.total,
        pending: counts.pending,
        running: counts.running,
        success: counts.success,
        failed: counts.failed,
        earliestMissingDate,
        latestTradeDate: latest,
        incrementalTaskCount,
        currentTaskKey: current?.taskKey ?? null,
        currentStockCode: current?.stockCode ?? null,
        currentStockName: nameOf(current?.stockCode ?? null),
        lastError: lastFailedError(db) ?? lastError,
        updatedAt: new Date(now()).toISOString(),
        failedTasks,
      };
    },

    async start(): Promise<MarketSyncControlResult> {
      if (schedulerPromise) {
        if (readMode() === 'incremental') {
          return { success: false, error: '增量更新正在进行中，请等待完成后再执行全量回填' };
        }
        return { success: true };
      }

      try {
        if (countDailyTasks(db) === 0) {
          setControl('running', 'full');
          const result = await bootstrapFullBackfill();
          if (!result.success) {
            setMarketMeta({ [META_CONTROL_STATE]: 'failed' }, db);
            lastError = result.error ?? null;
            return result;
          }
        } else {
          // 断点续跑：running 回退 pending，控制状态置 running 后继续
          resetInterruptedTasks(db, nowSec());
          setControl('running', readMode() ?? 'full');
          // 全量回填后新上市的证券没有任务，这里幂等补建（不重复、不影响已完成股票）
          const inserted = ensureDailyTasksForAllSecurities();
          if (inserted > 0) {
            log.info(`补充新增证券的日线任务: ${inserted} 个`);
          }
        }
        startScheduler();
        return { success: true };
      } catch (error) {
        const message = describeSyncError(error);
        lastError = message;
        setMarketMeta({ [META_CONTROL_STATE]: 'failed' }, db);
        log.error(`启动全量回填失败: ${message}`);
        return { success: false, error: message };
      }
    },

    async incremental(): Promise<MarketSyncControlResult> {
      if (schedulerPromise) {
        const mode = readMode();
        return {
          success: false,
          error:
            mode === 'full'
              ? '全量回填尚未完成，无法执行增量更新'
              : '增量更新正在进行中',
        };
      }

      try {
        const latest = getLatestTradeDate();
        if (!latest) {
          return { success: false, error: '交易日历为空，请先执行全量回填' };
        }

        const summary = summarizeIncrementalTasks(db, latest);
        if (summary.activeTaskCount === 0) {
          return { success: false, error: '尚未生成日线任务，请先执行全量回填' };
        }
        // 全量回填后新上市的证券没有任务：必须先继续全量回填补齐历史
        if (summary.activeTaskCount < countSecurities(db, true) * 3) {
          return { success: false, error: '存在尚未生成日线任务的证券，请先执行全量回填' };
        }
        if (summary.missingLastSuccess > 0 || countUnfinishedDailyTasks(db) > 0) {
          return { success: false, error: '存在尚未完成的全量回填任务，请先完成全量回填' };
        }
        if (summary.behindCount === 0) {
          return { success: true };
        }

        const taskKeys = computeIncrementalTaskKeys(latest);
        if (taskKeys.length === 0) {
          return { success: true };
        }
        setTasksPending(db, taskKeys, nowSec());
        setControl('running', 'incremental');
        startScheduler();
        log.info(`增量补跑启动: ${taskKeys.length} 个任务，终点 ${latest}`);
        return { success: true };
      } catch (error) {
        const message = describeSyncError(error);
        lastError = message;
        log.error(`启动增量补跑失败: ${message}`);
        return { success: false, error: message };
      }
    },

    async retryFailed(): Promise<MarketSyncControlResult> {
      if (schedulerPromise) {
        return { success: false, error: '同步正在运行，请等待当前任务结束后再重试失败任务' };
      }
      try {
        const counts = countTasks(db);
        if (counts.failed === 0) {
          return { success: true };
        }
        const reset = resetFailedTasks(db, now());
        log.info(`重试失败任务: 重置 ${reset} 个任务`);
        if (reset === 0) {
          return { success: true };
        }
        setControl('running', readMode() ?? 'full');
        startScheduler();
        return { success: true };
      } catch (error) {
        const message = describeSyncError(error);
        lastError = message;
        log.error(`重试失败任务失败: ${message}`);
        return { success: false, error: message };
      }
    },

    recover(): void {
      const reset = resetInterruptedTasks(db, nowSec());
      calendarCache = null;
      current = null;
      lastError = null;
      if (reset > 0) {
        log.info(`行情库同步恢复: ${reset} 个 running 任务回退为 pending，等待用户继续`);
      }
    },

    stop(): void {
      stopped = true;
      current = null;
      log.info('行情库同步调度已停止');
    },

    isRunning(): boolean {
      return schedulerPromise !== null;
    },
  };

  return service;
}

let singleton: MarketSyncService | null = null;

/**
 * 获取生产环境同步服务单例（首次调用时绑定真实 SDK 与行情库连接）
 */
export function getMarketSyncService(): MarketSyncService {
  if (!singleton) {
    const db = getMarketDb();
    // SDK 内部限流与服务层滑动窗口取同一份 meta 配置，避免某一层成为隐形瓶颈
    const configuredRps = getMarketMeta(META_RPS, db);
    const sdkRps = configuredRps === null ? undefined : Number(configuredRps);

    const factorReader = (code: string) => ({
      qfq: readAdjustFactors(db, code, 'qfq'),
      hfq: readAdjustFactors(db, code, 'hfq'),
    });
    const klineClient = createSohuKlineClient({ readFactors: factorReader });

    singleton = createMarketSyncService({
      db,
      sdk: createMarketSdkClient({
        requestsPerSecond: clampRequestsPerSecond(sdkRps ?? undefined),
        klineClient,
      }),
      fetchText: createDefaultFetchText(),
      // 同步结束只导出元数据快照：全市场因子可达千万行，全量导出会占用大量内存与磁盘
      exportSnapshot: () => {
        exportMarketSnapshot(db, undefined, { includeFactorRows: false });
      },
    });
  }
  return singleton;
}

/**
 * 进程启动恢复：running → pending，控制状态 idle（不自动继续）
 */
export function recoverInterruptedMarketSync(): void {
  getMarketSyncService().recover();
}

/**
 * 应用退出时停止调度
 */
export function stopMarketDataSync(): void {
  if (singleton) {
    singleton.stop();
  }
}
