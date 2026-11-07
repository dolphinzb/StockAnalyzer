import { afterEach, describe, expect, it, vi } from 'vitest';

// 隔离主进程依赖，仅测试当前周期起始日的计算
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

import { getCurrentPeriodStart } from '../../electron/database';

/**
 * 固定系统时间（本地时区）
 */
function freezeDate(year: number, monthIndex: number, day: number): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
}

describe('getCurrentPeriodStart：未完成周期的起始日', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('周线在周三返回本周一', () => {
    freezeDate(2026, 10, 4); // 2026-11-04 周三
    expect(getCurrentPeriodStart('w')).toBe('2026-11-02');
  });

  it('周线在周日仍返回本周一（周日属于本周）', () => {
    freezeDate(2026, 10, 8); // 2026-11-08 周日
    expect(getCurrentPeriodStart('w')).toBe('2026-11-02');
  });

  it('周线跨年时返回上一年度的周一', () => {
    freezeDate(2026, 0, 1); // 2026-01-01 周四
    expect(getCurrentPeriodStart('w')).toBe('2025-12-29');
  });

  it('月线返回本月 1 号', () => {
    freezeDate(2026, 10, 4);
    expect(getCurrentPeriodStart('m')).toBe('2026-11-01');
  });

  it('月线月份补零', () => {
    freezeDate(2026, 0, 15);
    expect(getCurrentPeriodStart('m')).toBe('2026-01-01');
  });

  it('起始日不晚于当天，可用于 trade_date >= 起始日 的清理条件', () => {
    freezeDate(2026, 10, 4);
    expect(getCurrentPeriodStart('w') <= '2026-11-04').toBe(true);
    expect(getCurrentPeriodStart('m') <= '2026-11-04').toBe(true);
  });
});
