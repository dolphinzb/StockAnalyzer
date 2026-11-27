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

import { openMarketDatabase, queryMarketRows, queryMarketValue, type MarketDatabase } from '../../electron/marketDatabase';
import {
  countQualityIssues,
  insertQualityIssues,
  readAdjustedPeriodKline,
  readDailyRaw,
  readDerivedPeriods,
  rebuildDerivedPeriods,
  replaceAdjustFactors,
  upsertAdjustFactors,
  upsertDailyRaw,
  type MarketDailyRawInput,
  type MarketFactorRow,
} from '../../electron/services/marketRepository';
import { aggregateAdjustedBars, aggregateBars, weekStartOf } from '../../electron/services/marketPeriod';

let db: MarketDatabase;

beforeEach(() => {
  db = openMarketDatabase(':memory:', true);
});

afterEach(() => {
  db.close();
});

/** 构造一根日线 */
function bar(
  tradeDate: string,
  close: number,
  extra: Partial<MarketDailyRawInput> = {}
): MarketDailyRawInput {
  return {
    tradeDate,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
    amount: 1000,
    turnoverRate: 1,
    amplitude: 2,
    changePercent: 1,
    changeAmount: 0.1,
    ...extra,
  };
}

describe('原始日线存储', () => {
  it('重复 UPSERT 不新增行，行情字段与 fetched_at 被更新', () => {
    upsertDailyRaw(db, '600519', [bar('2026-11-20', 10)], 'test-source', 111);
    upsertDailyRaw(db, '600519', [bar('2026-11-20', 11)], 'test-source', 222);

    const rows = readDailyRaw(db, '600519');
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBe(11);

    const fetchedAt = queryMarketValue<number>(
      "SELECT fetched_at FROM kline_daily_raw WHERE stock_code = '600519'",
      [],
      db
    );
    expect(Number(fetchedAt)).toBe(222);
  });

  it('保留数据源口径的涨跌/振幅/换手率', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-20', 10, { amplitude: 3.5, changePercent: -1.25, changeAmount: -0.13, turnoverRate: 0.8 })],
      'test-source'
    );

    const rows = readDailyRaw(db, '600519');
    expect(rows[0].amplitude).toBe(3.5);
    expect(rows[0].changePercent).toBe(-1.25);
    expect(rows[0].changeAmount).toBe(-0.13);
    expect(rows[0].turnoverRate).toBe(0.8);
  });
});

describe('复权因子存储', () => {
  it('按股票全量替换：旧因子删除、新因子写入', () => {
    replaceAdjustFactors(db, '600519', [
      { tradeDate: '2026-11-19', qfqFactor: 0.5, hfqFactor: 2 },
      { tradeDate: '2026-11-20', qfqFactor: 0.5, hfqFactor: 2 },
    ]);
    expect(
      Number(
        queryMarketValue<number>(
          "SELECT COUNT(*) FROM adjust_factors WHERE stock_code = '600519'",
          [],
          db
        )
      )
    ).toBe(2);

    replaceAdjustFactors(db, '600519', [{ tradeDate: '2026-11-20', qfqFactor: 0.4, hfqFactor: 3 }]);

    const rows = queryMarketRows(
      "SELECT trade_date, qfq_factor FROM adjust_factors WHERE stock_code = '600519' ORDER BY trade_date",
      [],
      db
    );
    expect(rows).toHaveLength(1);
    expect(String(rows[0][0])).toBe('2026-11-20');
    expect(Number(rows[0][1])).toBeCloseTo(0.4);
  });

  it('写入失败时事务回滚，不产生部分更新', () => {
    replaceAdjustFactors(db, '600519', [{ tradeDate: '2026-11-20', qfqFactor: 0.5, hfqFactor: 2 }]);

    const broken = [
      { tradeDate: '2026-11-20', qfqFactor: 0.6, hfqFactor: 2 },
      { tradeDate: '2026-11-21', qfqFactor: null as unknown as number, hfqFactor: 2 },
    ] as MarketFactorRow[];

    expect(() => replaceAdjustFactors(db, '600519', broken)).toThrow();

    const rows = queryMarketRows(
      "SELECT trade_date, qfq_factor FROM adjust_factors WHERE stock_code = '600519'",
      [],
      db
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0][1])).toBeCloseTo(0.5);
  });

  it('局部写入不影响其它日期因子（增量场景）', () => {
    replaceAdjustFactors(db, '600519', [{ tradeDate: '2026-11-19', qfqFactor: 0.5, hfqFactor: 2 }]);
    upsertAdjustFactors(db, '600519', [{ tradeDate: '2026-11-20', qfqFactor: 0.6, hfqFactor: 2 }]);

    expect(
      Number(
        queryMarketValue<number>(
          "SELECT COUNT(*) FROM adjust_factors WHERE stock_code = '600519'",
          [],
          db
        )
      )
    ).toBe(2);
  });
});

