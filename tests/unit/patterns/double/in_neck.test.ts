import { describe, it, expect } from 'vitest';
import { in_neck } from '../../../../shared/patterns/double/in_neck';
import { mkCandle, mkSequence, mkDowntrend, mkUptrend, makeCtx } from '../_helpers';

describe('in_neck', () => {
  it('hits when bullish gaps down + closes slightly above prev.close in downtrend (positive)', () => {
    // prev: open=12, close=11 (low=10.9)
    // curr: open=10.5 (<10.9 ✓ gap), close=11.1 → diff=0.1/11=0.91% < 1% ✓
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 11.2, 10.4, 11.1),
    );
    const hit = in_neck.detector(makeCtx(candles, candles.length - 1));
    expect(hit).not.toBeNull();
    expect(hit!.direction).toBe('bearish');
  });

  it('misses when curr.close <= prev.close (geometric negative — would be on_neck)', () => {
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 11.2, 10.4, 11),
    );
    expect(in_neck.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when close diff > 1% (geometric negative)', () => {
    // close=12 → diff=9% > 1%
    const candles = mkSequence(
      ...mkDowntrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 12.2, 10.4, 12),
    );
    expect(in_neck.detector(makeCtx(candles, candles.length - 1))).toBeNull();
  });

  it('misses when trend is up (trend negative)', () => {
    const candles = mkSequence(
      ...mkUptrend(20),
      mkCandle(12, 12.1, 10.9, 11),
      mkCandle(10.5, 11.2, 10.4, 11.1),
    );
    // 强制 trend='up'（拼入的低价形态蜡烛会令自动趋势翻转为 down，此处验证趋势门禁）
    const ctx = makeCtx(candles, candles.length - 1);
    ctx.trend = { direction: 'up', ma5: 10, ma10: 10 };
    expect(in_neck.detector(ctx)).toBeNull();
  });
});