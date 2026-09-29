import { describe, it, expect } from 'vitest';
import { dark_cloud_cover } from '../../../../shared/patterns/double/dark_cloud_cover';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('dark_cloud_cover', () => {
  it('hits when bearish gaps up above prev high and closes below mid in uptrend (positive)', () => {
    // prev: open=10, close=12, high=12.1, low=9.9 (阳线)
    // curr: open=12.5 (>12.1 ✓ gap up), close=10.4 (<mid=11 ✓), close>prev.open(10) ✓
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12.1, 9.9, 12),
      mkCandle(12.5, 12.6, 10.3, 10.4),
    );
    const hit = dark_cloud_cover.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when no gap up (geometric negative)', () => {
    // curr.open=11 < prev.high=12.1 → no gap
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12.1, 9.9, 12),
      mkCandle(11, 11.1, 10.3, 10.4),
    );
    expect(dark_cloud_cover.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative — would be piercing)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 12.1, 9.9, 12),
      mkCandle(12.5, 12.6, 10.3, 10.4),
    );
    expect(dark_cloud_cover.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});