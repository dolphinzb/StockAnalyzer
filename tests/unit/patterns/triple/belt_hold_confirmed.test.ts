import { describe, it, expect } from 'vitest';
import { belt_hold_confirmed } from '../../../../shared/patterns/triple/belt_hold_confirmed';
import { mkCandle, mkSequence, mkDowntrend, makeCtx } from '../_helpers';

describe('belt_hold_confirmed', () => {
  /**
   * 几何条件（5 根 K 线）：
   *   - 第一根：长实体（body/range ≥ 0.6），方向决定整体方向
   *   - 后续 3 根 + 最后一根同色
   *   - 最后一根收盘突破第一根收盘（同向）
   * 趋势：up 或 down（非 flat）
   */
  it('hits when long bullish first + 4 bullish confirmation + breakout above first.close in downtrend (positive, bullish variant)', () => {
    // first: open=20, close=21, body=1, high=21.2, low=19.8, range=1.4, body/range=0.71
    // a/b/c/last: open=21, close=21.1（小幅阳线）
    // last: close=21.5 > first.close=21 ✓
    // mkDowntrend(20) 末尾 close=10，加入 5 根后 trend 仍为 down（非 flat）✓
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21.05, 21.6, 21.0, 21.5),
    );
    const hit = belt_hold_confirmed.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('belt_hold_confirmed');
  });

  it('misses when last close does not break out above first close (geometric negative)', () => {
    // last.close=21 ≤ first.close=21
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21.0, 21.05, 20.9, 20.95),
    );
    expect(belt_hold_confirmed.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when one of middle candles is opposite color', () => {
    // a 是阴线
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 21.2, 19.8, 21),
      mkCandle(21.1, 21.15, 20.95, 21.0),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21.05, 21.6, 21.0, 21.5),
    );
    expect(belt_hold_confirmed.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when first body ratio is too small', () => {
    // first.body/range=0.2 < 0.6
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 25, 15, 21),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21, 21.15, 20.95, 21.1),
      mkCandle(21.05, 21.6, 21.0, 21.5),
    );
    expect(belt_hold_confirmed.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});