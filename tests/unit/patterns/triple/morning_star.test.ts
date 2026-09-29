import { describe, expect, it } from 'vitest';
import { morning_star } from '../../../../shared/patterns/triple/morning_star';
import { makeCtx, mkCandle, mkDowntrend, mkSequence } from '../_helpers';

describe('morning_star', () => {
  /**
   * 几何条件：
   *   - 第一根长阴
   *   - 第二根小实体（星形）
   *   - 第三根长阳收盘深入第一根实体中部以上
   * 趋势：下跌后（down）
   */
  it('hits when long bearish + small star + bullish deep into first body in downtrend (positive)', () => {
    // first 阴线：open=10, close=9.5（body=0.5，mid=9.75）
    // mid 星形：open=9.48, close=9.52（body=0.04>0，range=0.4，body/range=0.1<0.3）
    // last 阳线：open=9.55, close=9.90（>mid=9.75，penetration=(9.90-9.75)/(10-9.75)=0.6 ≥ 0.5）
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.48, 9.7, 9.3, 9.52),
      mkCandle(9.55, 10.0, 9.5, 9.9),
    );
    const hit = morning_star.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('morning_star');
    expect(hit!.startIndex).toBe(candles.length - 3);
    expect(hit!.endIndex).toBe(candles.length - 1);
  });

  it('misses when third bullish does not penetrate deep enough (geometric negative)', () => {
    // third close 9.74 ≤ mid=9.75 → penetration=0
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.48, 9.7, 9.3, 9.52),
      mkCandle(9.55, 9.8, 9.5, 9.74),
    );
    expect(morning_star.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    // 强制 trend='up'，使 detector 的 trendMatches(down) 失败
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.48, 9.7, 9.3, 9.52),
      mkCandle(9.55, 10.0, 9.5, 9.9),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    expect(morning_star.detector(ctx)).toBeNull();
  });
});