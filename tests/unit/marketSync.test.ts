import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import {
  executeMarket,
  getMarketMeta,
  openMarketDatabase,
  queryMarketRows,
  queryMarketValue,
  type MarketDatabase,
} from '../../electron/marketDatabase';
import {
  createDefaultFetchText,
  createMarketSyncService,
  describeSyncError,
  detectCorporateAction,
  extractRetryAfterMs,
  isHfqFactorJump,
  toDailyBars,
  type MarketSyncService,
} from '../../electron/services/marketDataSyncService';
import {
  buildTaskKey,
  clampConcurrency,
  clampRequestsPerSecond,
  computeBackoffDelay,
  computeNextRetryAt,
  createPacedRateLimiter,
  createSlidingWindowRateLimiter,
  intervalMsForRps,
  parseRetryAfter,
  runWorkerPool,
} from '../../electron/services/marketSyncPolicy';
import {
  countTasks,
  getTask,
  insertPendingTasks,
  listTradingCalendar,
  markTaskRetry,
  markTaskSuccess,
  readAdjustFactors,
  readDailyRaw,
  replaceAdjustFactors,
  replaceTradingCalendar,
  resetFailedTasks,
  saveSecurities,
  upsertDailyRaw,
  type MarketSecurityInput,
} from '../../electron/services/marketRepository';
import type { MarketKlineItem, MarketSdkLike } from '../../electron/services/marketSdkClient';
import type { MarketHttpFetch } from '../../electron/services/marketUniverseService';

/** 固定日历 */
const CALENDAR = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'];
/** 假时钟：2026-11-25 10:00（本地时间） */
const BASE_TIME = new Date(2026, 10, 25, 10, 0, 0).getTime();

let db: MarketDatabase;
let clock = BASE_TIME;
let service: MarketSyncService | null = null;

const now = (): number => clock;
const sleep = async (ms: number): Promise<void> => {
  clock += ms;
  await Promise.resolve();
};

beforeEach(() => {
  db = openMarketDatabase(':memory:', true);
  clock = BASE_TIME;
});

afterEach(() => {
  service?.stop();
  service = null;
  db.close();
});

const EMPTY_SSE = JSON.stringify({ result: [], pageHelp: { total: 0, pageCount: 0 } });
const EMPTY_SZSE = JSON.stringify([{ metadata: { pagecount: 0 }, tabkey: 'tab1', data: [] }]);
const EMPTY_BSE = JSON.stringify({ data: { content: [], page: { totalPages: 0 } } });

const fetchText: MarketHttpFetch = async request => {
  if (request.url.includes('query.sse.com.cn')) {
    return EMPTY_SSE;
  }
  if (request.url.includes('szse.cn')) {
    return EMPTY_SZSE;
  }
  if (request.url.includes('bse.cn')) {
    return EMPTY_BSE;
  }
  return JSON.stringify({ jbzl: [] });
};

interface KlineRequest {
  symbol: string;
  adjust: '' | 'qfq' | 'hfq';
  startDate?: string;
  endDate?: string;
}

interface FakeSdk {
  sdk: MarketSdkLike;
  requests: KlineRequest[];
  releaseAll: () => void;
}

