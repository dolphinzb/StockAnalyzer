import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

// 隔离主进程依赖，使用内存数据库验证写库语义
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

import { KLINE_TABLE_DDL, saveKlineData } from '../../electron/database';

let database: Database;

/** 固定系统时间为 2026-11-04（周三），使「当前周期起始日」可预测 */
function freezeToWednesday(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 4, 15, 30, 0));
}

/**
 * 构造 stock-sdk 返回的 K 线项（仅保留被测字段）
 */
function kline(date: string) {
  return {
    code: 'sh600519',
    date,
    open: 10,
    close: 11,
    high: 12,
    low: 9,
    volume: 1000,
  } as never;
}

/**
 * 读取指定表的交易日期（升序）
 */
function tradeDates(table: string): string[] {
  const result = database.exec(`SELECT trade_date FROM ${table} ORDER BY trade_date`);
  return result.length > 0 ? result[0].values.map(row => String(row[0])) : [];
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  database = new SQL.Database();
  database.run(KLINE_TABLE_DDL);
});

afterEach(() => {
  vi.useRealTimers();
  database.close();
});

describe('周线/月线未完成周期的覆盖写入', () => {
  it('同一周内两次写入只保留最新一行', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-11-04')], 'qfq', 'w', database);
    saveKlineData('600519', [kline('2026-11-05')], 'qfq', 'w', database);

    expect(tradeDates('kline_weekly')).toEqual(['2026-11-05']);
  });

  it('同一月内两次写入只保留最新一行', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-11-04')], 'qfq', 'm', database);
    saveKlineData('600519', [kline('2026-11-20')], 'qfq', 'm', database);

    expect(tradeDates('kline_monthly')).toEqual(['2026-11-20']);
  });

  it('不覆盖上一周期的记录', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-10-30')], 'qfq', 'w', database);
    saveKlineData('600519', [kline('2026-11-09')], 'qfq', 'w', database);

    expect(tradeDates('kline_weekly')).toEqual(['2026-10-30', '2026-11-09']);
  });

  it('历史区间下载不会删掉当前周期数据', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-11-04')], 'qfq', 'w', database);
    saveKlineData(
      '600519',
      [kline('2020-01-03'), kline('2020-01-10'), kline('2020-01-17')],
      'qfq',
      'w',
      database
    );

    expect(tradeDates('kline_weekly')).toEqual([
      '2020-01-03',
      '2020-01-10',
      '2020-01-17',
      '2026-11-04',
    ]);
  });

  it('周线与月线互不影响', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-11-04')], 'qfq', 'w', database);
    saveKlineData('600519', [kline('2026-11-04')], 'qfq', 'm', database);

    expect(tradeDates('kline_weekly')).toEqual(['2026-11-04']);
    expect(tradeDates('kline_monthly')).toEqual(['2026-11-04']);
  });

  it('日线不触发当前周期清理，多日数据共存', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-11-02'), kline('2026-11-03')], '', 'd', database);
    saveKlineData('600519', [kline('2026-11-04')], '', 'd', database);

    expect(tradeDates('kline_daily')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  it('不复权与前复权记录互不删除', () => {
    freezeToWednesday();
    saveKlineData('600519', [kline('2026-11-04')], '', 'w', database);
    saveKlineData('600519', [kline('2026-11-05')], 'qfq', 'w', database);

    expect(tradeDates('kline_weekly')).toEqual(['2026-11-04', '2026-11-05']);
  });
});
