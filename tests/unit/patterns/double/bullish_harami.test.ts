import { describe, it, expect } from 'vitest';
import { bullish_harami } from '../../../../shared/patterns/double/bullish_harami';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('bullish_harami', () => {
  it('hits when small bullish inside bearish body in downtrend (positive)', () => {
    // prev: open=12, close=9 (阴线 body=3, 实体 [9, 12])
    // curr: open=10, close=10.5 (阳线 body=0.5 → ratio=0.5/3=0.167 ≤ 0.5)
    // curr 实体 [10, 10.5] 完全在 prev 实体 [9, 12] 内
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 8.9, 9),
      mkCandle(10, 10.6, 9.9, 10.5),
    );
    const hit = bullish_harami.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when curr body too large (geometric negative)', () => {
    // curr body=2 → ratio=2/3=0.67 > 0.5
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 8.9, 9),
      mkCandle(9.5, 11.6, 9.4, 11.5),
    );
    expect(bullish_harami.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(12, 12.1, 8.9, 9),
      mkCandle(10, 10.6, 9.9, 10.5),
    );
    expect(bullish_harami.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});