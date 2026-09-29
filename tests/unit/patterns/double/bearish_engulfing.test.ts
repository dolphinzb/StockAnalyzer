import { describe, it, expect } from 'vitest';
import { bearish_engulfing } from '../../../../shared/patterns/double/bearish_engulfing';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('bearish_engulfing', () => {
  it('hits when bullish + larger bearish that fully covers in uptrend (positive)', () => {
    // prev: open=10, close=11 (阳线 body=1)
    // curr: open=11.5, close=9.5 (阴线 body=2 → ratio=2 ≥ 1.5)
    // curr 实体 [9.5, 11.5], prev 实体 [10, 11] → curr 完全包住
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 11.1, 9.9, 11),
      mkCandle(11.5, 11.6, 9.4, 9.5),
    );
    const hit = bearish_engulfing.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when curr body too small (geometric negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 11.1, 9.9, 11),
      mkCandle(11.5, 11.6, 10.4, 10.5),
    );
    expect(bearish_engulfing.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 11.1, 9.9, 11),
      mkCandle(11.5, 11.6, 9.4, 9.5),
    );
    expect(bearish_engulfing.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});