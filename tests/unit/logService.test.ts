import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// 隔离主进程依赖：本测试全部传入临时目录，不触碰真实 userData
vi.mock('electron', () => ({
  app: {
    getPath: () => '',
  },
}));

import {
  cleanupExpiredLogs,
  formatLogDate,
  getLogFilePath,
  isValidLogDate,
  listLogDates,
  migrateLegacyLogs,
} from '../../electron/services/logService';

let logDir: string;

/** 相对今天偏移若干天的本地正午时间，避免跨零点带来的边界抖动 */
function dateOffset(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12, 0, 0);
}

/** 在日志目录中创建一个日志文件，可指定 mtime */
function createLogFile(name: string, mtime?: Date): string {
  const filePath = join(logDir, name);
  writeFileSync(filePath, 'line\n');
  if (mtime) {
    utimesSync(filePath, mtime, mtime);
  }
  return filePath;
}

/** 创建按天命名的日志文件（日期相对今天偏移） */
function createDatedLog(offsetDays: number): string {
  return createLogFile(`main-${formatLogDate(dateOffset(offsetDays))}.log`);
}

beforeEach(() => {
  logDir = mkdtempSync(join(tmpdir(), 'stockanalyzer-log-'));
});

afterEach(() => {
  rmSync(logDir, { recursive: true, force: true });
});

describe('formatLogDate', () => {
  it('按本地时间补零输出 YYYY-MM-DD', () => {
    expect(formatLogDate(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
  });

  it('凌晨时段仍归入当天，不回退到前一天', () => {
    expect(formatLogDate(new Date(2026, 10, 12, 2, 0, 0))).toBe('2026-11-12');
  });
});

describe('isValidLogDate', () => {
  it('合法日期通过校验', () => {
    expect(isValidLogDate('2026-11-11')).toBe(true);
  });

  it('拒绝格式合法但不存在的日期', () => {
    expect(isValidLogDate('2026-13-01')).toBe(false);
    expect(isValidLogDate('2026-02-30')).toBe(false);
  });

  it('拒绝路径穿越等非法输入', () => {
    expect(isValidLogDate('../../etc/passwd')).toBe(false);
    expect(isValidLogDate('2026-11-11.log')).toBe(false);
  });
});

describe('getLogFilePath', () => {
  it('拼接为 main-<日期>.log', () => {
    expect(getLogFilePath(logDir, '2026-11-11')).toBe(join(logDir, 'main-2026-11-11.log'));
  });
});

describe('listLogDates', () => {
  it('只返回按天命名的文件，并按日期倒序', () => {
    createDatedLog(0);
    createDatedLog(-3);
    createLogFile('notes.txt');
    createLogFile('main-backup.log');

    expect(listLogDates(logDir)).toEqual([formatLogDate(dateOffset(0)), formatLogDate(dateOffset(-3))]);
  });

  it('不返回超出保留窗口的日期', () => {
    createDatedLog(-29);
    createDatedLog(-30);

    const dates = listLogDates(logDir);
    expect(dates).toEqual([formatLogDate(dateOffset(-29))]);
  });

  it('目录不存在时返回空数组且不抛错', () => {
    expect(listLogDates(join(logDir, 'not-exists'))).toEqual([]);
  });
});

describe('cleanupExpiredLogs', () => {
  it('保留第 30 天、删除第 31 天', () => {
    const kept = createDatedLog(-29);
    const expired = createDatedLog(-30);

    const deleted = cleanupExpiredLogs(logDir);

    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toBe(expired.split('\\').pop()?.split('/').pop());
    expect(listLogDates(logDir)).toContain(formatLogDate(dateOffset(-29)));
    expect(kept).toBeTruthy();
  });

  it('不删除非按天命名的文件', () => {
    createLogFile('notes.txt');
    createLogFile('main-backup.log');

    cleanupExpiredLogs(logDir);

    expect(listLogDates(logDir)).toEqual([]);
  });

  it('当天日志不会被删除', () => {
    createDatedLog(0);

    expect(cleanupExpiredLogs(logDir)).toEqual([]);
    expect(listLogDates(logDir)).toHaveLength(1);
  });
});

describe('migrateLegacyLogs', () => {
  it('按 mtime 日期重命名存量日志', () => {
    const mtime = new Date(2026, 10, 9, 10, 30, 0);
    createLogFile('main.log', mtime);

    const result = migrateLegacyLogs(logDir);

    expect(result.renamed).toEqual([{ from: 'main.log', to: 'main-2026-11-09.log' }]);
    expect(listLogDates(logDir, mtime)).toContain('2026-11-09');
  });

  it('目标文件已存在时跳过且不覆盖', () => {
    const mtime = new Date(2026, 10, 9, 10, 30, 0);
    createLogFile('main-2026-11-09.log', mtime);
    createLogFile('main.log', mtime);

    const result = migrateLegacyLogs(logDir);

    expect(result.skipped).toEqual([{ from: 'main.log', to: 'main-2026-11-09.log' }]);
    expect(result.renamed).toEqual([]);
  });

  it('重复执行不再迁移（幂等）', () => {
    createLogFile('main.log', new Date(2026, 10, 9, 10, 30, 0));

    expect(migrateLegacyLogs(logDir).renamed).toHaveLength(1);

    const second = migrateLegacyLogs(logDir);
    expect(second.renamed).toEqual([]);
    expect(second.skipped).toEqual([]);
  });

  it('目录不存在时返回空结果', () => {
    const result = migrateLegacyLogs(join(logDir, 'not-exists'));
    expect(result).toEqual({ renamed: [], skipped: [] });
  });
});
