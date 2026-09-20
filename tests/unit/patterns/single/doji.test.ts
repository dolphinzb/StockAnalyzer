import { describe, it, expect } from 'vitest';
import { doji } from '../../../../shared/patterns/single/doji';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('doji', () => {
  it('hits when open ≈ close (positive)', () => {
    // open=close=10, high=12, low=8, range=4, body=0 → body/range=0 < 0.05
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 12, 8, 10),
    );
    expect(doji.detector(makeCtx(candles, candles.length - 1))).not.toBeNull();
  });

  it('misses when body is too large (geometric negative)', () => {
    // open=10, close=11, body=1, range=4 → 1/4 = 25% > 5%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 12, 8, 11),
    );
    expect(doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('hits in uptrend as well (any trend is OK)', () => {
    // 任意趋势下十字星都应触发
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12, 8, 10),
    );
    expect(doji.detector(makeCtx(candles, candles.length - 1))).not.toBeNull();
  });
});