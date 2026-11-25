/**
 * 全市场同步策略原语（纯函数 / 可注入时钟，便于单测）
 *
 * 覆盖：并发与 RPS 上限、1 秒滑动窗口限速、指数退避与 Retry-After、
 * 交易日推进、任务键生成。本模块不依赖 electron 运行时。
 */

/** 全量回填统一起点（早于 A 股首个交易日，由数据源按上市日截断） */
export const BACKFILL_START_DATE = '19900101';

/** 并发默认值与上限 */
export const DEFAULT_CONCURRENCY = 3;
export const MAX_CONCURRENCY = 5;

/** 请求速率默认值与上限（req/s） */
export const DEFAULT_RPS = 3;
export const MAX_RPS = 5;

/** 自动重试：最多 3 次重试（初始请求 + 3 次重试） */
export const MAX_AUTO_RETRIES = 3;
/** 退避基础延迟 1000ms，指数因子 2，上限 60000ms，抖动 0～500ms */
export const BASE_RETRY_DELAY_MS = 1000;
export const RETRY_BACKOFF_FACTOR = 2;
export const MAX_RETRY_DELAY_MS = 60000;
export const RETRY_JITTER_MS = 500;

/** 1 秒滑动窗口的窗口长度 */
export const RATE_WINDOW_MS = 1000;

/**
 * 并发数归一化：非法值回落默认值，超过上限收敛到上限
 */
export function clampConcurrency(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_CONCURRENCY;
  }
  return Math.min(Math.floor(value), MAX_CONCURRENCY);
}

/**
 * 请求速率归一化：非法值回落默认值，超过上限收敛到上限
 */
export function clampRequestsPerSecond(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return DEFAULT_RPS;
  }
  return Math.min(Math.floor(value), MAX_RPS);
}

/** 限速器接口 */
export interface RateLimiter {
  /**
   * 等待到允许发起下一次请求的时刻
   * @remarks 所有 HTTP 请求（含重试）都必须先调用本方法
   */
  acquire(): Promise<void>;
  /** 最近 1 秒窗口内已放行的请求数（测试与状态展示用） */
  countInWindow(): number;
}

/**
 * 创建 1 秒滑动窗口限速器（不设 burst，并发的数量不能替代速率限制）
 * @param options.maxPerSecond 允许的最大请求数（自动 clamp）
 * @param options.now 时钟注入（默认 Date.now）
 * @param options.sleep 休眠注入（默认真实定时器）
 */
export function createSlidingWindowRateLimiter(options: {
  maxPerSecond?: number | null;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
} = {}): RateLimiter {
  const maxPerSecond = clampRequestsPerSecond(options.maxPerSecond);
  const windowMs = options.windowMs && options.windowMs > 0 ? options.windowMs : RATE_WINDOW_MS;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const timestamps: number[] = [];

  const prune = (current: number): void => {
    while (timestamps.length > 0 && timestamps[0] <= current - windowMs) {
      timestamps.shift();
    }
  };

  return {
    async acquire(): Promise<void> {
      // 循环等待：可能被其它并发请求持续挤出窗口
      for (;;) {
        const current = now();
        prune(current);
        if (timestamps.length < maxPerSecond) {
          timestamps.push(current);
          return;
        }
        const wait = timestamps[0] + windowMs - current + 1;
        await sleep(wait > 0 ? wait : 1);
      }
    },
    countInWindow(): number {
      const current = now();
      prune(current);
      return timestamps.length;
    },
  };
}

/**
 * 计算第 n 次自动重试前的退避延迟
 * @param retryCount 已完成的自动重试次数（从 1 开始）
 * @param random 抖动随机数注入（默认 Math.random）
 * @returns 延迟毫秒数（基础指数退避 + 0～500ms 抖动，且不超过上限）
 */
export function computeBackoffDelay(retryCount: number, random: () => number = Math.random): number {
  const attempt = Number.isFinite(retryCount) && retryCount >= 1 ? Math.floor(retryCount) : 1;
  const base = Math.min(BASE_RETRY_DELAY_MS * RETRY_BACKOFF_FACTOR ** (attempt - 1), MAX_RETRY_DELAY_MS);
  const jitter = Math.floor(random() * (RETRY_JITTER_MS + 1));
  return Math.min(base + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * 解析 `Retry-After` 响应头
 * @param value 秒数字符串或 HTTP 日期
 * @param now 当前时间（毫秒），用于日期形式换算
 * @returns 毫秒延迟；无法解析时返回 null
 */
export function parseRetryAfter(value: unknown, now: number = Date.now()): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value * 1000);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, parsed - now);
}