describe('周/月线派生', () => {
  const calendar = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30'];

  it('周中推进只更新一行，period_end_date 前推且 is_final 正确', () => {
    upsertDailyRaw(db, '600519', [bar('2026-11-23', 10)], 'test-source');
    rebuildDerivedPeriods(db, '600519', 'weekly', { calendar, now: 1 });

    let rows = readDerivedPeriods(db, '600519', 'weekly');
    expect(rows).toHaveLength(1);
    expect(rows[0].periodStartDate).toBe('2026-11-23');
    expect(rows[0].periodEndDate).toBe('2026-11-23');
    expect(rows[0].isFinal).toBe(false);

    upsertDailyRaw(db, '600519', [bar('2026-11-24', 12)], 'test-source');
    rebuildDerivedPeriods(db, '600519', 'weekly', { fromDate: '2026-11-24', calendar, now: 2 });

    rows = readDerivedPeriods(db, '600519', 'weekly');
    expect(rows).toHaveLength(1);
    expect(rows[0].periodEndDate).toBe('2026-11-24');
    expect(rows[0].open).toBe(10);
    expect(rows[0].close).toBe(12);
    expect(rows[0].high).toBe(13);
    expect(rows[0].volume).toBe(200);
  });

  it('周期结束后置 is_final = 1', () => {
    upsertDailyRaw(db, '600519', [bar('2026-11-23', 10), bar('2026-11-24', 12)], 'test-source');
    // 日历在周二之后直接跳到下周，说明本周已无后续交易日
    rebuildDerivedPeriods(db, '600519', 'weekly', {
      calendar: ['2026-11-23', '2026-11-24', '2026-11-30'],
      now: 3,
    });

    const rows = readDerivedPeriods(db, '600519', 'weekly');
    expect(rows).toHaveLength(1);
    expect(rows[0].isFinal).toBe(true);
  });

  it('月线按 YYYY-MM-01 聚合，且不保存复权涨跌字段', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-02', 10), bar('2026-11-30', 15), bar('2026-12-01', 20)],
      'test-source'
    );
    rebuildDerivedPeriods(db, '600519', 'monthly', { now: 4 });

    const rows = readDerivedPeriods(db, '600519', 'monthly');
    expect(rows.map(row => row.periodStartDate)).toEqual(['2026-11-01', '2026-12-01']);
    expect(rows[0].open).toBe(10);
    expect(rows[0].close).toBe(15);

    const columns = queryMarketRows("PRAGMA table_info('kline_monthly_raw')", [], db).map(row =>
      String(row[1])
    );
    expect(columns).not.toContain('change_percent');
    expect(columns).not.toContain('change_amount');
    expect(columns).not.toContain('amplitude');
    expect(columns).not.toContain('factor_version');
  });

  it('区间重建从受影响周期开始，不删除更早周期', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-02', 10), bar('2026-11-24', 12), bar('2026-11-25', 13)],
      'test-source'
    );
    rebuildDerivedPeriods(db, '600519', 'weekly', { now: 5 });
    const before = readDerivedPeriods(db, '600519', 'weekly');
    expect(before.length).toBeGreaterThan(1);

    rebuildDerivedPeriods(db, '600519', 'weekly', { fromDate: '2026-11-25', now: 6 });
    const after = readDerivedPeriods(db, '600519', 'weekly');
    // 11-02 所在周保留
    expect(after.some(row => row.periodStartDate === weekStartOf('2026-11-02'))).toBe(true);
  });
});

