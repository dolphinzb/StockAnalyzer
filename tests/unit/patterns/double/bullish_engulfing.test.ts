import { describe, it, expect } from 'vitest';
import { bullish_engulfing } from '../../../../shared/patterns/double/bullish_engulfing';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('bullish_engulfing', () => {
  it('hits when bearish + larger bullish that fully covers in downtrend (positive)', () => {
    // prev: open=10, close=9 (阴线 body=1)
    // curr: open=8.5, close=10.5 (阳线 body=2 → ratio=2 ≥ 1.5)
    // curr 实体 [8.5, 10.5], prev 实体 [9, 10] → curr 完全包住
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9, 9), // 阴线
      mkCandle(8.5, 10.6, 8.4, 10.5), // 阳线，吞没前一根
    );
    const hit = bullish_engulfing.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when curr body too small (geometric negative)', () => {
    // prev body=1, curr body=1.1 → ratio=1.1 < 1.5
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9, 9),
      mkCandle(8.5, 10.6, 8.4, 9.6),
    );
    expect(bullish_engulfing.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative — would be bearish_engulfing)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.1, 9, 9),
      mkCandle(8.5, 10.6, 8.4, 10.5),
    );
    expect(bullish_engulfing.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});