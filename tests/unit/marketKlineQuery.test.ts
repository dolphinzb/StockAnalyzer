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

import { openMarketDatabase, type MarketDatabase } from '../../electron/marketDatabase';
import {
  rebuildDerivedPeriods,
  readMarketKline,
  replaceAdjustFactors,
  upsertDailyRaw,
  type MarketDailyRawInput,
} from '../../electron/services/marketRepository';

let db: MarketDatabase;

beforeEach(() => {
  db = openMarketDatabase(':memory:', true);
});

afterEach(() => {
  db.close();
});

function bar(tradeDate: string, close: number, extra: Partial<MarketDailyRawInput> = {}): MarketDailyRawInput {
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

describe('全市场 K 线查询', () => {
  it('不复权日线直读已存储涨跌字段并按交易日升序返回全部历史', () => {
    upsertDailyRaw(
      db,
      '600519',
      [
        bar('2026-11-20', 10, { changeAmount: -0.13, changePercent: -1.25, amplitude: 3.5 }),
        bar('2026-11-19', 9, { changeAmount: 0.1, changePercent: 1.11, amplitude: 2 }),
      ],
      'test-source'
    );

    const rows = readMarketKline(db, { stockCode: '600519', period: 'd', adjust: 'none' });
    expect(rows.map(row => row.tradeDate)).toEqual(['2026-11-19', '2026-11-20']);
    expect(rows[0].changeAmount).toBe(0.1);
    expect(rows[0].changePercent).toBe(1.11);
    expect(rows[1].changeAmount).toBe(-0.13);
    expect(rows[1].changePercent).toBe(-1.25);
    expect(rows[1].amplitude).toBe(3.5);
  });

  it('前复权日线逐日应用因子并在主进程计算涨跌字段', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-19', 10, { high: 11, low: 9 }), bar('2026-11-20', 12, { high: 13, low: 11 })],
      'test-source'
    );
    replaceAdjustFactors(db, '600519', [
      { tradeDate: '2026-11-19', qfqFactor: 0.5, hfqFactor: 2 },
      { tradeDate: '2026-11-20', qfqFactor: 0.5, hfqFactor: 2 },
    ]);

    const rows = readMarketKline(db, { stockCode: '600519', period: 'd', adjust: 'qfq' });
    expect(rows).toHaveLength(2);
    expect(rows[0].close).toBe(5);
    expect(rows[0].high).toBe(5.5);
    expect(rows[0].low).toBe(4.5);
    expect(rows[0].volume).toBe(100);
    expect(rows[0].changeAmount).toBeNull();
    expect(rows[1].close).toBe(6);
    expect(rows[1].changeAmount).toBeCloseTo(1);
    expect(rows[1].changePercent).toBeCloseTo(20);
    expect(rows[1].amplitude).toBeCloseTo((5.5 - 4.5) / 5 * 100);
  });

  it('后复权日线逐日应用 hfq 因子', () => {
    upsertDailyRaw(db, '600519', [bar('2026-11-19', 10)], 'test-source');
    replaceAdjustFactors(db, '600519', [{ tradeDate: '2026-11-19', qfqFactor: 0.5, hfqFactor: 2 }]);

    const rows = readMarketKline(db, { stockCode: '600519', period: 'd', adjust: 'hfq' });
    expect(rows).toHaveLength(1);
    expect(rows[0].open).toBe(20);
    expect(rows[0].close).toBe(20);
  });

  it('复权因子完全缺失时返回空数组，不退化为不复权', () => {
    upsertDailyRaw(db, '600519', [bar('2026-11-19', 10)], 'test-source');

    expect(readMarketKline(db, { stockCode: '600519', period: 'd', adjust: 'qfq' })).toEqual([]);
    expect(readMarketKline(db, { stockCode: '600519', period: 'w', adjust: 'hfq' })).toEqual([]);
  });

  it('不复权周线以 periodEndDate 为日期，首根涨跌为 null，后续按相邻收盘价补齐', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-23', 10), bar('2026-11-24', 12), bar('2026-11-30', 15)],
      'test-source'
    );
    rebuildDerivedPeriods(db, '600519', 'weekly', { now: 1 });

    const rows = readMarketKline(db, { stockCode: '600519', period: 'w', adjust: 'none' });
    expect(rows.map(row => row.tradeDate)).toEqual(['2026-11-24', '2026-11-30']);
    expect(rows[0].changeAmount).toBeNull();
    expect(rows[0].changePercent).toBeNull();
    expect(rows[1].close).toBe(15);
    expect(rows[1].changeAmount).toBe(3);
    expect(rows[1].changePercent).toBeCloseTo(25);
  });

  it('复权月线按日线逐日因子聚合而非对周期 OHLC 乘单一因子', () => {
    upsertDailyRaw(
      db,
      '600519',
      [bar('2026-11-02', 10), bar('2026-11-03', 10), bar('2026-12-01', 10)],
      'test-source'
    );
    replaceAdjustFactors(db, '600519', [
      { tradeDate: '2026-11-02', qfqFactor: 0.5, hfqFactor: 2 },
      { tradeDate: '2026-11-03', qfqFactor: 0.5, hfqFactor: 2 },
      { tradeDate: '2026-12-01', qfqFactor: 1, hfqFactor: 1 },
    ]);

    const rows = readMarketKline(db, { stockCode: '600519', period: 'm', adjust: 'qfq' });
    expect(rows.map(row => row.tradeDate)).toEqual(['2026-11-03', '2026-12-01']);
    expect(rows[0].close).toBe(5);
    expect(rows[1].close).toBe(10);
    expect(rows[1].changePercent).toBeCloseTo(100);
  });

  it('无历史数据时返回空数组', () => {
    expect(readMarketKline(db, { stockCode: '000001', period: 'd', adjust: 'none' })).toEqual([]);
    expect(readMarketKline(db, { stockCode: '000001', period: 'm', adjust: 'none' })).toEqual([]);
  });
});
