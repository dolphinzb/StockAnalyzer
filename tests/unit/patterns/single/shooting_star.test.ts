import { describe, it, expect } from 'vitest';
import { shooting_star } from '../../../../shared/patterns/single/shooting_star';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('shooting_star', () => {
  it('hits when upper shadow ≥ 2x body in uptrend (positive)', () => {
    // body=0.5, upper=1, lower=0.1
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 11.5, 9.9, 10.5),
    );
    // 强制 trend='up'（mkUptrend(20) 末值 ~20，加入低位蜡烛会令最近 MA 翻转）
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    const hit = shooting_star.detector(ctx);
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when upper shadow too short (geometric negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.5, 9.5, 10.5),
    );
    expect(shooting_star.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 11.5, 9.9, 10.5),
    );
    expect(shooting_star.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});