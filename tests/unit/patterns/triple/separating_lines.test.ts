import { describe, it, expect } from 'vitest';
import { separating_lines } from '../../../../shared/patterns/triple/separating_lines';
import { mkCandle, mkSequence, mkUptrend, mkDowntrend, makeCtx } from '../_helpers';

describe('separating_lines', () => {
  /**
   * 几何条件（2 根 K 线，归类在三根桶）：
   *   - 同色 K 线，开盘价几乎一致（|curr.open - prev.open| / prev.open ≤ 0.005）
   *   - curr.body / prev.body ≥ 1.5
   *   - 顺势：bullish 要求 trend='up'，bearish 要求 trend='down'
   * 趋势：up 或 down（consistent），且方向需与形态方向一致
   */
  it('hits when 2 bullish with matching opens and curr body ≥ 1.5x in uptrend (positive, bullish variant)', () => {
    // prev 阳线（来自 mkUptrend 最后 1 根）：open=19.5, close=20, body=0.5
    // curr 阳线：open=19.5（匹配），close=20.5（body=1.0, ratio=2.0 ≥ 1.5 ✓）
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(19.5, 20.6, 19.4, 20.5),
    );
    const hit = separating_lines.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bullish');
    expect(hit!.code).toBe('separating_lines');
  });

  it('misses when opens do not match (geometric negative)', () => {
    // curr.open=19.6 vs prev.open=19.5 → diff=0.0051 > 0.005
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(19.6, 20.7, 19.5, 20.6),
    );
    expect(separating_lines.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when curr body is smaller than 1.5x prev body', () => {
    // curr.open=19.5, curr.close=20.05, body=0.55, ratio=1.1 < 1.5
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(19.5, 20.15, 19.4, 20.05),
    );
    expect(separating_lines.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when bullish pattern appears in downtrend (directional mismatch)', () => {
    // 顺势校验：bullish 形态若 trend='down' → null
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(19.5, 20.6, 19.4, 20.5),
    );
    expect(separating_lines.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});