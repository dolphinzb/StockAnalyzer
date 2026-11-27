import { describe, expect, it, vi } from 'vitest';

const constructorOptions: unknown[] = [];

vi.mock('stock-sdk', () => ({
  StockSDK: class {
    constructor(options: unknown) {
      constructorOptions.push(options);
    }

    getHistoryKline() {
      const cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      const failure = new Error('fetch failed') as Error & { cause?: unknown };
      failure.cause = cause;
      return Promise.reject(failure);
    }
  },
}));

import { createStockSdkMarketClient, SDK_RATE_LIMIT_RPS } from '../../electron/services/marketSdkClient';

describe('stock-sdk 适配层', () => {
  it('默认把 3 req/s 传给 SDK 作为第二道限流', () => {
    expect(SDK_RATE_LIMIT_RPS).toBe(3);

    createStockSdkMarketClient();

    expect(constructorOptions).toHaveLength(1);
    expect(constructorOptions[0]).toMatchObject({
      rateLimit: { requestsPerSecond: 3, maxBurst: 3 },
    });
  });

  it('允许用 meta.sync_rps 的解析结果覆盖 SDK 内部限流', () => {
    createStockSdkMarketClient(20);

    expect(constructorOptions[1]).toMatchObject({
      rateLimit: { requestsPerSecond: 20, maxBurst: 20 },
    });
  });

  it('日线请求失败时保留代码、复权类型与日期区间上下文', async () => {
    const client = createStockSdkMarketClient();
    let caught: unknown = null;
    try {
      await client.getHistoryKline('sh000409', {
        period: 'daily',
        adjust: 'hfq',
        startDate: '19900101',
        endDate: '20261124',
      });
    } catch (error) {
      caught = error;
    }

    const text = caught instanceof Error ? caught.message : String(caught);
    expect(text).toContain('sh000409');
    expect(text).toContain('hfq');
    expect(text).toContain('19900101~20261124');
    expect((caught as Error & { cause?: unknown }).cause).toBeDefined();
  });
});
