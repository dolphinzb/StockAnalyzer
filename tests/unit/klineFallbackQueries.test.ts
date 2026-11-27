import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteDatabase, type DatabaseLike as Database } from '../../electron/sqliteEngine';

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
    getAppPath: () => '',
  },
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

import { runMigrations } from '../../electron/migrations';
import { getLatestKlineQuotes } from '../../electron/database';

let database: Database;

interface KlineInput {
  adjustType?: '' | 'qfq' | 'hfq';
  open?: number | null;
  close?: number | null;
  high?: number | null;
  low?: number | null;
  changeAmount?: number | null;
  changePercent?: number | null;
}

function insertKline(stockCode: string, tradeDate: string, input: KlineInput = {}): void {
  database.run(
    `INSERT INTO kline_daily
       (stock_code, trade_date, adjust_type, open, close, high, low, change_amount, change_percent, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stockCode,
      tradeDate,
      input.adjustType ?? '',
      input.open === undefined ? 10 : input.open,
      input.close === undefined ? 11 : input.close,
      input.high === undefined ? 12 : input.high,
      input.low === undefined ? 9 : input.low,
      input.changeAmount === undefined ? 0.5 : input.changeAmount,
      input.changePercent === undefined ? 1.25 : input.changePercent,
      '2026-11-27 00:00:00',
      '2026-11-27 00:00:00',
    ]
  );
}

beforeEach(() => {
  database = new SqliteDatabase(':memory:');
  runMigrations(database, { isNewDatabase: true });
});

afterEach(() => {
  database.close();
});

describe('getLatestKlineQuotes', () => {
  it('空入参直接返回空 Map', () => {
    expect(getLatestKlineQuotes([], database).size).toBe(0);
  });

  it('每只股票各取自己最新一根日 K，不复权优先', () => {
    insertKline('600519', '2026-11-20', { close: 10 });
    insertKline('600519', '2026-11-26', { close: 11, changeAmount: 0.8, changePercent: 7.84 });
    insertKline('600519', '2026-11-26', { adjustType: 'qfq', close: 99 });
    insertKline('000001', '2026-11-25', { close: 20 });

    const result = getLatestKlineQuotes(['600519', '000001'], database);

    expect(result.get('600519')).toEqual({
      tradeDate: '2026-11-26',
      open: 10,
      close: 11,
      high: 12,
      low: 9,
      changeAmount: 0.8,
      changePercent: 7.84,
    });
    expect(result.get('000001')?.tradeDate).toBe('2026-11-25');
    expect(result.get('000001')?.close).toBe(20);
  });

  it('没有不复权数据时退回前复权', () => {
    insertKline('600519', '2026-11-26', { adjustType: 'qfq', close: 99 });

    const result = getLatestKlineQuotes(['600519'], database);

    expect(result.get('600519')?.tradeDate).toBe('2026-11-26');
    expect(result.get('600519')?.close).toBe(99);
  });

  it('无数据股票与其它复权类型都不返回', () => {
    insertKline('600519', '2026-11-26', { adjustType: 'hfq' });

    const result = getLatestKlineQuotes(['600519', '000001'], database);

    expect(result.has('600519')).toBe(false);
    expect(result.has('000001')).toBe(false);
  });

  it('库内 NULL 字段原样透传，不用 0 顶替', () => {
    insertKline('600519', '2026-11-26', { high: null, changeAmount: null, changePercent: null });

    const result = getLatestKlineQuotes(['600519'], database);

    expect(result.get('600519')?.high).toBeNull();
    expect(result.get('600519')?.changeAmount).toBeNull();
    expect(result.get('600519')?.changePercent).toBeNull();
  });

  it('空库返回空 Map', () => {
    expect(getLatestKlineQuotes(['600519', '000001'], database).size).toBe(0);
  });
});
