import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchlistStock } from '../../src/types';

// store 内部通过 window.stockWatcherAPI 调用主进程能力，这里用桩替换
const api = vi.hoisted(() => ({
  getWatchlist: vi.fn(),
  reorderWatchlist: vi.fn(),
}));

vi.stubGlobal('window', { stockWatcherAPI: api });

import { useWatchlistStore } from '../../src/stores/watchlist';

/** 构造指定 id 顺序的自选股列表 */
function createStocks(ids: number[]): WatchlistStock[] {
  return ids.map(id => ({
    id,
    stockCode: String(600000 + id),
    stockName: `股票${id}`,
    buyThreshold: 10,
    sellThreshold: 20,
    monitorEnabled: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sortOrder: id,
  }));
}

describe('watchlist store - reorderStocks', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.getWatchlist.mockReset();
    api.reorderWatchlist.mockReset();
  });

  it('保存成功后使用后端返回的顺序覆盖本地', async () => {
    const store = useWatchlistStore();
    store.stocks = createStocks([1, 2, 3]);
    api.reorderWatchlist.mockResolvedValue(createStocks([3, 1, 2]));

    await store.reorderStocks([3, 1, 2]);

    expect(api.reorderWatchlist).toHaveBeenCalledWith([3, 1, 2]);
    expect(store.stocks.map(stock => stock.id)).toEqual([3, 1, 2]);
    expect(store.isReordering).toBe(false);
  });

  it('保存失败时从后端重拉恢复原顺序并向上抛出', async () => {
    const store = useWatchlistStore();
    store.stocks = createStocks([1, 2, 3]);
    api.reorderWatchlist.mockRejectedValue(new Error('boom'));
    api.getWatchlist.mockResolvedValue(createStocks([1, 2, 3]));

    await expect(store.reorderStocks([3, 2, 1])).rejects.toThrow('boom');

    expect(api.getWatchlist).toHaveBeenCalled();
    expect(store.stocks.map(stock => stock.id)).toEqual([1, 2, 3]);
    expect(store.isReordering).toBe(false);
  });

  it('重拉也失败时回填拖拽前的备份顺序', async () => {
    const store = useWatchlistStore();
    store.stocks = createStocks([1, 2, 3]);
    api.reorderWatchlist.mockRejectedValue(new Error('boom'));
    api.getWatchlist.mockRejectedValue(new Error('offline'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(store.reorderStocks([3, 2, 1])).rejects.toThrow('boom');

    expect(store.stocks.map(stock => stock.id)).toEqual([1, 2, 3]);
    expect(store.isReordering).toBe(false);
    consoleError.mockRestore();
  });
});
