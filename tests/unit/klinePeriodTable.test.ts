import { describe, expect, it, vi } from 'vitest';

// 隔离主进程依赖，仅测试周期到表名的映射逻辑
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

import { KLINE_TABLES, tableOf } from '../../electron/database';

describe('K线周期到数据表的映射', () => {
  it('日/周/月分别映射到独立数据表', () => {
    expect(tableOf('d')).toBe('kline_daily');
    expect(tableOf('w')).toBe('kline_weekly');
    expect(tableOf('m')).toBe('kline_monthly');
  });

  it('三张表名互不相同', () => {
    expect(new Set(Object.values(KLINE_TABLES)).size).toBe(3);
  });

  it('非法周期抛出 INVALID_PERIOD 而不是静默返回', () => {
    expect(() => tableOf('y' as never)).toThrow(/INVALID_PERIOD/);
    expect(() => tableOf('' as never)).toThrow(/INVALID_PERIOD/);
    expect(() => tableOf(undefined as never)).toThrow(/INVALID_PERIOD/);
    expect(() => tableOf('daily; DROP TABLE kline_daily' as never)).toThrow(/INVALID_PERIOD/);
  });
});
