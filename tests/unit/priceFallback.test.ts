import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlineFallbackQuote, WatchlistStock } from '../../electron/database';
import type { PriceResult } from '../../electron/services/priceFetcher';

const mocks = vi.hoisted(() => ({
  getLatestKlineQuotes: vi.fn(),
  getLastTradingDay: vi.fn(),
  send: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: mocks.send },
    }],
  },
  Notification: { isSupported: () => false },
}));

vi.mock('electron-log', () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

vi.mock('../../electron/database', () => ({
  loadConfig: () => ({}),
  getLatestKlineQuotes: mocks.getLatestKlineQuotes,
}));

vi.mock('../../electron/services/klineDownloadService', () => ({
  getLastTradingDay: mocks.getLastTradingDay,
}));

import {
  getPreviousTradingDay,
  mergeQuoteUpdates,
  publishQuoteUpdates,
} from '../../electron/services/priceFetcher';

const PREVIOUS_DAY = '2026-11-26';
const TIMESTAMP = '2026-11-27T08:00:00.000Z';

function stock(code: string, monitorEnabled = false): WatchlistStock {
  return {
    id: 1,
    stockCode: code,
    stockName: code,
    buyThreshold: 1,
    sellThreshold: 10000,
    monitorEnabled,
    createdAt: '',
    updatedAt: '',
    sortOrder: 0,
  };
}

function quote(overrides: Partial<KlineFallbackQuote> = {}): KlineFallbackQuote {
  return {
    tradeDate: PREVIOUS_DAY,
    open: 10,
    high: 11,
    low: 9,
    close: 10.5,
    changeAmount: 0.5,
    changePercent: 5,
    ...overrides,
  };
}

function failedResult(code: string): PriceResult {
  return {
    stockCode: `sh${code}`,
    price: 0,
    openPrice: 0,
    highPrice: 0,
    lowPrice: 0,
    prevClosePrice: 0,
    success: false,
    error: '数据源未返回该代码',
  };
}

function successfulResult(code: string): PriceResult {
  return {
    stockCode: `sh${code}`,
    price: 12,
    openPrice: 11,
    highPrice: 13,
    lowPrice: 10,
    prevClosePrice: 11,
    success: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLastTradingDay.mockResolvedValue('20261126');
});

describe('getPreviousTradingDay', () => {
  it('以昨日为基准并转换为 YYYY-MM-DD', async () => {
    await expect(getPreviousTradingDay(new Date(2026, 10, 27))).resolves.toBe(PREVIOUS_DAY);
    expect(mocks.getLastTradingDay).toHaveBeenCalledTimes(1);
    const base = mocks.getLastTradingDay.mock.calls[0][0] as Date;
    expect(base.getDate()).toBe(26);
  });
});

describe('mergeQuoteUpdates', () => {
  it('实时价有效时优先使用实时值', () => {
    const updates = mergeQuoteUpdates(
      [successfulResult('600519')],
      [stock('600519')],
      new Map([['600519', quote()]]),
      PREVIOUS_DAY,
      TIMESTAMP
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      stockCode: '600519',
      price: 12,
      priceChange: 1,
      priceChangePercent: 9.09,
    });
  });

  it('实时失败时用最新日 K 补齐整行，空字段保持 null', () => {
    const updates = mergeQuoteUpdates(
      [failedResult('600519')],
      [stock('600519')],
      new Map([['600519', quote({ high: null, changeAmount: null, changePercent: null })]]),
      PREVIOUS_DAY,
      TIMESTAMP
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      stockCode: '600519',
      price: 10.5,
      openPrice: 10,
      highPrice: null,
      lowPrice: 9,
      prevClosePrice: null,
      priceChange: null,
      priceChangePercent: null,
      timestamp: TIMESTAMP,
    });
  });

  it('日 K 陈旧或收盘价无效时不产生回退价', () => {
    const fallback = new Map<string, KlineFallbackQuote>([
      ['000001', quote({ tradeDate: '2026-11-25' })],
      ['600519', quote({ close: 0 })],
    ]);

    const updates = mergeQuoteUpdates(
      [failedResult('000001'), failedResult('600519')],
      [stock('000001'), stock('600519')],
      fallback,
      PREVIOUS_DAY,
      TIMESTAMP
    );

    expect(updates).toEqual([]);
  });

  it('整批失败且无可用回退时下发结果为空', () => {
    const updates = mergeQuoteUpdates(
      [failedResult('600519')],
      [stock('600519')],
      new Map(),
      PREVIOUS_DAY,
      TIMESTAMP
    );

    expect(updates).toEqual([]);
  });

  it('未请求列表中的股票代码被忽略', () => {
    const updates = mergeQuoteUpdates(
      [successfulResult('999999')],
      [stock('600519')],
      new Map(),
      PREVIOUS_DAY,
      TIMESTAMP
    );

    expect(updates).toEqual([]);
  });
});

describe('publishQuoteUpdates', () => {
  it('回退结果进入下发链路，未监控股不产生告警', () => {
    const update = mergeQuoteUpdates(
      [failedResult('600519')],
      [stock('600519')],
      new Map([['600519', quote()]]),
      PREVIOUS_DAY,
      TIMESTAMP
    )[0];

    publishQuoteUpdates([stock('600519')], [update]);

    expect(mocks.send).toHaveBeenCalledWith('prices:update', [update]);
    expect(mocks.send).not.toHaveBeenCalledWith('alert:trigger', expect.anything());
  });

  it('空结果不推送，保留界面已有价格', () => {
    publishQuoteUpdates([stock('600519')], []);

    expect(mocks.send).not.toHaveBeenCalled();
  });
});
