import { describe, it, expect } from 'vitest';
import { marubozu } from '../../../../shared/patterns/single/marubozu';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('marubozu', () => {
  it('hits when bullish candle has body ≥ 90% of range (positive)', () => {
    // open=10, close=12, high=12.1, low=9.9 → body=2, range=2.2 → 90.9%
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12.1, 9.9, 12),
    );
    const hit = marubozu.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when body too small (geometric negative)', () => {
    // body=1, range=4 → 25%
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12, 8, 11),
    );
    expect(marubozu.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is flat (trend negative — required consistent)', () => {
    // 几何合规但趋势为 flat
    const flatTrend: ReturnType<typeof makeCtx>[] = [];
    const candles = mkSequence(
      ...Array.from({ length: 20 }, () => mkCandle(10, 10.1, 9.9, 10)), // 横向
      mkCandle(10, 12.1, 9.9, 12),
    );
    expect(marubozu.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});