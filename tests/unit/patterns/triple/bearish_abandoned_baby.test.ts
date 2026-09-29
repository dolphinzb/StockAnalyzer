import { describe, expect, it } from 'vitest';
import { bearish_abandoned_baby } from '../../../../shared/patterns/triple/bearish_abandoned_baby';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('bearish_abandoned_baby', () => {
  /**
   * 几何条件：
   *   - 第一根阳线
   *   - 第二根十字星，向上跳空（mid.low > first.high）
   *   - 第三根阴线，向下跳空（last.high < mid.low）
   * 趋势：上涨后（up）
   */
  it('hits when bullish + doji gap-up + bearish gap-down in uptrend (positive)', () => {
    // first 阳线：open=10, close=10.5, high=10.6, body=0.5
    // mid doji：open=close=10.7, low=10.65, high=10.75，low=10.65 > first.high=10.6 ✓ gap-up
    // last 阴线：open=10.6, close=10.0, high=10.55 < mid.low=10.65 ✓ gap-down
    // 强制 trend='up'（mkUptrend 末值 ~20，3 根低位蜡烛会令 MA 翻为 down）
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.7, 10.75, 10.65, 10.7),
      mkCandle(10.6, 10.55, 9.9, 10.0),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    const hit = bearish_abandoned_baby.detector(ctx);
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
    expect(hit!.code).toBe('bearish_abandoned_baby');
  });

  it('misses when middle candle does not gap up (geometric negative)', () => {
    // mid.low=10.0 ≤ first.high=10.6，无跳空
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.3, 10.35, 10.25, 10.3),
      mkCandle(10.2, 10.15, 9.9, 10.0),
    );
    expect(bearish_abandoned_baby.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.7, 10.75, 10.65, 10.7),
      mkCandle(10.6, 10.55, 9.9, 10.0),
    );
    expect(bearish_abandoned_baby.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});