import { describe, expect, it, vi } from 'vitest';

// 隔离主进程依赖，仅测试批量下载的纯逻辑函数
vi.mock('electron', () => ({
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

vi.mock('stock-sdk', () => ({
  StockSDK: class {
    async getHistoryKline() {
      return [];
    }

    async getTradingCalendar() {
      return [];
    }
  },
}));

vi.mock('../../electron/database', () => ({
  getWatchlist: () => [],
  saveKlineData: () => 0,
  saveDatabase: () => undefined,
  getChartData: () => [],
}));

import {
  buildBatchStockResult,
  buildBatchSummary,
  validateBatchDownloadInput
} from '../../electron/services/klineDownloadService';
import type { KlineBatchStockResult, KlineDownloadResult } from '../../shared/types';

/**
 * 构造单只下载结果
 * @param overrides 覆盖字段
 */
function createDownloadResult(overrides: Partial<KlineDownloadResult> = {}): KlineDownloadResult {
  return {
    success: true,
    ...overrides,
  };
}

/**
 * 构造批量结果项
 * @param overrides 覆盖字段
 */
function createBatchResult(overrides: Partial<KlineBatchStockResult> = {}): KlineBatchStockResult {
  return {
    stockCode: '000001',
    stockName: '平安银行',
    success: true,
    ...overrides,
  };
}

describe('buildBatchStockResult', () => {
  it('双复权均返回数据时判定成功并保留各类型条数', () => {
    const result = buildBatchStockResult(
      createDownloadResult({ unadjustedCount: 5, adjustedCount: 7 }),
      '000001',
      '平安银行',
      ['', 'qfq']
    );

    expect(result.success).toBe(true);
    expect(result.unadjustedCount).toBe(5);
    expect(result.adjustedCount).toBe(7);
    expect(result.error).toBeUndefined();
  });

  it('接口未抛错但所有复权类型均返回0条时判定失败', () => {
    const result = buildBatchStockResult(
      createDownloadResult({ unadjustedCount: 0, adjustedCount: 0 }),
      '600519',
      '贵州茅台',
      ['', 'qfq']
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('未获取到K线数据');
  });

  it('只请求前复权且有条数时判定成功，且不写入不复权条数', () => {
    const result = buildBatchStockResult(
      createDownloadResult({ unadjustedCount: 3, adjustedCount: 4 }),
      '510050',
      '上证50ETF',
      ['qfq']
    );

    expect(result.success).toBe(true);
    expect(result.adjustedCount).toBe(4);
    expect(result.unadjustedCount).toBeUndefined();
  });

  it('一种复权失败但另一种有数据时判定成功，同时透传失败原因', () => {
    const result = buildBatchStockResult(
      createDownloadResult({
        unadjustedCount: 0,
        unadjustedError: '接口超时',
        adjustedCount: 6,
        adjustedError: undefined,
      }),
      '300750',
      '宁德时代',
      ['', 'qfq']
    );

    expect(result.success).toBe(true);
    expect(result.unadjustedError).toBe('接口超时');
    expect(result.error).toBeUndefined();
  });

  it('全部复权类型报错时透传合并后的失败原因', () => {
    const result = buildBatchStockResult(
      {
        success: false,
        unadjustedError: '网络错误',
        adjustedError: '限流',
      },
      '000858',
      '五粮液',
      ['', 'qfq']
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('不复权: 网络错误; 前复权: 限流');
  });

  it('接口异常（error 字段）在无具体复权错误时透传', () => {
    const result = buildBatchStockResult(
      { success: false, error: '网络不可用' },
      '159915',
      '创业板ETF',
      ['', 'qfq']
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('网络不可用');
  });
});

describe('buildBatchSummary', () => {
  it('全部成功时汇总成功', () => {
    const summary = buildBatchSummary([
      createBatchResult({ stockCode: '000001' }),
      createBatchResult({ stockCode: '600519' }),
    ]);

    expect(summary.success).toBe(true);
    expect(summary.total).toBe(2);
    expect(summary.successCount).toBe(2);
    expect(summary.failedCount).toBe(0);
    expect(summary.results).toHaveLength(2);
  });

  it('部分失败时汇总成功与失败只数', () => {
    const summary = buildBatchSummary([
      createBatchResult({ stockCode: '000001' }),
      createBatchResult({ stockCode: '600519', success: false, error: '未获取到K线数据' }),
      createBatchResult({ stockCode: '510050', success: false, error: '接口超时' }),
      createBatchResult({ stockCode: '159915' }),
    ]);

    expect(summary.success).toBe(false);
    expect(summary.total).toBe(4);
    expect(summary.successCount).toBe(2);
    expect(summary.failedCount).toBe(2);
  });

  it('全部失败时汇总失败', () => {
    const summary = buildBatchSummary([
      createBatchResult({ success: false, error: '未获取到K线数据' }),
      createBatchResult({ stockCode: '600519', success: false, error: '接口超时' }),
    ]);

    expect(summary.success).toBe(false);
    expect(summary.successCount).toBe(0);
    expect(summary.failedCount).toBe(2);
  });

  it('空结果时总数为0', () => {
    const summary = buildBatchSummary([]);

    expect(summary.total).toBe(0);
    expect(summary.successCount).toBe(0);
    expect(summary.failedCount).toBe(0);
    expect(summary.results).toEqual([]);
  });
});

describe('validateBatchDownloadInput', () => {
  it('合法参数不抛错', () => {
    expect(() =>
      validateBatchDownloadInput(['000001', '600519', '510050'], '20240101', '20240131', ['', 'qfq'])
    ).not.toThrow();
  });

  it('股票列表为空时整批拒绝', () => {
    expect(() => validateBatchDownloadInput([], '20240101', '20240131')).toThrow('INVALID_STOCK_CODES');
  });

  it('复权类型为空数组时整批拒绝', () => {
    expect(() =>
      validateBatchDownloadInput(['000001'], '20240101', '20240131', [])
    ).toThrow('INVALID_ADJUST_TYPES');
  });

  it('开始日期晚于结束日期时整批拒绝', () => {
    expect(() =>
      validateBatchDownloadInput(['000001'], '20240201', '20240101', ['', 'qfq'])
    ).toThrow('INVALID_DATE_RANGE');
  });

  it('结束日期晚于当前日期时整批拒绝', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');

    expect(() =>
      validateBatchDownloadInput(['000001'], '20240101', future, ['', 'qfq'])
    ).toThrow('INVALID_DATE_RANGE');
  });

  it('包含非法证券代码时整批拒绝', () => {
    expect(() =>
      validateBatchDownloadInput(['000001', 'AAPL'], '20240101', '20240131', ['', 'qfq'])
    ).toThrow('INVALID_STOCK_CODE');

    expect(() =>
      validateBatchDownloadInput(['000001', '00700'], '20240101', '20240131', ['', 'qfq'])
    ).toThrow('INVALID_STOCK_CODE');
  });
});
