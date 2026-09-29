import { describe, it, expect } from 'vitest';
import { hammer } from '../../../../shared/patterns/single/hammer';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('hammer', () => {
  it('hits when body small + lower shadow ≥ 2x body in downtrend (positive)', () => {
    // open=close=10, body=0; 用 body=0.5: open=10, close=10.5, low=9, high=10.6
    // body=0.5, lower=1, upper=0.1 → lower/body=2, upper/body=0.2 ≤ 0.5 ✓
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.6, 9, 10.5),
    );
    const hit = hammer.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when lower shadow too short (geometric negative)', () => {
    // body=1, lower=0.5 → 0.5 < 2 × 1
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 11.5, 9.5, 11),
    );
    expect(hammer.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative — would be hanging_man)', () => {
    // 同样几何但趋势为上涨
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9, 10.5),
    );
    expect(hammer.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});