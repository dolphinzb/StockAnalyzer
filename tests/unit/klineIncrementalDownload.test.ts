import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 交易日历数据源可切换：成功返回指定日历 / 抛错模拟接口失败
const sdkState = vi.hoisted(() => ({
  calendar: [] as string[],
  fail: false,
}));

// 库内最新交易日查询可切换：返回指定映射 / 抛错模拟查询失败
const dbState = vi.hoisted(() => ({
  latest: new Map<string, { unadjusted: string | null; adjusted: string | null }>(),
  fail: false,
  watchlist: [] as { stockCode: string; stockName: string }[],
}));

// 记录自动下载实际写入的周期与复权类型，用于验证「按周期分层执行」
const savedCalls = vi.hoisted(() => [] as { period: string; adjust: string }[]);

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
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

vi.mock('stock-sdk', () => ({
  StockSDK: class {
    async getHistoryKline() {
      return [];
    }

    async getTradingCalendar() {
      if (sdkState.fail) {
        throw new Error('交易日历接口不可用');
      }
      return sdkState.calendar;
    }
  },
}));

vi.mock('../../electron/database', () => ({
  getWatchlist: () => dbState.watchlist,
  saveKlineData: (_code: string, _klines: unknown[], adjust: string, period: string) => {
    savedCalls.push({ period, adjust });
    return 0;
  },
  getChartData: () => [],
  getLatestTradeDates: () => {
    if (dbState.fail) {
      throw new Error('查询失败');
    }
    return new Map(dbState.latest);
  },
}));

import {
  EARLIEST_START_DATE,
  MIN_LEAD_MS,
  collectPendingStocks,
  computeIncrementalStartDate,
  computeNextScheduleTarget,
  getLastTradingDay,
  isPastDailyScheduleTime,
  isPeriodComplete,
  localDateYmd,
  performAutoDownload
} from '../../electron/services/klineDownloadService';

/**
 * 冻结系统时间（本地时区），用于验证「今天」的本地口径与调度计算
 */
function freezeTo(year: number, monthIndex: number, day: number, hour = 10, minute = 0): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(year, monthIndex, day, hour, minute, 0, 0));
}

/**
 * 断言目标时刻（本地时间）
 */
function expectLocal(date: Date, year: number, monthIndex: number, day: number, hour: number, minute: number): void {
  expect(date.getFullYear()).toBe(year);
  expect(date.getMonth()).toBe(monthIndex);
  expect(date.getDate()).toBe(day);
  expect(date.getHours()).toBe(hour);
  expect(date.getMinutes()).toBe(minute);
}

beforeEach(() => {
  sdkState.calendar = [];
  sdkState.fail = false;
  dbState.latest = new Map();
  dbState.fail = false;
  dbState.watchlist = [];
  savedCalls.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeIncrementalStartDate（起点计算）', () => {
  it('两种复权均有数据时取更早的一天', () => {
    expect(computeIncrementalStartDate({ unadjusted: '20261110', adjusted: '20261112' }, '20261117'))
      .toBe('20261110');
  });

  it('一种复权落后于另一种时取落后的一方', () => {
    expect(computeIncrementalStartDate({ unadjusted: '20261114', adjusted: '20261020' }, '20261117'))
      .toBe('20261020');
  });

  it('单边缺失时取存在的一方', () => {
    expect(computeIncrementalStartDate({ unadjusted: null, adjusted: '20261020' }, '20261117'))
      .toBe('20261020');
  });

  it('两种复权均无数据时回退 19900101', () => {
    expect(EARLIEST_START_DATE).toBe('19900101');
    expect(computeIncrementalStartDate({ unadjusted: null, adjusted: null }, '20261117'))
      .toBe('19900101');
  });

  it('股票在映射中不存在时同样回退 19900101', () => {
    expect(computeIncrementalStartDate(undefined, '20261117')).toBe('19900101');
  });

  it('库内最新日晚于终点时钳制为终点', () => {
    expect(computeIncrementalStartDate({ unadjusted: '20270105', adjusted: '20270105' }, '20261117'))
      .toBe('20261117');
  });

  it('库内最新日格式异常时降级为终点（不误拉全量）', () => {
    expect(computeIncrementalStartDate({ unadjusted: '2026-11-10', adjusted: null }, '20261117'))
      .toBe('20261117');
  });

  it('库内最新日等于终点时起点等于终点（包含该日，不 +1）', () => {
    expect(computeIncrementalStartDate({ unadjusted: '20261117', adjusted: '20261117' }, '20261117'))
      .toBe('20261117');
  });
});

