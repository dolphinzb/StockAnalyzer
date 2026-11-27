import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
  stockGetHistoryKline: vi.fn(),
  sohuGetHistoryKline: vi.fn(),
}));

vi.mock('stock-sdk', () => ({
  StockSDK: class {
    constructor(options: unknown) {
      mocks.constructorOptions.push(options);
    }

    getHistoryKline(...args: unknown[]) {
      return mocks.stockGetHistoryKline(...args);
    }

    getAShareCodeList() {
      return Promise.resolve(['sh600519']);
    }

    getTradingCalendar() {
      return Promise.resolve(['2026-11-26']);
    }

    getAllQuotesByCodes() {
      return Promise.resolve([{ code: 'sh600519', name: '贵州茅台' }]);
    }

    search() {
      return Promise.resolve([{ code: 'sh600519', name: '贵州茅台' }]);
    }
  },
}));

vi.mock('../../electron/services/sohuKlineClient', () => ({
  createSohuKlineClient: () => ({ getHistoryKline: mocks.sohuGetHistoryKline }),
}));

import { createMarketSdkClient } from '../../electron/services/marketSdkClient';

describe('行情库混合 SDK 客户端', () => {
  it('非 K 线方法继续委托 stock-sdk，并透传内部限流', async () => {
    const client = createMarketSdkClient({ requestsPerSecond: 7 });

    expect(mocks.constructorOptions.at(-1)).toMatchObject({
      rateLimit: { requestsPerSecond: 7, maxBurst: 7 },
    });
    expect(await client.getAShareCodeList()).toEqual(['sh600519']);
    expect(await client.getTradingCalendar()).toEqual(['2026-11-26']);
    expect(await client.getAllQuotesByCodes?.(['sh600519'])).toEqual([
      { code: 'sh600519', name: '贵州茅台' },
    ]);
    expect(await client.search?.('茅台')).toEqual([{ code: 'sh600519', name: '贵州茅台' }]);
  });

  it('K 线委托搜狐客户端且不回退 stock-sdk', async () => {
    const bars = [{ date: '2026-11-26' }];
    mocks.sohuGetHistoryKline.mockResolvedValueOnce(bars);
    const client = createMarketSdkClient();

    const result = await client.getHistoryKline('sh600519', {
      period: 'daily',
      adjust: 'qfq',
      startDate: '20261101',
      endDate: '20261126',
    });

    expect(result).toBe(bars);
    expect(mocks.sohuGetHistoryKline).toHaveBeenCalledTimes(1);
    expect(mocks.stockGetHistoryKline).not.toHaveBeenCalled();
  });

  it('搜狐 K 线失败只补上下文，不改用 stock-sdk', async () => {
    const cause = new Error('ENOTFOUND');
    mocks.sohuGetHistoryKline.mockRejectedValueOnce(cause);
    const client = createMarketSdkClient();

    let caught: unknown = null;
    try {
      await client.getHistoryKline('sh600519', {
        period: 'daily',
        adjust: 'hfq',
        startDate: '19900101',
        endDate: '20261126',
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('sh600519');
    expect((caught as Error).message).toContain('hfq');
    expect((caught as Error & { cause?: unknown }).cause).toBe(cause);
    expect(mocks.stockGetHistoryKline).not.toHaveBeenCalled();
  });
});