/** yyyymmdd → yyyy-mm-dd */
function toIso(value: string | undefined, fallback: string): string {
  if (!value || value.length !== 8) {
    return fallback;
  }
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

/** 构造一组日线（按复权类型给不同价格） */
function klinesFor(symbol: string, adjust: '' | 'qfq' | 'hfq', startDate?: string, endDate?: string): MarketKlineItem[] {
  void symbol;
  const start = toIso(startDate, '1990-01-01');
  const end = toIso(endDate, '2999-12-31');
  // 无除权事件的数据：复权价 = 原始价 × 常数，因子在整个区间恒定
  const ratio = adjust === '' ? 1 : adjust === 'qfq' ? 0.5 : 2;
  return CALENDAR.filter(date => date >= start && date <= end).map((date, index) => {
    const price = Number(((10 + index) * ratio).toFixed(2));
    return {
      date,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 100,
      amount: 1000,
      amplitude: 2,
      changePercent: 1,
      change: 0.1,
      turnoverRate: 1,
    };
  });
}

function makeSdk(options: {
  codes?: string[];
  failAllKlines?: boolean;
  blockKlines?: boolean;
  names?: Record<string, string>;
} = {}): FakeSdk {
  const requests: KlineRequest[] = [];
  const releases: Array<() => void> = [];

  const sdk: MarketSdkLike = {
    async getHistoryKline(symbol, request) {
      requests.push({ symbol, adjust: request.adjust, startDate: request.startDate, endDate: request.endDate });
      if (options.failAllKlines) {
        throw new Error('模拟网络错误');
      }
      if (options.blockKlines) {
        await new Promise<void>(resolve => {
          releases.push(resolve);
        });
      }
      return klinesFor(symbol, request.adjust, request.startDate, request.endDate);
    },
    async getAShareCodeList() {
      return options.codes ?? ['600519', '000001'];
    },
    async getTradingCalendar() {
      return CALENDAR;
    },
    async getAllQuotesByCodes(codes) {
      return codes.map(code => ({ code, name: options.names?.[code] ?? code }));
    },
    async search() {
      return [];
    },
  };

  return {
    sdk,
    requests,
    releaseAll: () => {
      while (releases.length > 0) {
        releases.pop()?.();
      }
    },
  };
}

/**
 * 自定义价格序列的 SDK：用于构造区间内发生除权除息的场景
 * @param rawCloses 日期 → 不复权收盘价
 * @param hfqRatio 日期 → 后复权倍率（倍率变化即代表除权除息）
 * @param qfqRatio 日期 → 前复权倍率（以最新价为基准，事件后全部历史会被重标定）
 */
function makeCustomSdk(options: {
  rawCloses: Record<string, number>;
  hfqRatio: (date: string) => number;
  qfqRatio: (date: string) => number;
}): FakeSdk {
  const requests: KlineRequest[] = [];
  const sdk: MarketSdkLike = {
    async getHistoryKline(symbol, request) {
      requests.push({
        symbol,
        adjust: request.adjust,
        startDate: request.startDate,
        endDate: request.endDate,
      });
      const start = toIso(request.startDate, '1990-01-01');
      const end = toIso(request.endDate, '2999-12-31');
      return Object.entries(options.rawCloses)
        .filter(([date]) => date >= start && date <= end)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, rawClose]) => {
          const ratio =
            request.adjust === ''
              ? 1
              : request.adjust === 'qfq'
                ? options.qfqRatio(date)
                : options.hfqRatio(date);
          const price = Number((rawClose * ratio).toFixed(2));
          return {
            date,
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 100,
            amount: 1000,
            amplitude: 2,
            changePercent: 1,
            change: 0.1,
            turnoverRate: 1,
          };
        });
    },
    async getAShareCodeList() {
      return ['600519'];
    },
    async getTradingCalendar() {
      return CALENDAR;
    },
    async getAllQuotesByCodes(codes) {
      return codes.map(code => ({ code, name: '贵州茅台' }));
    },
    async search() {
      return [];
    },
  };
  return { sdk, requests, releaseAll: () => undefined };
}

/** 等待条件成立（真实时间轮询，避免与服务内部假时钟耦合） */
async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('waitFor 超时');
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** 构造已具备在市证券与日线任务的最小库 */
function seedIncrementalDb(lastSuccess: Record<string, string> = {}): void {
  const securities: MarketSecurityInput[] = [
    {
      code: '600519',
      exchange: 'SH',
      name: '贵州茅台',
      listDate: '2001-08-27',
      delistDate: null,
      isActive: true,
      codeSource: 'manual',
      fetchedAt: 1,
    },
    {
      code: '000001',
      exchange: 'SZ',
      name: '平安银行',
      listDate: '1991-04-03',
      delistDate: null,
      isActive: true,
      codeSource: 'manual',
      fetchedAt: 1,
    },
  ];
  saveSecurities(db, securities, 1);
  replaceTradingCalendar(db, CALENDAR, 'test');

  insertPendingTasks(
    db,
    securities.flatMap(security =>
      (['raw_daily', 'qfq_daily', 'hfq_daily'] as const).map(dataKind => ({
        stockCode: security.code,
        dataKind,
      }))
    ),
    1
  );

  for (const [code, date] of Object.entries(lastSuccess)) {
    for (const kind of ['raw_daily', 'qfq_daily', 'hfq_daily'] as const) {
      markTaskSuccess(db, buildTaskKey(code, kind), date, 1);
    }
  }
}

