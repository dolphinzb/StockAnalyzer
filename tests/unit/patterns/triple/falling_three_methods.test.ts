import { describe, expect, it } from 'vitest';
import { falling_three_methods } from '../../../../shared/patterns/triple/falling_three_methods';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('falling_three_methods', () => {
  /**
   * 几何条件（5 根 K 线）：
   *   - 第一根：长阴线（body/range ≥ 0.6）
   *   - 中间三根：小阳线，实体 ≤ first.body * 0.5，high/low 在 first 实体范围内
   *   - 第五根：长阴线，收盘 < first.close
   * 趋势：下跌中（down）
   */
  it('hits when long bearish + 3 small bullish inside first body + long bearish breakdown in downtrend (positive)', () => {
    // first: open=20, close=19, body=1, high=20.2, low=18.8, range=1.4, body/range=0.71
    // first 实体范围 [19, 20]
    // m1/m2/m3: 小阳线，open=19.5, close=19.6（body=0.1），high=19.7, low=19.4（high≤20, low≥19 ✓）
    // last: open=18.95, close=18.5 < first.close=19 ✓
    // 强制 trend='down'（mkDowntrend(20) 末值 ~10，5 根 19 左右高位蜡烛令最近 MA 翻为 up）
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 20.2, 18.8, 19),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(18.95, 19.05, 18.4, 18.5),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'down', ma5: 18, ma10: 19 };
    const hit = falling_three_methods.detector(ctx);
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
    expect(hit!.code).toBe('falling_three_methods');
    expect(hit!.startIndex).toBe(candles.length - 5);
    expect(hit!.endIndex).toBe(candles.length - 1);
  });

  it('misses when middle candles drop below first low', () => {
    // m1.low=18.5 < first.low=18.8
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 20.2, 18.8, 19),
      mkCandle(19.5, 19.7, 18.5, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(18.95, 19.05, 18.4, 18.5),
    );
    expect(falling_three_methods.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when last close does not drop below first close', () => {
    // last.close=19.1 ≥ first.close=19
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 20.2, 18.8, 19),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.05, 18.95, 19.1, 19.1),
    );
    expect(falling_three_methods.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.2, 18.8, 19),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(19.5, 19.7, 19.4, 19.6),
      mkCandle(18.95, 19.05, 18.4, 18.5),
    );
    expect(falling_three_methods.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});