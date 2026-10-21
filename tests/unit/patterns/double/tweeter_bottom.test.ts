import { describe, it, expect } from 'vitest';
import { tweeter_bottom } from '../../../../shared/patterns/double/tweeter_bottom';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('tweeter_bottom', () => {
  it('hits when two consecutive lows match within 0.1% in downtrend (positive)', () => {
    // prev low=8, curr low=8.005 → diff ≈ 0.0006 < 0.001
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 8, 9),
      mkCandle(9, 9.1, 8.005, 8.5),
    );
    const hit = tweeter_bottom.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when lows differ too much (geometric negative)', () => {
    // prev low=8, curr low=7 → diff=0.125 > 0.001
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 8, 9),
      mkCandle(9, 9.1, 7, 8.5),
    );
    expect(tweeter_bottom.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.1, 8, 9),
      mkCandle(9, 9.1, 8.005, 8.5),
    );
    // 强制 trend='up'（拼入的低价形态蜡烛会令自动趋势翻转为 down，此处验证趋势门禁）
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    expect(tweeter_bottom.detector(ctx)).toBeNull();
  });
});