describe('isPeriodComplete（周期完成判定）', () => {
  it('两种复权最新日均等于终点时判定完成', () => {
    expect(isPeriodComplete({ unadjusted: '20261119', adjusted: '20261119' }, '20261119')).toBe(true);
  });

  it('晚于终点（库内脏数据）也判定完成', () => {
    expect(isPeriodComplete({ unadjusted: '20270105', adjusted: '20270105' }, '20261119')).toBe(true);
  });

  it('任一复权缺失时判定未完成', () => {
    expect(isPeriodComplete({ unadjusted: '20261119', adjusted: null }, '20261119')).toBe(false);
    expect(isPeriodComplete({ unadjusted: null, adjusted: '20261119' }, '20261119')).toBe(false);
  });

  it('任一复权落后时判定未完成', () => {
    expect(isPeriodComplete({ unadjusted: '20261119', adjusted: '20261118' }, '20261119')).toBe(false);
  });

  it('无记录时判定未完成', () => {
    expect(isPeriodComplete(undefined, '20261119')).toBe(false);
  });
});

describe('collectPendingStocks（只挑未完成的股票）', () => {
  it('已完成的股票被跳过，未完成的按各自起点收集', () => {
    dbState.latest = new Map([
      ['000001', { unadjusted: '20261119', adjusted: '20261119' }],
      ['600519', { unadjusted: '20261118', adjusted: '20261118' }],
      ['510050', { unadjusted: null, adjusted: null }],
    ]);

    const stocks = [
      { stockCode: '000001', stockName: '平安银行' },
      { stockCode: '600519', stockName: '贵州茅台' },
      { stockCode: '510050', stockName: '上证50ETF' },
    ];
    const result = collectPendingStocks(stocks, 'd', '20261119');

    expect(result.completedCount).toBe(1);
    expect(result.pending.map(stock => stock.stockCode)).toEqual(['600519', '510050']);
    expect(result.pending.map(stock => stock.startDate)).toEqual(['20261118', '19900101']);
    // 不修改入参
    expect(stocks.every(stock => !('startDate' in stock))).toBe(true);
  });

  it('全部已完成时返回空清单', () => {
    dbState.latest = new Map([['000001', { unadjusted: '20261119', adjusted: '20261119' }]]);

    const result = collectPendingStocks([{ stockCode: '000001', stockName: '平安银行' }], 'w', '20261119');

    expect(result.pending).toEqual([]);
    expect(result.completedCount).toBe(1);
  });

  it('查询异常时整批按待补处理且只下载最近交易日', () => {
    dbState.fail = true;

    const result = collectPendingStocks(
      [
        { stockCode: '000001', stockName: '平安银行' },
        { stockCode: '600519', stockName: '贵州茅台' },
      ],
      'w',
      '20261119'
    );

    expect(result.completedCount).toBe(0);
    expect(result.pending.map(stock => stock.startDate)).toEqual(['20261119', '20261119']);
  });
});

describe('isPastDailyScheduleTime（启动补跑触发时刻）', () => {
  it('计划时刻之前不触发', () => {
    expect(isPastDailyScheduleTime(new Date(2026, 10, 19, 15, 9, 59))).toBe(false);
    expect(isPastDailyScheduleTime(new Date(2026, 10, 19, 9, 30, 0))).toBe(false);
  });

  it('计划时刻当下及之后触发', () => {
    expect(isPastDailyScheduleTime(new Date(2026, 10, 19, 15, 10, 0))).toBe(true);
    expect(isPastDailyScheduleTime(new Date(2026, 10, 19, 16, 0, 0))).toBe(true);
  });
});