/** 已回填到 2026-11-19、区间为 11-20 起的因子增量场景 */
const SEED_RAW_CLOSES: Record<string, number> = {
  '2026-11-17': 10,
  '2026-11-18': 10.02,
  '2026-11-19': 10.05,
};
const NEW_RAW_CLOSES: Record<string, number> = {
  '2026-11-20': 10.1,
  '2026-11-23': 11,
  '2026-11-24': 11.2,
};

function seedFactorIncrementalDb(): void {
  saveSecurities(
    db,
    [
      {
        code: '600519',
        exchange: 'SH',
        name: '贵州茅台',
        listDate: '2001-08-27',
        delistDate: null,
        isActive: true,
        codeSource: 'manual',
        fetchedAt: 1,
      },
    ],
    1
  );
  replaceTradingCalendar(db, CALENDAR, 'test');
  upsertDailyRaw(
    db,
    '600519',
    Object.entries(SEED_RAW_CLOSES).map(([tradeDate, close]) => ({
      tradeDate,
      open: close,
      high: close,
      low: close,
      close,
      volume: 100,
      amount: 1000,
      turnoverRate: 1,
    })),
    'test'
  );
  replaceAdjustFactors(
    db,
    '600519',
    Object.keys(SEED_RAW_CLOSES).map(tradeDate => ({ tradeDate, qfqFactor: 0.5, hfqFactor: 2 }))
  );

  const kinds = ['raw_daily', 'qfq_daily', 'hfq_daily'] as const;
  insertPendingTasks(db, kinds.map(kind => ({ stockCode: '600519', dataKind: kind })), 1);
  for (const kind of kinds) {
    markTaskSuccess(db, buildTaskKey('600519', kind), '2026-11-19', 1);
  }
}

