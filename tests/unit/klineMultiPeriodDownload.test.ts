import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 数据源状态：
 * - queue：key = `${period}:${adjust}`，按调用顺序消费；未配置时返回 1 条
 * - 队列值 < 0 表示该次调用抛错
 * - calls：记录实际调用顺序，用于验证「周期顺序」与「重试只重试失败周期」
 */
const sdkState = vi.hoisted(() => ({
  queue: new Map<string, number[]>(),
  calls: [] as { period: string; adjust: string }[],
}));

/** 记录 saveKlineData 的写入周期与条数 */
const savedCalls = vi.hoisted(() => [] as { period: string; adjust: string; count: number }[]);

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
    async getHistoryKline(_code: string, options: { period: string; adjust: string }) {
      const key = `${options.period}:${options.adjust}`;
      sdkState.calls.push({ period: options.period, adjust: options.adjust });

      const list = sdkState.queue.get(key);
      const count = list && list.length > 0 ? list.shift()! : 1;
      if (count < 0) {
        throw new Error('接口异常');
      }

      return Array.from({ length: count }, (_, index) => ({ date: `2026-11-${String(index + 1).padStart(2, '0')}` }));
    }

    async getTradingCalendar() {
      return [];
    }
  },
}));

vi.mock('../../electron/database', () => ({
  getWatchlist: () => [],
  saveKlineData: (_code: string, klines: unknown[], adjust: string, period: string) => {
    savedCalls.push({ period, adjust, count: klines.length });
    return klines.length;
  },
  getChartData: () => [],
  getLatestTradeDates: () => new Map(),
}));

import {
  buildBatchStockResult,
  downloadBatch,
  downloadKline,
  downloadWithRetry
} from '../../electron/services/klineDownloadService';
import type { KlineBatchProgressPayload } from '../../shared/types';

/**
 * 设置某个「周期 + 复权」组合的返回条数序列（按调用顺序消费）
 * @param period stock-sdk 周期参数（daily / weekly / monthly）
 * @param adjust 复权类型
 * @param counts 每次调用返回的条数（负数表示抛错）
 */
function queueCounts(period: 'daily' | 'weekly' | 'monthly', adjust: '' | 'qfq', counts: number[]): void {
  sdkState.queue.set(`${period}:${adjust}`, [...counts]);
}

beforeEach(() => {
  sdkState.queue.clear();
  sdkState.calls.length = 0;
  savedCalls.length = 0;
});

describe('downloadKline：多周期', () => {
  it('按 日线 → 周线 顺序执行并聚合条数（与入参顺序无关）', async () => {
    queueCounts('daily', '', [5]);
    queueCounts('daily', 'qfq', [5]);
    queueCounts('weekly', '', [1]);
    queueCounts('weekly', 'qfq', [1]);

    // 入参故意乱序：周线在前
    const result = await downloadKline('000001', '20261101', '20261125', ['', 'qfq'], ['w', 'd']);

    expect(result.success).toBe(true);
    expect(result.periods).toEqual(['d', 'w']);
    expect(result.byPeriod?.map(item => item.period)).toEqual(['d', 'w']);
    expect(result.unadjustedCount).toBe(6);
    expect(result.adjustedCount).toBe(6);

    // 每个周期内按复权类型顺序调用，且周期顺序固定
    expect(sdkState.calls.map(call => call.period)).toEqual(['daily', 'daily', 'weekly', 'weekly']);
    expect(savedCalls.map(call => call.period)).toEqual(['d', 'd', 'w', 'w']);
  });

  it('未选择复权类型对应条数时不写入该类型合计', async () => {
    queueCounts('daily', 'qfq', [3]);

    const result = await downloadKline('510050', '20261101', '20261125', ['qfq'], ['d']);

    expect(result.success).toBe(true);
    expect(result.adjustedCount).toBe(3);
    expect(result.unadjustedCount).toBeUndefined();
  });

  it('某周期返回 0 条时该周期失败，股票整体失败并给出周期前缀', async () => {
    queueCounts('daily', '', [4]);
    queueCounts('daily', 'qfq', [4]);
    queueCounts('weekly', '', [0]);
    queueCounts('weekly', 'qfq', [0]);

    const result = await downloadKline('600519', '20261101', '20261125', ['', 'qfq'], ['d', 'w']);

    expect(result.success).toBe(false);
    expect(result.byPeriod?.find(item => item.period === 'd')?.success).toBe(true);
    expect(result.byPeriod?.find(item => item.period === 'w')?.success).toBe(false);
    expect(result.error).toBe('周线: 未获取到K线数据');
  });

  it('周期数组去重且非法值被过滤', async () => {
    queueCounts('daily', '', [2]);
    queueCounts('daily', 'qfq', [2]);

    const result = await downloadKline('000001', '20261101', '20261125', ['', 'qfq'], ['d', 'd', 'd']);

    expect(result.periods).toEqual(['d']);
    expect(sdkState.calls).toHaveLength(2);
  });
});

