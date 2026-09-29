import { describe, expect, it } from 'vitest';
import { bullish_abandoned_baby } from '../../../../shared/patterns/triple/bullish_abandoned_baby';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('bullish_abandoned_baby', () => {
  /**
   * 几何条件：
   *   - 第一根阴线
   *   - 第二根十字星，向下跳空（mid.high < first.low）
   *   - 第三根阳线，向上跳空（last.low > mid.high）
   * 趋势：下跌后（down）
   */
  it('hits when bearish + doji gap-down + bullish gap-up in downtrend (positive)', () => {
    // first 阴线：open=10, close=9.5, low=9.4, body=0.5
    // mid doji：open=close=9.0, high=9.1, low=8.9，high=9.1 < first.low=9.4 ✓ gap-down
    // last 阳线：open=9.2, close=9.7, low=9.15 > mid.high=9.1 ✓ gap-up
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.0, 9.1, 8.9, 9.0),
      mkCandle(9.2, 9.8, 9.15, 9.7),
    );
    const hit = bullish_abandoned_baby.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('bullish_abandoned_baby');
  });

  it('misses when middle candle does not gap down (geometric negative)', () => {
    // mid 与 first 实体有重叠，无跳空：mid.high=9.5 > first.low=9.4
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.3, 9.5, 9.2, 9.3),
      mkCandle(9.5, 9.9, 9.45, 9.7),
    );
    expect(bullish_abandoned_baby.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    // 强制 trend='up'：mkUptrend(20) 末值 ~20，但 3 根低位蜡烛令最近 MA 翻为 down，
    // 不强制的话 detector 的 trendMatches('down') 会通过 → 命中
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.0, 9.1, 8.9, 9.0),
      mkCandle(9.2, 9.8, 9.15, 9.7),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    expect(bullish_abandoned_baby.detector(ctx)).toBeNull();
  });
});