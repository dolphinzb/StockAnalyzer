import { describe, it, expect } from 'vitest';
import { long_legged_doji } from '../../../../shared/patterns/single/long_legged_doji';
import { mkCandle, mkSequence, mkDowntrend, makeCtx } from '../_helpers';

describe('long_legged_doji', () => {
  it('hits when both shadows are long (positive)', () => {
    // open=close=10, high=13, low=7, range=6, body=0
    // upper shadow=3, lower shadow=3 → 各占总长 50% ≥ 30%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 13, 7, 10),
    );
    expect(long_legged_doji.detector(makeCtx(candles, candles.length - 1))).not.toBeNull();
  });

  it('misses when upper shadow is too short (geometric negative)', () => {
    // upper=0.5/4 = 12.5% < 30%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.5, 7, 10),
    );
    expect(long_legged_doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when body too large (geometric negative)', () => {
    // body=2 → 2/6 = 33% > 5%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 13, 7, 12),
    );
    expect(long_legged_doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});