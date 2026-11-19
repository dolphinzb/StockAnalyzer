import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

// 隔离主进程依赖，使用内存数据库验证只读查询
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
import { getLatestTradeDates, saveKlineData } from '../../electron/database';

let database: Database;

/**
 * 构造 stock-sdk 返回的 K 线项（仅保留被测字段）
 * saveKlineData 会从 kline.code 反推入库代码，因此这里必须带上与持仓一致的代码
 */
function kline(date: string, stockCode = '600519') {
  const prefix = /^6/.test(stockCode) ? 'sh' : 'sz';
  return {
    code: `${prefix}${stockCode}`,
    date,
    open: 10,
    close: 11,
    high: 12,
    low: 9,
    volume: 1000,
  } as never;
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  database = new SQL.Database();
  runMigrations(database, { isNewDatabase: true });
});

afterEach(() => {
  database.close();
});

describe('getLatestTradeDates', () => {
  it('空入参直接返回空 Map', () => {
    const result = getLatestTradeDates([], 'd', database);

    expect(result.size).toBe(0);
  });

  it('同股不同复权返回各自最新交易日（YYYYMMDD）', () => {
    saveKlineData('600519', [kline('2026-11-10'), kline('2026-11-12')], '', 'd', database);
    saveKlineData('600519', [kline('2026-11-10')], 'qfq', 'd', database);

    const result = getLatestTradeDates(['600519'], 'd', database);

    expect(result.get('600519')).toEqual({ unadjusted: '20261112', adjusted: '20261110' });
  });

  it('单边复权无记录时该项为 null', () => {
    saveKlineData('600519', [kline('2026-10-20')], 'qfq', 'd', database);

    const result = getLatestTradeDates(['600519'], 'd', database);

    expect(result.get('600519')).toEqual({ unadjusted: null, adjusted: '20261020' });
  });

  it('库内无数据的股票返回 null 条目', () => {
    const result = getLatestTradeDates(['000001'], 'd', database);

    expect(result.get('000001')).toEqual({ unadjusted: null, adjusted: null });
  });

  it('多只股票互不串扰', () => {
    saveKlineData('000001', [kline('2026-11-13', '000001')], '', 'd', database);
    saveKlineData('600519', [kline('2026-11-12')], '', 'd', database);

    const result = getLatestTradeDates(['000001', '600519', '510050'], 'd', database);

    expect(result.get('000001')?.unadjusted).toBe('20261113');
    expect(result.get('600519')?.unadjusted).toBe('20261112');
    expect(result.get('510050')).toEqual({ unadjusted: null, adjusted: null });
  });

  it('按周期查询各自表（周线与日线互不影响）', () => {
    saveKlineData('600519', [kline('2026-11-13')], '', 'd', database);
    saveKlineData('600519', [kline('2020-01-03'), kline('2020-01-10')], '', 'w', database);

    expect(getLatestTradeDates(['600519'], 'd', database).get('600519')?.unadjusted).toBe('20261113');
    expect(getLatestTradeDates(['600519'], 'w', database).get('600519')?.unadjusted).toBe('20200110');
    expect(getLatestTradeDates(['600519'], 'm', database).get('600519')).toEqual({
      unadjusted: null,
      adjusted: null,
    });
  });

  it('非法周期抛错而非静默返回空结果', () => {
    expect(() => getLatestTradeDates(['600519'], 'x' as never, database)).toThrow('INVALID_PERIOD');
  });
});
