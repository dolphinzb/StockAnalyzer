import { describe, expect, it } from 'vitest';
import { evening_star } from '../../../../shared/patterns/triple/evening_star';
import { makeCtx, mkCandle, mkSequence, mkUptrend } from '../_helpers';

describe('evening_star', () => {
  /**
   * 几何条件：
   *   - 第一根长阳
   *   - 第二根小实体（星形）
   *   - 第三根长阴收盘深入第一根实体中部以下
   * 趋势：上涨后（up）
   */
  it('hits when long bullish + small star + bearish deep into first body in uptrend (positive)', () => {
    // first 阳线：open=10, close=10.5（body=0.5，mid=10.25）
    // mid 星形：open=10.52, close=10.48（body=0.04>0，range=0.4，body/range=0.1<0.3）
    // last 阴线：open=10.45, close=10.05（<mid=10.25，penetration=(10.25-10.05)/(10.25-10)=0.8 ≥ 0.5）
    // 强制 trend='up'（mkUptrend(20) 末值 ~20，加入 3 根低位蜡烛会令最近 MA 翻转）
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.48, 10.7, 10.3, 10.52),
      mkCandle(10.45, 10.5, 10.0, 10.05),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    const hit = evening_star.detector(ctx);
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
    expect(hit!.code).toBe('evening_star');
  });

  it('misses when third bearish does not penetrate deep enough (geometric negative)', () => {
    // last close 10.26 > mid=10.25 → 不深入
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.48, 10.7, 10.3, 10.52),
      mkCandle(10.45, 10.5, 10.2, 10.26),
    );
    expect(evening_star.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    // 强制 trend='down'
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.6, 9.9, 10.5),
      mkCandle(10.48, 10.7, 10.3, 10.52),
      mkCandle(10.45, 10.5, 10.0, 10.05),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'down', ma5: 10, ma10: 10 };
    expect(evening_star.detector(ctx)).toBeNull();
  });
});