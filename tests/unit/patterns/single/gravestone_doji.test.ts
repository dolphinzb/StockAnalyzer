import { describe, it, expect } from 'vitest';
import { gravestone_doji } from '../../../../shared/patterns/single/gravestone_doji';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('gravestone_doji', () => {
  it('hits when upper shadow long + lower short in uptrend (positive)', () => {
    // open=close=10, high=15, low=10.1 → upper=5, lower=0.1
    // upper/range=5/4.9 ≈ 100% ≥ 60%, lower/range≈2% > 5%? 这里 lower=0.1 < 0.05*4.9=0.245 → 通过
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 15, 10, 10),
    );
    const hit = gravestone_doji.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when upper shadow not long enough (geometric negative)', () => {
    // upper=0.4/2 = 20% < 60%
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.4, 9.6, 10),
    );
    expect(gravestone_doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    // 同样几何，但趋势为下跌
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 15, 10, 10),
    );
    expect(gravestone_doji.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});