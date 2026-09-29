import { describe, it, expect } from 'vitest';
import { bearish_harami } from '../../../../shared/patterns/double/bearish_harami';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('bearish_harami', () => {
  it('hits when small bearish inside bullish body in uptrend (positive)', () => {
    // prev: open=9, close=12 (阳线 body=3, 实体 [9, 12])
    // curr: open=11, close=10.5 (阴线 body=0.5 → ratio=0.5/3 ≤ 0.5)
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(9, 12.1, 8.9, 12),
      mkCandle(11, 11.1, 10.4, 10.5),
    );
    const hit = bearish_harami.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when curr body too large (geometric negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(9, 12.1, 8.9, 12),
      mkCandle(9.5, 11.1, 9.4, 11),
    );
    expect(bearish_harami.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(9, 12.1, 8.9, 12),
      mkCandle(11, 11.1, 10.4, 10.5),
    );
    expect(bearish_harami.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});