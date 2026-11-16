import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupResult } from '../../shared/types';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    copyFileSync: vi.fn(),
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
  };
});

vi.mock('electron-log', () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

vi.mock('../../electron/database', () => ({
  getDatabasePath: () => 'C:/data/stockanalyzer.db',
  saveDatabase: vi.fn(),
}));

import { copyFileSync, existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { saveDatabase } from '../../electron/database';
import {
  performBackup,
  runScheduledBackup,
  setBackupFailureNotifier,
} from '../../electron/services/backupService';

beforeEach(() => {
  vi.clearAllMocks();
  setBackupFailureNotifier(() => undefined);
  // 主库存在、备份文件尚不存在、临时文件存在（便于验证清理）
  vi.mocked(existsSync).mockImplementation((path) => {
    const value = String(path);
    if (value.endsWith('.tmp')) {
      return true;
    }
    return value.endsWith('stockanalyzer.db');
  });
  vi.mocked(copyFileSync).mockImplementation(() => undefined);
  vi.mocked(renameSync).mockImplementation(() => undefined);
  vi.mocked(unlinkSync).mockImplementation(() => undefined);
  vi.mocked(readdirSync).mockReturnValue([] as never);
  vi.mocked(statSync).mockReturnValue({ size: 1024, mtimeMs: Date.now() } as never);
  vi.mocked(saveDatabase).mockImplementation(() => undefined);
});

describe('performBackup 结果上报', () => {
  it('成功时先落盘再复制，并返回备份路径', async () => {
    const result = await performBackup();
    expect(result.success).toBe(true);
    expect(result.backupPath).toContain('stockanalyzer_');
    expect(saveDatabase).toHaveBeenCalledOnce();
    expect(copyFileSync).toHaveBeenCalledOnce();
    expect(renameSync).toHaveBeenCalledOnce();
  });

  it('数据库文件不存在时返回失败', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await performBackup();
    expect(result.success).toBe(false);
    expect(result.error).toContain('不存在');
    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it('备份前落盘失败时中止，不复制旧文件', async () => {
    vi.mocked(saveDatabase).mockImplementation(() => {
      throw new Error('disk full');
    });
    const result = await performBackup();
    expect(result.success).toBe(false);
    expect(result.error).toContain('落盘失败');
    expect(result.error).toContain('disk full');
    expect(copyFileSync).not.toHaveBeenCalled();
  });

  it('复制失败时返回失败原因并清理临时文件', async () => {
    vi.mocked(copyFileSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    const result = await performBackup();
    expect(result.success).toBe(false);
    expect(result.error).toContain('写入失败');
    expect(result.error).toContain('EACCES');
    expect(unlinkSync).toHaveBeenCalled();
    expect(renameSync).not.toHaveBeenCalled();
  });

  it('清理旧备份失败时也返回失败，不伪装成成功', async () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error('EACCES');
    });
    const result = await performBackup();
    expect(result.success).toBe(false);
    expect(result.error).toContain('清理旧备份失败');
  });

  it('上一次备份未结束时再次触发会明确返回失败', async () => {
    let secondCall: Promise<BackupResult> | null = null;
    vi.mocked(copyFileSync).mockImplementation(() => {
      if (!secondCall) {
        secondCall = performBackup();
      }
    });

    const first = await performBackup();
    expect(first.success).toBe(true);
    const second = await (secondCall as Promise<BackupResult>);
    expect(second.success).toBe(false);
    expect(second.error).toContain('已有备份在执行');
    // 并发期间不应重复落盘
    expect(copyFileSync).toHaveBeenCalledOnce();
  });
});

describe('自动备份失败通知', () => {
  it('失败时触发通知回调并携带原因', async () => {
    const notify = vi.fn();
    setBackupFailureNotifier(notify);
    vi.mocked(saveDatabase).mockImplementation(() => {
      throw new Error('disk full');
    });
    const result = await runScheduledBackup();
    expect(result.success).toBe(false);
    expect(notify).toHaveBeenCalledOnce();
    expect(notify.mock.calls[0][0]).toContain('disk full');
  });

  it('成功时不发出失败通知', async () => {
    const notify = vi.fn();
    setBackupFailureNotifier(notify);
    const result = await runScheduledBackup();
    expect(result.success).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });
});
