import { describe, expect, it } from 'vitest';
import { thrusting } from '../../../../shared/patterns/triple/thrusting';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('thrusting', () => {
  /**
   * 几何条件（2 根 K 线，归类在三根桶）：
   *   - 第一根阴线
   *   - 第二根阳线开盘 < prev.low（跳空低开）
   *   - 第二根收盘 < prev.open（未完全吞没）
   *   - 第二根收盘 < prev.mid 且 ≥ prev.low + 0.1*(prev.open-prev.low)（penetration ∈ [0.1, 0.5)）
   * 趋势：下跌后（down）
   */
  it('hits when bearish + bullish gap-down small penetration in downtrend (positive)', () => {
    // prev 阴线：open=10, close=9.5（body=0.5, low=9.4, mid=9.75）
    // curr 阳线：open=9.3 < prev.low=9.4 ✓，close=9.6（< prev.open=10 ✓，< mid=9.75 ✓）
    // penetration=(9.6-9.4)/(10-9.4)=0.33 ∈ [0.1, 0.5) ✓
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.3, 9.7, 9.25, 9.6),
    );
    const hit = thrusting.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
    expect(hit!.code).toBe('thrusting');
  });

  it('misses when penetration is too shallow (close ≈ prev.low)', () => {
    // close=9.45 → penetration=(9.45-9.4)/(10-9.4)=0.083 < 0.1
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.3, 9.5, 9.25, 9.45),
    );
    expect(thrusting.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when curr fully engulfs (close >= prev.open = bullish_engulfing territory)', () => {
    // close=10.05 ≥ prev.open=10 → 视为吞没而非插入
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.3, 10.2, 9.25, 10.05),
    );
    expect(thrusting.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    // 强制 trend='up'：mkUptrend(20) 末值 ~20，但 2 根 9-10 低位蜡烛令最近 MA 翻为 down，
    // 不强制的话 detector 的 trendMatches('down') 会通过 → 命中
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(10, 10.1, 9.4, 9.5),
      mkCandle(9.3, 9.7, 9.25, 9.6),
    );
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    expect(thrusting.detector(ctx)).toBeNull();
  });
});