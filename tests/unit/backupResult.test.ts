import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupResult } from '../../shared/types';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    unlinkSync: vi.fn(),
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

// 备份改由引擎的一致性快照完成，这里只关心「是否调用」与失败传播
vi.mock('../../electron/database', () => ({
  getDatabasePath: () => 'C:/data/stockanalyzer.db',
  backupTo: vi.fn(),
}));

import { existsSync, readdirSync, statSync, unlinkSync } from 'fs';
import { backupTo } from '../../electron/database';
import {
  performBackup,
  runScheduledBackup,
  setBackupFailureNotifier,
} from '../../electron/services/backupService';

beforeEach(() => {
  vi.clearAllMocks();
  setBackupFailureNotifier(() => undefined);
  // 主库存在，其余路径不存在
  vi.mocked(existsSync).mockImplementation(path => String(path).endsWith('stockanalyzer.db'));
  vi.mocked(readdirSync).mockReturnValue([] as never);
  vi.mocked(statSync).mockReturnValue({ size: 1024, mtimeMs: Date.now() } as never);
  vi.mocked(unlinkSync).mockImplementation(() => undefined);
  vi.mocked(backupTo).mockResolvedValue(undefined);
});

describe('performBackup 结果上报', () => {
  it('成功时通过引擎快照生成备份，并返回备份路径', async () => {
    const result = await performBackup();

    expect(result.success).toBe(true);
    expect(result.backupPath).toContain('stockanalyzer_');
    expect(backupTo).toHaveBeenCalledOnce();
  });

  it('数据库文件不存在时返回失败', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await performBackup();

    expect(result.success).toBe(false);
    expect(result.error).toContain('不存在');
    expect(backupTo).not.toHaveBeenCalled();
  });

  it('快照生成失败时返回失败原因', async () => {
    vi.mocked(backupTo).mockRejectedValue(new Error('EACCES'));

    const result = await performBackup();

    expect(result.success).toBe(false);
    expect(result.error).toContain('写入失败');
    expect(result.error).toContain('EACCES');
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
    vi.mocked(backupTo).mockImplementation(async () => {
      if (!secondCall) {
        secondCall = performBackup();
      }
    });

    const first = await performBackup();
    expect(first.success).toBe(true);

    const second = await (secondCall as unknown as Promise<BackupResult>);
    expect(second.success).toBe(false);
    expect(second.error).toContain('已有备份在执行');
    // 并发期间不应重复生成快照
    expect(backupTo).toHaveBeenCalledOnce();
  });
});

describe('自动备份失败通知', () => {
  it('失败时触发通知回调并携带原因', async () => {
    const notify = vi.fn();
    setBackupFailureNotifier(notify);
    vi.mocked(backupTo).mockRejectedValue(new Error('disk full'));

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
