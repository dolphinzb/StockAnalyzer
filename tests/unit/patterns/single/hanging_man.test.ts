import { describe, it, expect } from 'vitest';
import { hanging_man } from '../../../../shared/patterns/single/hanging_man';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('hanging_man', () => {
  it('hits when lower shadow ≥ 2x body in uptrend (positive)', () => {
    // body=0.5, lower=1, upper=0.1
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9, 10.5),
    );
    const hit = hanging_man.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when upper shadow too long (geometric negative)', () => {
    // upper/body=1.5 > 0.5 → not a hammer-style
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12, 9, 10.5),
    );
    expect(hanging_man.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative — would be hammer)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.6, 9, 10.5),
    );
    expect(hanging_man.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});