import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useLogStore } from '../../src/stores/logStore';

const readLog = vi.fn();
const listLogDates = vi.fn();

beforeEach(() => {
  setActivePinia(createPinia());
  readLog.mockReset();
  readLog.mockResolvedValue({ content: 'line-1\n', error: null });
  listLogDates.mockReset();
  listLogDates.mockResolvedValue([]);

  vi.stubGlobal('window', {
    logApi: { readLog, listLogDates },
  });

  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 今天（本地日期），与 store 内部口径一致 */
function today(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

describe('日志页自动刷新', () => {
  it('查看今天时每 30 秒自动拉取一次', async () => {
    const store = useLogStore();
    store.setPageVisible(true);
    await store.initialize();

    expect(readLog).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30000);
    expect(readLog).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30000);
    expect(readLog).toHaveBeenCalledTimes(3);
  });

  it('切到历史日期后停止轮询，切回今天后恢复', async () => {
    const store = useLogStore();
    store.setPageVisible(true);
    await store.initialize();

    await store.selectDate('2020-01-01');
    const callsAfterSwitch = readLog.mock.calls.length;

    await vi.advanceTimersByTimeAsync(90000);
    expect(readLog.mock.calls.length).toBe(callsAfterSwitch);

    await store.selectDate(today());
    const callsAfterBack = readLog.mock.calls.length;

    await vi.advanceTimersByTimeAsync(30000);
    expect(readLog.mock.calls.length).toBe(callsAfterBack + 1);
  });

  it('页面不可见时不拉取，恢复可见后继续', async () => {
    const store = useLogStore();
    store.setPageVisible(true);
    await store.initialize();

    store.setPageVisible(false);
    const callsHidden = readLog.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(readLog.mock.calls.length).toBe(callsHidden);

    store.setPageVisible(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(readLog.mock.calls.length).toBe(callsHidden + 1);
  });

  it('读取失败不中断轮询', async () => {
    const store = useLogStore();
    store.setPageVisible(true);
    await store.initialize();

    readLog.mockResolvedValueOnce({ content: '', error: 'LOG_FILE_NOT_FOUND' });
    await vi.advanceTimersByTimeAsync(30000);

    await vi.advanceTimersByTimeAsync(30000);
    expect(readLog.mock.calls.length).toBe(3);
  });
});
