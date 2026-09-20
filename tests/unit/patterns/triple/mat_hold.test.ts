import { describe, expect, it } from 'vitest';
import { mat_hold } from '../../../../shared/patterns/triple/mat_hold';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('mat_hold', () => {
  /**
   * 几何条件（5 根 K 线）：
   *   - 第一根：长阳线（body/range ≥ 0.6）
   *   - 第二根：阳线，close ≥ first.close * 0.99
   *   - 中间两根（m1/m2）：小阴线，body ≤ first.body * 0.4
   *   - 第五根：长阳线，close > max(first.close, second.close, m1.close, m2.close)
   * 趋势：上升中（up）
   */
  it('hits when long bullish + bullish continuation + 2 small bearish + bullish breakout in uptrend (positive)', () => {
    // first: open=20, close=21, body=1, range=1.4 (high=21.2, low=19.8), body/range=0.71
    // second: open=21, close=21.05（阳线，close ≥ 21*0.99=20.79 ✓）
    // m1: open=21.05, close=20.85（body=0.2, ≤ 0.4 ✓）
    // m2: open=20.85, close=20.65（body=0.2 ✓）
    // last: open=21.2, close=21.5 > max(21, 21.05, 20.85, 20.65)=21.05 ✓
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21, 21.15, 20.95, 21.05),
      mkCandle(21.05, 21.1, 20.8, 20.85),
      mkCandle(20.85, 20.9, 20.6, 20.65),
      mkCandle(21.2, 21.6, 21.1, 21.5),
    );
    const hit = mat_hold.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('mat_hold');
    expect(hit!.startIndex).toBe(candles.length - 5);
    expect(hit!.endIndex).toBe(candles.length - 1);
  });

  it('misses when middle bearish body is too large', () => {
    // m1.body=0.5 > 0.4
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21, 21.15, 20.95, 21.05),
      mkCandle(21.05, 21.6, 20.5, 20.55),
      mkCandle(20.85, 20.9, 20.6, 20.65),
      mkCandle(21.2, 21.6, 21.1, 21.5),
    );
    expect(mat_hold.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when last does not break out above previous closes', () => {
    // last.close=21.05 ≤ max=21.05
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21, 21.15, 20.95, 21.05),
      mkCandle(21.05, 21.1, 20.8, 20.85),
      mkCandle(20.85, 20.9, 20.6, 20.65),
      mkCandle(21.0, 21.1, 20.95, 21.05),
    );
    expect(mat_hold.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    // 强制 trend='down'：mkDowntrend(20) 末值 ~10，但 5 根 21 左右高位蜡烛令最近 MA 翻为 up，
    // 不强制的话 detector 的 trendMatches('up') 会通过 → 命中
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21, 21.15, 20.95, 21.05),
      mkCandle(21.05, 21.1, 20.8, 20.85),
      mkCandle(20.85, 20.9, 20.6, 20.65),
      mkCandle(21.2, 21.6, 21.1, 21.5),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'down', ma5: 21, ma10: 21 };
    expect(mat_hold.detector(ctx)).toBeNull();
  });
});