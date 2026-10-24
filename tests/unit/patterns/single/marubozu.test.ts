import { describe, it, expect } from 'vitest';
import { marubozu } from '../../../../shared/patterns/single/marubozu';
import { mkCandle, mkSequence, mkUptrend, makeCtx } from '../_helpers';

describe('marubozu', () => {
  it('hits when bullish candle has body ≥ 90% of range (positive)', () => {
    // open=10, close=12, high=12.1, low=9.9 → body=2, range=2.2 → 90.9%
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12.1, 9.9, 12),
    );
    // 强制 trend='up'（mkUptrend(20) 末值 ~20，加入低价蜡烛会令最近 MA 翻转为 flat）
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    const hit = marubozu.detector(ctx);
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
  });

  it('misses when body too small (geometric negative)', () => {
    // body=1, range=4 → 25%
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 12, 8, 11),
    );
    expect(marubozu.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is flat (trend negative — required consistent)', () => {
    // 几何合规但趋势为 flat
    const candles = mkSequence(
      ...Array.from({ length: 20 }, () => mkCandle(10, 10.1, 9.9, 10)), // 横向
      mkCandle(10, 12.1, 9.9, 12),
    );
    // 末根 close=12 会令 MA5 略微上翘，强制 trend='flat' 验证横盘下不命中
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'flat', ma5: 10, ma10: 10 };
    expect(marubozu.detector(ctx)).toBeNull();
  });
});