/**
 * 计算下一次重试时间戳
 * @param options.retryCount 本次失败后将累计的自动重试次数
 * @param options.now 当前时间（毫秒）
 * @param options.retryAfterMs 响应 `Retry-After` 解析值
 * @param options.random 抖动随机数注入
 * @returns epoch 毫秒
 */
export function computeNextRetryAt(options: {
  retryCount: number;
  now: number;
  retryAfterMs?: number | null;
  random?: () => number;
}): number {
  const delay = computeBackoffDelay(options.retryCount, options.random);
  const retryAfter = options.retryAfterMs && options.retryAfterMs > 0 ? options.retryAfterMs : 0;
  return options.now + Math.max(delay, retryAfter);
}

/** 数据任务类型 */
export type MarketDataKind =
  | 'active_codes'
  | 'delisted_codes'
  | 'calendar'
  | 'raw_daily'
  | 'qfq_daily'
  | 'hfq_daily';

/** 市场级任务使用的固定伪代码 */
export const MARKET_TASK_CODE = '__MARKET__';

/** 市场级任务类型（不绑定具体股票） */
export const MARKET_LEVEL_KINDS: readonly MarketDataKind[] = ['active_codes', 'delisted_codes', 'calendar'];

/** 股票级日线任务类型 */
export const DAILY_KINDS: readonly MarketDataKind[] = ['raw_daily', 'qfq_daily', 'hfq_daily'];

/** 数据任务类型的中文标签 */
export const DATA_KIND_LABELS: Record<MarketDataKind, string> = {
  active_codes: '在市证券名录',
  delisted_codes: '退市证券清单',
  calendar: '交易日历',
  raw_daily: '原始日线',
  qfq_daily: '前复权日线',
  hfq_daily: '后复权日线',
};

/**
 * 生成任务键
 * @param stockCode 股票代码；市场级任务传 null
 * @param kind 数据类型
 * @returns `<stock_code>:<data_kind>` 或 `__MARKET__:<data_kind>`
 */
export function buildTaskKey(stockCode: string | null | undefined, kind: MarketDataKind): string {
  const code = stockCode && stockCode.trim() !== '' ? stockCode.trim() : MARKET_TASK_CODE;
  return `${code}:${kind}`;
}

/** `YYYYMMDD` → `YYYY-MM-DD` */
export function ymdToIso(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    return value;
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** `YYYY-MM-DD` → `YYYYMMDD` */
export function isoToYmd(value: string): string {
  return value.replace(/-/g, '');
}

/**
 * 取日历中严格晚于给定日期的首个交易日
 * @param calendar 升序排列的交易日（YYYY-MM-DD）
 * @param date 基准日期（YYYY-MM-DD）
 * @returns 下一交易日；不存在时返回 null
 */
export function nextTradingDay(calendar: readonly string[], date: string): string | null {
  for (const candidate of calendar) {
    if (candidate > date) {
      return candidate;
    }
  }
  return null;
}

/**
 * 取日历中不晚于今天的最新交易日
 * @param calendar 升序排列的交易日（YYYY-MM-DD）
 * @param today 今天（YYYY-MM-DD）
 * @returns 最新交易日；不存在时返回 null
 */
export function latestTradingDay(calendar: readonly string[], today: string): string | null {
  let latest: string | null = null;
  for (const candidate of calendar) {
    if (candidate <= today) {
      latest = candidate;
    } else {
      break;
    }
  }
  return latest;
}

/** 本地时区今天（YYYY-MM-DD） */
export function localTodayIso(now: number = Date.now()): string {
  const date = new Date(now);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 工作池执行结果 */
export interface WorkerPoolOptions<T> {
  concurrency: number;
  /** 领取下一个任务；返回 null 表示当前无可领取任务 */
  claim: () => T | null | Promise<T | null>;
  /** 执行任务（失败由 execute 内部处理，不得抛出中断池） */
  run: (task: T) => Promise<void>;
  /** 是否继续领取（默认一直领取到 claim 返回 null） */
  shouldContinue?: () => boolean;
}

/**
 * 动态领取型工作池：并发数即实际同时在跑的任务数上限
 * @returns 池内全部 worker 结束后的 Promise
 */
export async function runWorkerPool<T>(options: WorkerPoolOptions<T>): Promise<void> {
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const shouldContinue = options.shouldContinue ?? (() => true);

  const worker = async (): Promise<void> => {
    while (shouldContinue()) {
      const task = await options.claim();
      if (task === null) {
        return;
      }
      try {
        await options.run(task);
      } catch {
        // 单任务异常不得中断整个池；具体错误由 run 内部记录到任务状态
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
