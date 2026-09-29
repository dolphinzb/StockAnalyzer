import { describe, it, expect } from 'vitest';
import { tweeter_top } from '../../../../shared/patterns/double/tweeter_top';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('tweeter_top', () => {
  it('hits when two consecutive highs match within 0.1% in uptrend (positive)', () => {
    // prev high=12, curr high=12.005 → diff=0.00042 < 0.001
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12, 9.9, 11.5),
      mkCandle(11, 12.005, 10.9, 11.6),
    );
    const hit = tweeter_top.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when highs differ by > 0.1% (geometric negative)', () => {
    // prev high=12, curr high=13 → diff=0.083 > 0.001
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12, 9.9, 11.5),
      mkCandle(11, 13, 10.9, 12.5),
    );
    expect(tweeter_top.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative — would be tweeter_bottom)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 12, 9.9, 11.5),
      mkCandle(11, 12.005, 10.9, 11.6),
    );
    expect(tweeter_top.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});