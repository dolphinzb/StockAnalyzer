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
function kline(date: string, close = 11) {
  return {
    code: 'sh600519',
    date,
    open: 10,
    close,
    high: 12,
    low: 9,
    volume: 1000,
  } as never;
}

/**
 * 读取指定表按交易日期升序的第一行关键字段（用于断言行身份是否稳定）
 */
function firstRow(table: string): {
  id: number;
  tradeDate: string;
  close: number;
  createdAt: string;
  updatedAt: string;
} {
  const result = database.exec(
    `SELECT id, trade_date, close, created_at, updated_at FROM ${table} ORDER BY trade_date`
  );
  const row = result[0].values[0];
  return {
    id: Number(row[0]),
    tradeDate: String(row[1]),
    close: Number(row[2]),
    createdAt: String(row[3]),
    updatedAt: String(row[4]),
  };
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

describe('重复写入的行身份稳定性（UPSERT 语义）', () => {
  it('历史区间重复写入不改变 id 与 created_at，只刷新行情字段', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 15, 30, 0));
    saveKlineData('600519', [kline('2026-10-30', 11)], 'qfq', 'w', database);
    const before = firstRow('kline_weekly');

    vi.setSystemTime(new Date(2026, 10, 6, 15, 30, 0));
    saveKlineData('600519', [kline('2026-10-30', 22)], 'qfq', 'w', database);
    const after = firstRow('kline_weekly');

    // 不得堆出重复行
    expect(tradeDates('kline_weekly')).toEqual(['2026-10-30']);
    // id 与首次入库时间保持稳定（INSERT OR REPLACE 会变）
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    // 行情字段与 updated_at 正常刷新
    expect(after.close).toBe(22);
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it('日线重复写入同一交易日不改变 id 与 created_at', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 4, 15, 30, 0));
    saveKlineData('600519', [kline('2026-11-04', 11)], '', 'd', database);
    const before = firstRow('kline_daily');

    vi.setSystemTime(new Date(2026, 10, 6, 15, 30, 0));
    saveKlineData('600519', [kline('2026-11-04', 12)], '', 'd', database);
    const after = firstRow('kline_daily');

    expect(tradeDates('kline_daily')).toEqual(['2026-11-04']);
    expect(after.id).toBe(before.id);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.close).toBe(12);
  });
});
