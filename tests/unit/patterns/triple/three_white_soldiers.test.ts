import { describe, it, expect } from 'vitest';
import { three_white_soldiers } from '../../../../shared/patterns/triple/three_white_soldiers';
import { mkCandle, mkSequence, mkDowntrend, makeCtx } from '../_helpers';

describe('three_white_soldiers', () => {
  /**
   * 几何条件：
   *   - 连续三根阳线
   *   - 每根开盘在前一根实体范围内（容差 OPEN_INSIDE_TOLERANCE=0.1）
   *   - 每根收盘高于前一根
   * 趋势：up 或 down（consistent）
   */
  it('hits when 3 bullish with opens inside previous body and closes ascending (positive)', () => {
    // first: open=10, close=10.5（aRange=0.5, tolerance=0.05, [9.95, 10.55]）
    // second: open=10.1, close=10.55（bRange=0.45, [10.1, 10.55]，bMin ≥ 9.95, bMax ≤ 10.55 ✓）
    // third: open=10.5, close=10.58（toleranceB=0.045, [10.5, 10.58] 在 [10.05, 10.595] 内 ✓，close > 10.55 ✓）
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.1, 10.6, 10.0, 10.55),
      mkCandle(10.5, 10.7, 10.4, 10.58),
    );
    const hit = three_white_soldiers.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('three_white_soldiers');
  });

  it('misses when third close does not exceed second close', () => {
    // third.close=10.50 ≤ second.close=10.55
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.1, 10.6, 10.0, 10.55),
      mkCandle(10.5, 10.7, 10.4, 10.5),
    );
    expect(three_white_soldiers.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when third opens far above second body', () => {
    // third.open=10.7 > second.max+tol=10.595 → 跳空
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.1, 10.6, 10.0, 10.55),
      mkCandle(10.7, 11.0, 10.65, 10.9),
    );
    expect(three_white_soldiers.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});