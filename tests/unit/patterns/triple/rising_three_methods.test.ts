import { describe, expect, it } from 'vitest';
import { rising_three_methods } from '../../../../shared/patterns/triple/rising_three_methods';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('rising_three_methods', () => {
  /**
   * 几何条件（5 根 K 线）：
   *   - 第一根：长阳线（body/range ≥ 0.6）
   *   - 中间三根：小阴线，实体 ≤ first.body * 0.5，且 high/low 在 first 实体范围内
   *   - 第五根：长阳线，收盘 > first.close
   * 趋势：上升中（up）
   */
  it('hits when long bullish + 3 small bearish inside first body + long bullish breakout in uptrend (positive)', () => {
    // first: open=20, close=21, body=1, high=21.2, low=19.8, range=1.4, body/range=0.71
    // first 实体范围 [20, 21]
    // m1/m2/m3: 小阴线，open=20.5, close=20.4（body=0.1），high=20.6, low=20.3（high≤21, low≥20 ✓
    // last: open=21.05, close=21.5 > first.close=21 ✓
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(21.05, 21.6, 21.0, 21.5),
    );
    const hit = rising_three_methods.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('rising_three_methods');
    expect(hit!.startIndex).toBe(candles.length - 5);
    expect(hit!.endIndex).toBe(candles.length - 1);
  });

  it('misses when middle candles exceed first body (high above first.high)', () => {
    // m1.high=21.5 > first.high=21.2
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(20.5, 21.5, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(21.05, 21.6, 21.0, 21.5),
    );
    expect(rising_three_methods.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when last close does not exceed first close', () => {
    // last.close=21.0 ≤ first.close=21
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(21.0, 21.2, 20.95, 21.0),
    );
    expect(rising_three_methods.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    // 强制 trend='down'：mkDowntrend(20) 末值 ~10，但 5 根 21 左右高位蜡烛令最近 MA 翻为 up，
    // 不强制的话 detector 的 trendMatches('up') 会通过 → 命中
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(20.5, 20.6, 20.3, 20.4),
      mkCandle(21.05, 21.6, 21.0, 21.5),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'down', ma5: 21, ma10: 21 };
    expect(rising_three_methods.detector(ctx)).toBeNull();
  });
});