describe('复权周/月线读取', () => {
  it('逐日应用因子后聚合，而不是对周期 OHLC 乘单一因子', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-02', 10), bar('2026-11-03', 10), bar('2026-11-09', 10)],
      'test-source'
    );
    // 第一周因子 0.5，第二周因子 1.0：逐日应用后第一周收盘应为 5
    replaceAdjustFactors(db, '600519', [
      { tradeDate: '2026-11-02', qfqFactor: 0.5, hfqFactor: 2 },
      { tradeDate: '2026-11-03', qfqFactor: 0.5, hfqFactor: 2 },
      { tradeDate: '2026-11-09', qfqFactor: 1, hfqFactor: 1 },
    ]);

    const weekly = readAdjustedPeriodKline(db, '600519', 'weekly', 'qfq');
    expect(weekly).toHaveLength(2);
    expect(weekly[0].close).toBe(5);
    expect(weekly[1].close).toBe(10);
    // 第二个周期相对前一周的涨跌幅由复权后收盘价计算
    expect(weekly[1].changePercent).toBeCloseTo(100);
  });

  it('因子缺失时返回空数组，不退化为不复权数据', () => {
    upsertDailyRaw(db, '600519', [bar('2026-11-02', 10)], 'test-source');
    expect(readAdjustedPeriodKline(db, '600519', 'weekly', 'qfq')).toEqual([]);
  });
});

describe('聚合纯函数', () => {
  it('周起始为自然周周一，月末为 YYYY-MM-01', () => {
    expect(weekStartOf('2026-11-25')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-23')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-29')).toBe('2026-11-23');
  });

  it('开盘取首日、收盘取末日、高低取极值', () => {
    const bars = [
      { tradeDate: '2026-11-23', open: 10, high: 12, low: 9, close: 11, volume: 1, amount: 2, turnoverRate: null },
      { tradeDate: '2026-11-24', open: 11, high: 15, low: 10, close: 14, volume: 3, amount: 4, turnoverRate: 1 },
    ];
    const [weekly] = aggregateBars(bars, 'weekly', []);
    expect(weekly.open).toBe(10);
    expect(weekly.close).toBe(14);
    expect(weekly.high).toBe(15);
    expect(weekly.low).toBe(9);
    expect(weekly.volume).toBe(4);
    expect(weekly.amount).toBe(6);
    expect(weekly.turnoverRate).toBe(1);
  });

  it('复权聚合跳过无因子的交易日', () => {
    const bars = [
      { tradeDate: '2026-11-02', open: 10, high: 10, low: 10, close: 10, volume: null, amount: null, turnoverRate: null, factor: 0.5 },
      { tradeDate: '2026-11-03', open: 10, high: 10, low: 10, close: 10, volume: null, amount: null, turnoverRate: null, factor: 0 },
    ];
    const result = aggregateAdjustedBars(bars, 'weekly', []);
    expect(result).toHaveLength(1);
    expect(result[0].close).toBe(5);
  });
});

describe('数据质量记录', () => {
  it('质量异常只追加，不阻断导入', () => {
    insertQualityIssues(db, [
      { stockCode: '600519', tradeDate: '2026-11-20', issueType: 'gap', detail: '缺少交易日' },
      { stockCode: '600519', tradeDate: null, issueType: 'stale', detail: '长期未更新' },
    ]);
    expect(countQualityIssues(db)).toBe(2);
    expect(countQualityIssues(db, 'gap')).toBe(1);
  });
});