describe('失败原因展开', () => {
  it('展开 fetch failed 的 cause 链与错误码', () => {
    const cause = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
      syscall: 'read',
    });
    const failure = new Error('fetch failed') as Error & { cause?: unknown };
    failure.cause = cause;

    const text = describeSyncError(failure);
    expect(text).toContain('fetch failed');
    expect(text).toContain('ECONNRESET');
    expect(text).toContain('cause:');
  });

  it('HTTP 错误保留状态码，非 Error 值也能展示', () => {
    const httpError = Object.assign(new Error('Bad Gateway'), { status: 502 });
    expect(describeSyncError(httpError)).toContain('HTTP 502');
    expect(describeSyncError('字符串错误')).toBe('字符串错误');
  });

  it('网络异常时 HTTP 适配器补上 URL 与底层原因', async () => {
    const originalFetch = globalThis.fetch;
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const failure = new Error('fetch failed') as Error & { cause?: unknown };
    failure.cause = cause;
    globalThis.fetch = (async () => {
      throw failure;
    }) as unknown as typeof fetch;

    try {
      const fetchText = createDefaultFetchText(1000);
      let caught: unknown = null;
      try {
        await fetchText({ url: 'https://example.test/kline' });
      } catch (error) {
        caught = error;
      }
      const text = describeSyncError(caught);
      expect(text).toContain('https://example.test/kline');
      expect(text).toContain('ENOTFOUND');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('除权除息判定', () => {
  it('无事件时相邻点不判定为跳变（含两位小数舍入噪声）', () => {
    expect(
      isHfqFactorJump(
        { tradeDate: '2026-11-17', rawClose: 10, hfqFactor: 2 },
        { tradeDate: '2026-11-18', rawClose: 10.02, hfqFactor: 20.04 / 10.02 }
      )
    ).toBe(false);

    // 低价股：两位小数舍入噪声可达 1.5%，阈值应随价格放大
    expect(
      isHfqFactorJump(
        { tradeDate: '2026-11-17', rawClose: 2, hfqFactor: 0.5 },
        { tradeDate: '2026-11-18', rawClose: 2.01, hfqFactor: 0.99 / 2.01 }
      )
    ).toBe(false);
  });

  it('分红送转使后复权因子跳变时判定为事件', () => {
    expect(
      isHfqFactorJump(
        { tradeDate: '2026-11-20', rawClose: 10.1, hfqFactor: 2 },
        { tradeDate: '2026-11-23', rawClose: 11, hfqFactor: 2.1 }
      )
    ).toBe(true);
  });

  it('区间中段的跳变也能被扫描出来', () => {
    expect(
      detectCorporateAction([
        { tradeDate: '2026-11-19', rawClose: 10.05, hfqFactor: 2 },
        { tradeDate: '2026-11-20', rawClose: 10.1, hfqFactor: 2 },
        { tradeDate: '2026-11-23', rawClose: 11, hfqFactor: 2.1 },
      ])
    ).toBe(true);
    expect(
      detectCorporateAction([
        { tradeDate: '2026-11-19', rawClose: 10.05, hfqFactor: 2 },
        { tradeDate: '2026-11-20', rawClose: 10.1, hfqFactor: 2 },
      ])
    ).toBe(false);
  });
});

describe('同步策略原语', () => {
  it('并发默认 10、最大 15，超出上限收敛到 15', () => {
    expect(clampConcurrency(undefined)).toBe(10);
    expect(clampConcurrency(0)).toBe(10);
    expect(clampConcurrency(4)).toBe(4);
    expect(clampConcurrency(10)).toBe(10);
    expect(clampConcurrency(100)).toBe(15);
  });

  it('RPS 默认 3、最大 20，超出上限收敛到 20', () => {
    expect(clampRequestsPerSecond(undefined)).toBe(3);
    expect(clampRequestsPerSecond(10)).toBe(10);
    expect(clampRequestsPerSecond(100)).toBe(20);
  });

  it('RPS 换算为最小间隔：默认 3 req/s 对应 333ms', () => {
    expect(intervalMsForRps(undefined)).toBe(333);
    expect(intervalMsForRps(4)).toBe(250);
    expect(intervalMsForRps(100)).toBe(50);
  });

  it('工作池实际并发不超过配置上限', async () => {
    for (const limit of [5, 10, 15]) {
      let inFlight = 0;
      let maxInFlight = 0;
      let issued = 0;
      const total = 12;

      await runWorkerPool<number>({
        concurrency: limit,
        claim: () => (issued < total ? issued++ : null),
        run: async () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise(resolve => setTimeout(resolve, 1));
          inFlight -= 1;
        },
      });

      expect(maxInFlight).toBeLessThanOrEqual(limit);
      expect(issued).toBe(total);
    }
  });

  it('1 秒滑动窗口：快速响应场景下任意 1 秒窗口不超过 3 次请求', async () => {
    let fakeClock = 0;
    const limiter = createSlidingWindowRateLimiter({
      maxPerSecond: 3,
      now: () => fakeClock,
      sleep: async ms => {
        fakeClock += ms;
      },
    });

    const issuedAt: number[] = [];
    for (let index = 0; index < 10; index += 1) {
      await limiter.acquire();
      issuedAt.push(fakeClock);
    }

    for (let index = 0; index < issuedAt.length; index += 1) {
      const windowEnd = issuedAt[index];
      const inWindow = issuedAt.filter(time => time > windowEnd - 1000 && time <= windowEnd);
      expect(inWindow.length).toBeLessThanOrEqual(3);
    }
    expect(issuedAt[3] - issuedAt[0]).toBeGreaterThanOrEqual(1000);
  });

  it('匀速限流器：相邻请求至少间隔 333ms', async () => {
    let fakeClock = 0;
    const limiter = createPacedRateLimiter({
      intervalMs: 333,
      now: () => fakeClock,
      sleep: async ms => {
        fakeClock += ms;
      },
    });

    const issuedAt: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      await limiter.acquire();
      issuedAt.push(fakeClock);
    }

    expect(issuedAt).toEqual([0, 333, 666, 999]);
  });

  it('匀速限流器：并发 acquire 仍按 333ms 间隔放行', async () => {
    let fakeClock = 0;
    interface Waiter {
      at: number;
      resolve: () => void;
    }
    let waiters: Waiter[] = [];
    const limiter = createPacedRateLimiter({
      intervalMs: 333,
      now: () => fakeClock,
      sleep: ms =>
        new Promise<void>(resolve => {
          waiters.push({ at: fakeClock + ms, resolve });
        }),
    });

    const issuedAt: number[] = [];
    const tasks = Array.from({ length: 4 }, async () => {
      await limiter.acquire();
      issuedAt.push(fakeClock);
    });

    for (let guard = 0; guard < 20 && issuedAt.length < 4; guard += 1) {
      if (waiters.length === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
        continue;
      }
      const due = Math.min(...waiters.map(waiter => waiter.at));
      fakeClock = Math.max(fakeClock, due);
      const batch = waiters.filter(waiter => waiter.at === due);
      waiters = waiters.filter(waiter => waiter.at !== due);
      batch.forEach(waiter => waiter.resolve());
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await Promise.all(tasks);

    expect(issuedAt).toEqual([0, 333, 666, 999]);
  });

  it('指数退避 1s / 2s / 4s，上限 60s，附加 0～500ms 抖动', () => {
    expect(computeBackoffDelay(1, () => 0)).toBe(1000);
    expect(computeBackoffDelay(2, () => 0)).toBe(2000);
    expect(computeBackoffDelay(3, () => 0)).toBe(4000);
    expect(computeBackoffDelay(6, () => 0)).toBe(32000);
    expect(computeBackoffDelay(10, () => 0)).toBe(60000);
    // 抖动为 0～500ms：random()=0.999 时取满 500ms
    expect(computeBackoffDelay(1, () => 0.999)).toBe(1500);
  });

  it('Retry-After 与计算延迟取较大值', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter('not-a-date')).toBeNull();

    const nextRetryAt = computeNextRetryAt({
      retryCount: 1,
      now: 1000,
      retryAfterMs: 8000,
      random: () => 0,
    });
    expect(nextRetryAt).toBe(9000);
  });

  it('从异常中读取 Retry-After', () => {
    expect(extractRetryAfterMs({ retryAfterMs: 1500 })).toBe(1500);
    expect(extractRetryAfterMs({ headers: { 'retry-after': '2' } })).toBe(2000);
    expect(extractRetryAfterMs(new Error('普通错误'))).toBeNull();
  });
});

