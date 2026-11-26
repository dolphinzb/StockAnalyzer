import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketDataAPI, MarketSyncStatus, MarketSyncState } from '../../shared/types';
import { pollIntervalOf, useMarketDataSync } from '../../src/composables/useMarketDataSync';

/** 构造最小状态对象 */
function statusOf(state: MarketSyncState): MarketSyncStatus {
  return {
    state,
    mode: null,
    total: 0,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    earliestMissingDate: null,
    latestTradeDate: null,
    incrementalTaskCount: 0,
    currentTaskKey: null,
    currentStockCode: null,
    currentStockName: null,
    lastError: null,
    updatedAt: '2026-11-25T10:00:00.000Z',
    failedTasks: [],
  };
}

describe('行情库状态轮询', () => {
  let currentState: MarketSyncState;
  let getStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    // composable 在组件外调用时 Vue 会提示缺少实例，这里只验证调度逻辑
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    currentState = 'running';
    getStatus = vi.fn(async () => statusOf(currentState));
    const api: MarketDataAPI = {
      getStatus,
      startFullBackfill: async () => ({ success: true }),
      runIncremental: async () => ({ success: true }),
      retryFailed: async () => ({ success: true }),
    };
    (globalThis as unknown as { window: { marketDataAPI: MarketDataAPI } }).window = {
      marketDataAPI: api,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('运行中 1 秒，其余状态 5 秒', () => {
    expect(pollIntervalOf('running')).toBe(1000);
    expect(pollIntervalOf('idle')).toBe(5000);
    expect(pollIntervalOf('completed')).toBe(5000);
    expect(pollIntervalOf('failed')).toBe(5000);
    expect(pollIntervalOf(null)).toBe(5000);
  });

  it('状态变化时下一次轮询间隔自动切换，停止后不再轮询', async () => {
    const composable = useMarketDataSync();
    // composable 在组件外调用不会自动执行 onMounted，这里显式控制轮询生命周期
    composable.startPolling();
    await composable.refresh();
    expect(getStatus).toHaveBeenCalledTimes(1);

    // running：1 秒一次
    await vi.advanceTimersByTimeAsync(1000);
    expect(getStatus).toHaveBeenCalledTimes(2);

    // 切换为 completed 后，当前排定的一次仍会触发；之后间隔变为 5 秒
    currentState = 'completed';
    await vi.advanceTimersByTimeAsync(1000);
    expect(getStatus).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(getStatus).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(getStatus).toHaveBeenCalledTimes(4);

    composable.stopPolling();
    await vi.advanceTimersByTimeAsync(30000);
    expect(getStatus).toHaveBeenCalledTimes(4);
  });
});
