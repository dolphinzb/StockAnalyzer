import { describe, it, expect } from 'vitest';
import { dragonfly_doji } from '../../../../shared/patterns/single/dragonfly_doji';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('dragonfly_doji', () => {
  it('hits when lower shadow long + upper short in downtrend (positive)', () => {
    // open=close=10, high=10.1, low=5
    // lower=5, upper=0.1, range=5.1
    // lower/range≈98% ≥ 60%, upper/range≈2% < 5%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 5, 10),
    );
    const hit = dragonfly_doji.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when lower shadow not long enough (geometric negative)', () => {
    // lower=0.5, upper=0.5, range=2 → lower/range=25% < 60%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.5, 9.5, 10),
    );
    expect(dragonfly_doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.1, 5, 10),
    );
    expect(dragonfly_doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});