describe('全量回填', () => {
  it('首次启动先同步证券池/日历，再幂等生成任务并完成回填', async () => {
    const fake = makeSdk({ names: { '600519': '贵州茅台', '000001': '平安银行' } });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const result = await service.start();
    expect(result.success).toBe(true);
    expect(getMarketMeta('sync_mode', db)).toBe('full');

    await waitFor(() => !service?.isRunning());

    const status = service.getStatus();
    expect(status.state).toBe('completed');
    expect(status.total).toBe(9); // 3 个市场级任务 + 2 只证券 × 3
    expect(status.success).toBe(9);
    expect(status.failed).toBe(0);

    // 原始日线：2 只证券 × 6 个交易日
    expect(readDailyRaw(db, '600519')).toHaveLength(CALENDAR.length);
    expect(readDailyRaw(db, '000001')).toHaveLength(CALENDAR.length);

    // 因子由真实 raw/qfq/hfq 收盘价推导
    const factor = queryMarketRows(
      "SELECT qfq_factor, hfq_factor FROM adjust_factors WHERE stock_code = '600519' AND trade_date = '2026-11-17'",
      [],
      db
    );
    expect(Number(factor[0][0])).toBeCloseTo(0.5);
    expect(Number(factor[0][1])).toBeCloseTo(2);

    // 周/月派生缓存
    expect(
      Number(
        queryMarketValue<number>(
          "SELECT COUNT(*) FROM kline_weekly_raw WHERE stock_code = '600519'",
          [],
          db
        )
      )
    ).toBe(2);
    expect(
      Number(
        queryMarketValue<number>(
          "SELECT COUNT(*) FROM kline_monthly_raw WHERE stock_code = '600519'",
          [],
          db
        )
      )
    ).toBe(1);

    // 每只证券只下载三类日线，各一次
    expect(fake.requests).toHaveLength(6);

    // 重复点击开始：不重复生成任务，也不重复下载
    await service.start();
    await waitFor(() => !service?.isRunning());
    expect(countTasks(db).total).toBe(9);
    expect(fake.requests).toHaveLength(6);
  });

  it('任务键幂等：重复生成不新增行', () => {
    const tasks = [
      { stockCode: '600519' as string | null, dataKind: 'raw_daily' as const },
      { stockCode: null, dataKind: 'calendar' as const },
    ];
    expect(insertPendingTasks(db, tasks, 1)).toBe(2);
    expect(insertPendingTasks(db, tasks, 2)).toBe(0);

    expect(getTask(db, buildTaskKey('600519', 'raw_daily'))?.taskKey).toBe('600519:raw_daily');
    expect(getTask(db, buildTaskKey(null, 'calendar'))?.taskKey).toBe('__MARKET__:calendar');
  });

  it('连续失败 3 次自动重试后置为 failed 且不再排期', async () => {
    const fake = makeSdk({ codes: ['600519'], failAllKlines: true });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    await service.start();
    await waitFor(() => !service?.isRunning());

    const task = getTask(db, buildTaskKey('600519', 'raw_daily'));
    expect(task?.status).toBe('failed');
    expect(task?.retryCount).toBe(3);
    expect(task?.nextRetryAt).toBeNull();
    // 三类任务各「初始请求 + 3 次自动重试」，共 3 × 4 次
    expect(fake.requests).toHaveLength(12);

    expect(service.getStatus().state).toBe('failed');
    expect(service.getStatus().failedTasks.length).toBe(3);
  });

  it('重试失败只重置 failed 任务，success 任务与已写入数据保持不变', () => {
    seedIncrementalDb({ '600519': '2026-11-20', '000001': '2026-11-20' });
    upsertDailyRaw(
      db,
      '600519',
      [
        {
          tradeDate: '2026-11-17',
          open: 10,
          high: 11,
          low: 9,
          close: 10,
          volume: 1,
          amount: 1,
          turnoverRate: 1,
        },
      ],
      'test'
    );
    markTaskRetry(
      db,
      buildTaskKey('600519', 'qfq_daily'),
      { retryCount: 3, nextRetryAt: null, error: '模拟失败' },
      2
    );

    const reset = resetFailedTasks(db, clock);
    expect(reset).toBe(1);

    expect(getTask(db, buildTaskKey('600519', 'raw_daily'))?.status).toBe('success');
    expect(getTask(db, buildTaskKey('600519', 'hfq_daily'))?.status).toBe('success');
    expect(getTask(db, buildTaskKey('600519', 'qfq_daily'))?.status).toBe('pending');
    expect(readDailyRaw(db, '600519')).toHaveLength(1);
  });

  it('断点恢复：running 回退 pending、控制状态 idle、不自动继续', async () => {
    seedIncrementalDb({ '600519': '2026-11-20', '000001': '2026-11-20' });
    // 已有因子时不再补拉复权日线，便于断言只执行未完成任务
    replaceAdjustFactors(db, '600519', [{ tradeDate: '2026-11-17', qfqFactor: 0.5, hfqFactor: 2 }]);
    // 模拟上次进程退出时仍在运行的任务
    executeMarket(
      "UPDATE sync_state SET status = 'running' WHERE task_key = ?",
      [buildTaskKey('600519', 'hfq_daily')],
      db
    );
    executeMarket("UPDATE sync_state SET status = 'running' WHERE task_key = ?", [
      buildTaskKey('600519', 'raw_daily'),
    ], db);
    const fake = makeSdk({ codes: ['600519', '000001'] });

    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });
    service.recover();

    expect(getTask(db, buildTaskKey('600519', 'hfq_daily'))?.status).toBe('pending');
    expect(getTask(db, buildTaskKey('600519', 'raw_daily'))?.status).toBe('pending');
    expect(getMarketMeta('sync_control_state', db)).toBe('idle');
    expect(service.isRunning()).toBe(false);
    expect(fake.requests).toHaveLength(0);

    // 用户点击继续后只执行未完成任务
    await service.start();
    await waitFor(() => !service?.isRunning());
    expect(fake.requests).toHaveLength(2);
  });

  it('全量运行中拒绝增量更新', async () => {
    const fake = makeSdk({ blockKlines: true });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    await service.start();
    await waitFor(() => fake.requests.length > 0);

    const result = await service.incremental();
    expect(result.success).toBe(false);
    expect(result.error).toContain('全量回填尚未完成');

    service.stop();
    fake.releaseAll();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
});

