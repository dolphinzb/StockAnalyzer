import { describe, it, expect } from 'vitest';
import { piercing_pattern } from '../../../../shared/patterns/double/piercing_pattern';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('piercing_pattern', () => {
  it('hits when bullish gaps down below prev low and closes above mid in downtrend (positive)', () => {
    // prev: open=12, close=10 (阴线 mid=11)
    // curr: open=9.5 (<10 ✓ gap down), close=11.6 (>11 ✓), close<prev.open(12) ✓
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 9.9, 10),
      mkCandle(9.5, 11.7, 9.4, 11.6),
    );
    const hit = piercing_pattern.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when no gap down (geometric negative)', () => {
    // curr.open=10 ≥ prev.low=9.9 → no gap
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 9.9, 10),
      mkCandle(10, 11.7, 9.9, 11.6),
    );
    expect(piercing_pattern.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(12, 12.1, 9.9, 10),
      mkCandle(9.5, 11.7, 9.4, 11.6),
    );
    expect(piercing_pattern.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});