import { describe, expect, it } from 'vitest';
import { three_black_crows } from '../../../../shared/patterns/triple/three_black_crows';
import { makeCtx, mkCandle, mkSequence, mkUptrend } from '../_helpers';

describe('three_black_crows', () => {
  /**
   * 几何条件：
   *   - 连续三根阴线
   *   - 每根开盘在前一根实体范围内
   *   - 每根收盘低于前一根
   * 趋势：up 或 down（consistent）
   */
  it('hits when 3 bearish with opens inside previous body and closes descending (positive)', () => {
    // first: open=20, close=19.5（range=0.5, tolerance=0.05, [19.45, 20.05]）
    // second: open=19.9, close=19.45（[19.45, 19.9] ⊂ first, close < 19.5 ✓）
    //   bMin=19.45, bRange=0.45, toleranceB=0.045，下界=19.405
    // third: open=19.5, close=19.41（cMin=19.41 ≥ 19.405 ✓，close < 19.45 ✓，body=0.09>0 ✓）
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.1, 19.4, 19.5),
      mkCandle(19.9, 19.95, 19.4, 19.45),
      mkCandle(19.5, 19.55, 19.4, 19.41),
    );
    const hit = three_black_crows.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
    expect(hit!.code).toBe('three_black_crows');
  });

  it('misses when third close does not descend below second close', () => {
    // third.close=19.46 > second.close=19.45
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.1, 19.4, 19.5),
      mkCandle(19.9, 19.95, 19.4, 19.45),
      mkCandle(19.5, 19.55, 19.4, 19.46),
    );
    expect(three_black_crows.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when one of the three is not bearish', () => {
    // second 是阳线
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.1, 19.4, 19.5),
      mkCandle(19.5, 19.6, 19.4, 19.55),
      mkCandle(19.5, 19.55, 19.35, 19.4),
    );
    expect(three_black_crows.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});