describe('手动增量补跑', () => {
  it('从各任务 last_success_date 的下一交易日补到最新交易日', async () => {
    seedIncrementalDb({ '600519': '2026-11-17', '000001': '2026-11-20' });
    const fake = makeSdk({ codes: ['600519', '000001'] });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const before = service.getStatus();
    expect(before.latestTradeDate).toBe('2026-11-24');
    expect(before.earliestMissingDate).toBe('2026-11-18');
    expect(before.incrementalTaskCount).toBe(6);

    const result = await service.incremental();
    expect(result.success).toBe(true);

    await waitFor(() => !service?.isRunning());

    const starts = new Map<string, string | undefined>();
    for (const request of fake.requests) {
      starts.set(request.symbol + request.adjust, request.startDate);
    }
    // 600519：11-17 的下一交易日 11-18；000001：11-20 的下一交易日 11-23
    expect(starts.get('sh600519')).toBe('20261118');
    expect(starts.get('sh600519qfq')).toBe('20261118');
    expect(starts.get('sz000001')).toBe('20261123');
    expect(starts.get('sz000001hfq')).toBe('20261123');
    for (const request of fake.requests) {
      expect(request.endDate).toBe('20261124');
    }
  });

  it('增量区间内发生除权除息时补拉全历史 qfq 并重标定因子', async () => {
    seedFactorIncrementalDb();
    const fake = makeCustomSdk({
      rawCloses: { ...SEED_RAW_CLOSES, ...NEW_RAW_CLOSES },
      hfqRatio: date => (date >= '2026-11-23' ? 2.1 : 2),
      // 事件后前复权以最新价为基准：全部历史被重标定为 2/2.1
      qfqRatio: date => (date >= '2026-11-23' ? 1 : 2 / 2.1),
    });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const result = await service.incremental();
    expect(result.success).toBe(true);
    await waitFor(() => !service?.isRunning());

    // 额外发起一次全历史 qfq 请求
    expect(
      fake.requests.some(request => request.adjust === 'qfq' && request.startDate === '19900101')
    ).toBe(true);

    const qfq = readAdjustFactors(db, '600519', 'qfq');
    const hfq = readAdjustFactors(db, '600519', 'hfq');
    expect(qfq.size).toBe(6);
    // 历史前复权因子整体重标定
    expect(qfq.get('2026-11-17')).toBeCloseTo(2 / 2.1, 2);
    expect(qfq.get('2026-11-19')).toBeCloseTo(2 / 2.1, 2);
    // 事件后的新日期按新基准
    expect(qfq.get('2026-11-24')).toBeCloseTo(1, 2);
    // 后复权历史因子保持稳定，仅追加新值
    expect(hfq.get('2026-11-19')).toBeCloseTo(2, 2);
    expect(hfq.get('2026-11-24')).toBeCloseTo(2.1, 2);
  });

  it('增量区间无除权除息时只局部写入，历史因子不变', async () => {
    seedFactorIncrementalDb();
    const fake = makeCustomSdk({
      rawCloses: { ...SEED_RAW_CLOSES, ...NEW_RAW_CLOSES },
      hfqRatio: () => 2,
      qfqRatio: () => 0.5,
    });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const result = await service.incremental();
    expect(result.success).toBe(true);
    await waitFor(() => !service?.isRunning());

    // 三类日线各一次，无全历史补拉
    expect(fake.requests).toHaveLength(3);
    expect(fake.requests.some(request => request.startDate === '19900101')).toBe(false);

    const qfq = readAdjustFactors(db, '600519', 'qfq');
    expect(qfq.size).toBe(6);
    expect(qfq.get('2026-11-17')).toBeCloseTo(0.5, 2);
    expect(qfq.get('2026-11-24')).toBeCloseTo(0.5, 2);
    expect(readAdjustFactors(db, '600519', 'hfq').get('2026-11-24')).toBeCloseTo(2, 2);
  });

  it('已追平最新交易日时不生成任务', async () => {
    seedIncrementalDb({ '600519': '2026-11-24', '000001': '2026-11-24' });
    const fake = makeSdk();
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    expect(service.getStatus().incrementalTaskCount).toBe(0);
    const result = await service.incremental();
    expect(result.success).toBe(true);
    expect(fake.requests).toHaveLength(0);
    expect(service.isRunning()).toBe(false);
  });

  it('新增证券缺少任务时拒绝增量，继续全量回填会补建任务', async () => {
    seedIncrementalDb({ '600519': '2026-11-24', '000001': '2026-11-24' });
    saveSecurities(
      db,
      [
        {
          code: '300750',
          exchange: 'SZ',
          name: '宁德时代',
          listDate: '2018-06-11',
          delistDate: null,
          isActive: true,
          codeSource: 'manual',
          fetchedAt: 2,
        },
      ],
      2
    );

    const fake = makeSdk({ codes: ['600519', '000001'] });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const rejected = await service.incremental();
    expect(rejected.success).toBe(false);
    expect(rejected.error).toContain('尚未生成日线任务');

    await service.start();
    await waitFor(() => !service?.isRunning());

    expect(getTask(db, buildTaskKey('300750', 'raw_daily'))?.status).toBe('success');
    expect(fake.requests.filter(request => request.symbol === 'sz300750')).toHaveLength(3);
  });

  it('存在未完成全量任务时拒绝增量', async () => {
    seedIncrementalDb({ '000001': '2026-11-24' });
    const fake = makeSdk();
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const result = await service.incremental();
    expect(result.success).toBe(false);
    expect(result.error).toContain('全量回填');
    expect(fake.requests).toHaveLength(0);
  });

  it('增量运行中拒绝全量回填', async () => {
    seedIncrementalDb({ '600519': '2026-11-17', '000001': '2026-11-17' });
    const fake = makeSdk({ blockKlines: true });
    service = createMarketSyncService({ db, sdk: fake.sdk, fetchText, now, sleep });

    const started = await service.incremental();
    expect(started.success).toBe(true);
    await waitFor(() => fake.requests.length > 0);

    const result = await service.start();
    expect(result.success).toBe(false);
    expect(result.error).toContain('增量更新正在进行中');

    service.stop();
    fake.releaseAll();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
});

describe('日线转换', () => {
  it('过滤区间外数据、按日期去重并保留源口径字段', () => {
    const bars = toDailyBars(
      [
        {
          date: '2026-11-16',
          open: 1,
          high: 1,
          low: 1,
          close: 1,
          volume: 1,
          amount: 1,
          amplitude: 1,
          changePercent: 1,
          change: 1,
          turnoverRate: 1,
        },
        {
          date: '2026-11-17',
          open: 2,
          high: 3,
          low: 1,
          close: 2,
          volume: 1,
          amount: 1,
          amplitude: 5,
          changePercent: 2,
          change: 0.2,
          turnoverRate: 3,
        },
      ],
      '2026-11-17',
      '2026-11-24'
    );

    expect(bars).toHaveLength(1);
    expect(bars[0].tradeDate).toBe('2026-11-17');
    expect(bars[0].amplitude).toBe(5);
    expect(bars[0].changePercent).toBe(2);
    expect(bars[0].changeAmount).toBe(0.2);
  });
});

describe('日历读取', () => {
  it('行情库日历按升序返回', () => {
    replaceTradingCalendar(db, ['2026-11-24', '2026-11-17'], 'test');
    expect(listTradingCalendar(db)).toEqual(['2026-11-17', '2026-11-24']);
  });

  it('因子全量替换后可用', () => {
    replaceAdjustFactors(db, '600519', [
      { tradeDate: '2026-11-17', qfqFactor: 1, hfqFactor: 1 },
      { tradeDate: '2026-11-18', qfqFactor: 1, hfqFactor: 1 },
    ]);
    expect(
      Number(
        queryMarketValue<number>("SELECT COUNT(*) FROM adjust_factors WHERE stock_code = '600519'", [], db)
      )
    ).toBe(2);
  });
});
