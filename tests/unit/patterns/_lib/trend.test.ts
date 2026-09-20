import { describe, it, expect } from 'vitest';
import type { KlineData, TrendInfo } from '../../../../shared/types';
import { computeTrend, computeMA } from '../../../../shared/patterns/_lib/trend';

/**
 * 生成测试用 K 线数据
 * @param closes 收盘价序列（按日期升序）
 */
function buildCandles(closes: number[]): KlineData[] {
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return {
      id: i + 1,
      stockCode: '000001',
      tradeDate: `2024-01-${(i + 1).toString().padStart(2, '0')}`,
        adjustType: '',
        open,
        close,
        high: Math.max(open, close) + 0.1,
        low: Math.min(open, close) - 0.1,
        volume: 1000,
        amount: 1000,
        amplitude: 0,
        changePercent: 0,
        changeAmount: 0,
        turnoverRate: 0,
        createdAt: '',
        updatedAt: '',
      };
    });
}

describe('shared/patterns/_lib/trend', () => {
  describe('computeMA', () => {
    it('returns null when values length < period', () => {
      expect(computeMA([1, 2, 3], 5)).toBeNull();
    });

    it('computes the last N values average when length == period', () => {
      expect(computeMA([1, 2, 3, 4, 5], 5)).toBe(3);
    });

    it('computes the last N values average when length > period', () => {
      // 5 个数据，period=3 → 取最后 3 个 (3,4,5) → 平均 4
      expect(computeMA([1, 2, 3, 4, 5], 3)).toBe(4);
    });
  });

  describe('computeTrend', () => {
    it('returns flat when candles length < 20', () => {
      const candles = buildCandles(Array.from({ length: 15 }, (_, i) => 10 + i));
      const trend = computeTrend(candles, 14);
      expect(trend.direction).toBe('flat');
    });

    it('detects up trend when MA5 > MA10 and price rising', () => {
      // 价格持续上涨 25 根，MA5 > MA10，10 根前 close 小于当前
      const closes: number[] = [];
      for (let i = 0; i < 25; i++) closes.push(10 + i * 0.5);
      const candles = buildCandles(closes);
      const trend: TrendInfo = computeTrend(candles, 24);
      expect(trend.direction).toBe('up');
      expect(trend.ma5).toBeGreaterThan(trend.ma10);
    });

    it('detects down trend when MA5 < MA10 and price falling', () => {
      const closes: number[] = [];
      for (let i = 0; i < 25; i++) closes.push(20 - i * 0.5);
      const candles = buildCandles(closes);
      const trend = computeTrend(candles, 24);
      expect(trend.direction).toBe('down');
      expect(trend.ma5).toBeLessThan(trend.ma10);
    });

    it('returns flat when MA5 ≈ MA10 but price moves sideways', () => {
      // 维持 10 元：MA5 ≈ MA10，且 10 根前收盘等于当前收盘
      const closes = Array.from({ length: 25 }, () => 10);
      const candles = buildCandles(closes);
      const trend = computeTrend(candles, 24);
      expect(trend.direction).toBe('flat');
    });

    it('returns flat when index is out of range', () => {
      const candles = buildCandles(Array.from({ length: 25 }, (_, i) => 10 + i));
      expect(computeTrend(candles, -1).direction).toBe('flat');
      expect(computeTrend(candles, 99).direction).toBe('flat');
    });
  });
});