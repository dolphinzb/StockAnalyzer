import { describe, it, expect } from 'vitest';
import { inverted_hammer } from '../../../../shared/patterns/single/inverted_hammer';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('inverted_hammer', () => {
  it('hits when upper shadow ≥ 2x body in downtrend (positive)', () => {
    // body=0.5, upper=1, lower=0.1 → upper/body=2, lower/body=0.2
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 11.5, 9.9, 10.5),
    );
    const hit = inverted_hammer.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when upper shadow too short (geometric negative)', () => {
    // upper/body=0.5 < 2
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.5, 9.5, 10.5),
    );
    expect(inverted_hammer.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative — would be shooting_star)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 11.5, 9.9, 10.5),
    );
    expect(inverted_hammer.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});