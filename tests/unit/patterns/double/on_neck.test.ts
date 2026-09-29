import { describe, it, expect } from 'vitest';
import { on_neck } from '../../../../shared/patterns/double/on_neck';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('on_neck', () => {
  it('hits when bullish gaps down + closes ≈ prev.close in downtrend (positive)', () => {
    // prev: open=12, close=11 (阴线 body=1, low=10.9)
    // curr: open=10.5 (<10.9 ✓ gap), close=11.005 (diff=0.00045 < 0.005 ✓)
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 11.2, 10.4, 11.005),
    );
    const hit = on_neck.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when no gap down (geometric negative)', () => {
    // curr.open=11 ≥ prev.low=10.9 → no gap
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(11, 11.5, 10.9, 11.005),
    );
    expect(on_neck.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when close differs too much (geometric negative)', () => {
    // curr.close=12 → diff=1/11=9% > 0.5%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 12.2, 10.4, 12),
    );
    expect(on_neck.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 11.2, 10.4, 11.005),
    );
    expect(on_neck.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});