describe('getLastTradingDay（最近交易日）', () => {
  it('今天为交易日时返回今天', async () => {
    freezeTo(2026, 10, 17);
    sdkState.calendar = ['2026-11-16', '2026-11-17', '2026-11-18'];

    await expect(getLastTradingDay()).resolves.toBe('20261117');
  });

  it('今天为法定假期时返回假期前最后一个交易日', async () => {
    freezeTo(2026, 9, 5);
    sdkState.calendar = ['2026-09-29', '2026-09-30', '2026-10-09', '2026-10-12'];

    await expect(getLastTradingDay()).resolves.toBe('20260930');
  });

  it('今天为周末时返回周五', async () => {
    freezeTo(2026, 10, 21);
    sdkState.calendar = ['2026-11-19', '2026-11-20', '2026-11-23'];

    await expect(getLastTradingDay()).resolves.toBe('20261120');
  });

  it('日历文件过期时回退为排除周末规则并记录 warn', async () => {
    freezeTo(2027, 0, 4);
    sdkState.calendar = ['2026-12-30', '2026-12-31'];

    await expect(getLastTradingDay()).resolves.toBe('20270104');
  });

  it('交易日历接口失败时回退为排除周末规则', async () => {
    freezeTo(2026, 10, 18);
    sdkState.fail = true;

    await expect(getLastTradingDay()).resolves.toBe('20261118');
  });

  it('日历为空时回退为排除周末规则', async () => {
    freezeTo(2026, 10, 14);
    sdkState.calendar = [];

    await expect(getLastTradingDay()).resolves.toBe('20261113');
  });
});

describe('localDateYmd（本地时区口径）', () => {
  it('凌晨取本地日期而不是 UTC 日期', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 18, 0, 30, 0, 0));

    expect(localDateYmd()).toBe('20261118');
  });
});

describe('computeNextScheduleTarget（调度最小间隔）', () => {
  it('正常启动时目标为当天 15:10', () => {
    const target = computeNextScheduleTarget(new Date(2026, 10, 17, 9, 30, 0, 0));

    expectLocal(target, 2026, 10, 17, 15, 10);
  });

  it('提前 13 秒触发后顺延到次日', () => {
    const target = computeNextScheduleTarget(new Date(2026, 10, 17, 15, 9, 47, 0));

    expectLocal(target, 2026, 10, 18, 15, 10);
  });

  it('临近计划时刻启动（15:09）当天不执行', () => {
    const target = computeNextScheduleTarget(new Date(2026, 10, 17, 15, 9, 0, 0));

    expectLocal(target, 2026, 10, 18, 15, 10);
  });

  it('距目标恰好 MIN_LEAD_MS 时视为已过并顺延', () => {
    const exact = new Date(2026, 10, 17, 15, 8, 0, 0);
    expect(MIN_LEAD_MS).toBe(2 * 60 * 1000);

    const target = computeNextScheduleTarget(exact);

    expectLocal(target, 2026, 10, 18, 15, 10);
  });

  it('距目标超过 MIN_LEAD_MS 时仍排当天', () => {
    const target = computeNextScheduleTarget(new Date(2026, 10, 17, 15, 7, 59, 0));

    expectLocal(target, 2026, 10, 17, 15, 10);
  });

  it('顺延落点为周末时继续顺延到下周一', () => {
    const target = computeNextScheduleTarget(new Date(2026, 10, 20, 15, 9, 0, 0));

    expectLocal(target, 2026, 10, 23, 15, 10);
  });

  it('周末白天启动时跳过周六周日', () => {
    const target = computeNextScheduleTarget(new Date(2026, 10, 21, 10, 0, 0, 0));

    expectLocal(target, 2026, 10, 23, 15, 10);
  });
});

describe('performAutoDownload（自动下载仍按周期分层执行）', () => {
  it('按 日线 → 周线 → 月线 依次下载，每个周期独立写入各自表', async () => {
    // 20:00 本地时间，确保 UTC 日期与本地日期一致（避免时区导致的交易日判断偏差）
    freezeTo(2026, 10, 17, 20, 0);
    sdkState.calendar = ['2026-11-17'];
    dbState.watchlist = [{ stockCode: '000001', stockName: '平安银行' }];

    await performAutoDownload();

    // 1 只股票 × 3 周期 × 2 复权 = 6 次写入；自动下载开启重试，
    // 本次数据源返回 0 条会触发一次周期级重试，因此每个周期各 4 次写入
    expect(savedCalls.map(call => call.period)).toEqual([
      'd', 'd', 'd', 'd',
      'w', 'w', 'w', 'w',
      'm', 'm', 'm', 'm',
    ]);
    // 周期顺序固定为 日线 → 周线 → 月线，周期内复权顺序为 不复权 → 前复权
    expect(savedCalls.slice(0, 4).map(call => call.adjust)).toEqual(['', 'qfq', '', 'qfq']);
  });
});