describe('downloadWithRetry：只重试失败周期', () => {
  it('日线成功后不再重复请求，周线失败重试一次后成功', async () => {
    queueCounts('daily', '', [5]);
    queueCounts('daily', 'qfq', [5]);
    // 首次两个复权都返回 0 条（周线周期失败），重试时各返回 1 条
    queueCounts('weekly', '', [0, 1]);
    queueCounts('weekly', 'qfq', [0, 1]);

    const result = await downloadWithRetry('000001', '20261101', '20261125', ['', 'qfq'], ['d', 'w']);

    expect(result.success).toBe(true);
    expect(result.byPeriod?.find(item => item.period === 'w')?.success).toBe(true);

    const dailyCalls = sdkState.calls.filter(call => call.period === 'daily');
    const weeklyCalls = sdkState.calls.filter(call => call.period === 'weekly');
    // 日线只跑首次（2 次），周线跑首次 + 重试（4 次）
    expect(dailyCalls).toHaveLength(2);
    expect(weeklyCalls).toHaveLength(4);
  });

  it('重试后仍失败时保留首次成功的周期结果', async () => {
    queueCounts('daily', '', [3]);
    queueCounts('daily', 'qfq', [3]);
    queueCounts('weekly', '', [0, 0]);
    queueCounts('weekly', 'qfq', [0, 0]);

    const result = await downloadWithRetry('000001', '20261101', '20261125', ['', 'qfq'], ['d', 'w']);

    expect(result.success).toBe(false);
    expect(result.byPeriod?.find(item => item.period === 'd')?.unadjustedCount).toBe(3);
    expect(result.error).toContain('周线');
  });
});

describe('downloadBatch：多周期进度与汇总', () => {
  it('进度事件携带完整周期数组，逐只结果含按周期明细', async () => {
    queueCounts('daily', '', [2]);
    queueCounts('daily', 'qfq', [2]);
    queueCounts('weekly', '', [1]);
    queueCounts('weekly', 'qfq', [1]);

    const progress: KlineBatchProgressPayload[] = [];
    const summary = await downloadBatch(
      [{ stockCode: '000001', stockName: '平安银行' }],
      '20261101',
      '20261125',
      ['', 'qfq'],
      ['d', 'w'],
      { onProgress: payload => progress.push(payload) }
    );

    expect(summary.success).toBe(true);
    expect(summary.successCount).toBe(1);
    expect(progress[0].phase).toBe('started');
    expect(progress[0].periods).toEqual(['d', 'w']);
    expect(progress[1].periods).toEqual(['d', 'w']);
    expect(summary.results[0].periods).toEqual(['d', 'w']);
    expect(summary.results[0].byPeriod?.map(item => item.period)).toEqual(['d', 'w']);
  });
});

describe('buildBatchStockResult：全周期成功判定', () => {
  it('所有所选周期均成功才算成功', () => {
    const result = buildBatchStockResult(
      {
        success: true,
        periods: ['d', 'w'],
        byPeriod: [
          { period: 'd', success: true, unadjustedCount: 3, adjustedCount: 3 },
          { period: 'w', success: true, unadjustedCount: 1, adjustedCount: 1 },
        ],
      },
      '000001',
      '平安银行',
      ['', 'qfq'],
      ['d', 'w']
    );

    expect(result.success).toBe(true);
    expect(result.periods).toEqual(['d', 'w']);
    expect(result.unadjustedCount).toBe(4);
    expect(result.adjustedCount).toBe(4);
    expect(result.period).toBeUndefined();
  });

  it('任一周期失败则整体失败，失败原因带周期前缀', () => {
    const result = buildBatchStockResult(
      {
        success: false,
        periods: ['d', 'w'],
        byPeriod: [
          { period: 'd', success: true, unadjustedCount: 3, adjustedCount: 3 },
          { period: 'w', success: false, error: '未获取到K线数据' },
        ],
      },
      '600519',
      '贵州茅台',
      ['', 'qfq'],
      ['d', 'w']
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('周线: 未获取到K线数据');
  });

  it('缺少按周期明细时全部按失败兜底，不误判成功', () => {
    const result = buildBatchStockResult(
      { success: false, error: '网络不可用' },
      '159915',
      '创业板ETF',
      ['', 'qfq'],
      ['d']
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('日线: 网络不可用');
  });
});
