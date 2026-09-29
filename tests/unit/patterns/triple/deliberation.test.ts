import { describe, expect, it } from 'vitest';
import { deliberation } from '../../../../shared/patterns/triple/deliberation';
import { makeCtx, mkCandle, mkDowntrend, mkSequence, mkUptrend } from '../_helpers';

describe('deliberation', () => {
  /**
   * 几何条件：
   *   - 前两根阳线递增
   *   - 第三根阳线开盘跳空高开于第二根收盘之上（last.open > mid.close）
   *   - 第三根是小实体（last.body / mid.body ≤ MAX_LAST_BODY_RATIO=0.5）
   *   - 第三根收盘 ≥ mid.close * 0.99
   * 趋势：上升中（up）
   * 方向：warning
   */
  it('hits when 2 ascending bullish + 3rd small bullish with gap-up in uptrend (positive)', () => {
    // first: open=20, close=20.5 (body=0.5)
    // mid: open=20.5, close=21 (body=0.5, mid.close=21)
    // last: open=21.05 (>21 ✓ 跳空高开), close=21.07, body=0.02>0, body/mid.body=0.02/0.5=0.04 ≤ 0.5 ✓
    // last.close=21.07 ≥ 21*0.99=20.79 ✓
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.6, 19.9, 20.5),
      mkCandle(20.5, 21.1, 20.4, 21.0),
      mkCandle(21.05, 21.12, 21.0, 21.07),
    );
    const hit = deliberation.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('warning');
    expect(hit!.code).toBe('deliberation');
  });

  it('misses when third body is too large (geometric negative)', () => {
    // last.body=0.4, mid.body=0.5, ratio=0.8 > 0.5
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.6, 19.9, 20.5),
      mkCandle(20.5, 21.1, 20.4, 21.0),
      mkCandle(21.05, 21.5, 21.0, 21.45),
    );
    expect(deliberation.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when third does not gap up (geometric negative)', () => {
    // last.open=20.95 ≤ mid.close=21.0，无跳空
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(20, 20.6, 19.9, 20.5),
      mkCandle(20.5, 21.1, 20.4, 21.0),
      mkCandle(20.95, 21.0, 20.9, 20.99),
    );
    expect(deliberation.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is down (trend negative)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(20, 20.6, 19.9, 20.5),
      mkCandle(20.5, 21.1, 20.4, 21.0),
      mkCandle(21.05, 21.1, 21.0, 21.05),
    );
    expect(deliberation.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });
});