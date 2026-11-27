import { describe, expect, it } from 'vitest';
import type { MarketKlineItem } from '../../electron/services/marketSdkClient';
import {
  deriveSohuFactors,
  hasUsableFactors,
  mergeSohuFactors,
} from '../../electron/services/sohuAdjustment';

function bar(date: string, close: number, change: number | null): MarketKlineItem {
  return {
    date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 100,
    amount: 1000,
    amplitude: null,
    changePercent: null,
    change,
    turnoverRate: 1,
  };
}

describe('搜狐本地复权引擎', () => {
  it('无除权事件时因子恒为 1', () => {
    const bars = [bar('2025-01-02', 10, 0), bar('2025-01-03', 11, 1)];
    const factors = deriveSohuFactors(bars);

    expect(factors.eventFactors.size).toBe(0);
    expect(factors.qfq.get('2025-01-02')).toBe(1);
    expect(factors.hfq.get('2025-01-03')).toBe(1);
  });

  it('现金分红产生事件因子，qfq 与 hfq 基准不同', () => {
    const bars = [bar('2025-01-02', 10, 0), bar('2025-01-03', 9, 0.5)];
    const factors = deriveSohuFactors(bars);

    expect(factors.eventFactors.get('2025-01-03')).toBeCloseTo(8.5 / 10, 6);
    expect(factors.qfq.get('2025-01-02')).toBeCloseTo(0.85, 6);
    expect(factors.qfq.get('2025-01-03')).toBe(1);
    expect(factors.hfq.get('2025-01-02')).toBe(1);
    expect(factors.hfq.get('2025-01-03')).toBeCloseTo(1 / 0.85, 6);
  });

  it('涨跌额缺失时按涨跌幅反推前收', () => {
    const withPercent = bar('2025-01-03', 9, null);
    withPercent.changePercent = 0;
    const factors = deriveSohuFactors([bar('2025-01-02', 10, 0), withPercent]);

    expect(factors.eventFactors.get('2025-01-03')).toBeCloseTo(0.9, 6);
  });

  it('合并增量事件到历史因子', () => {
    const stored = {
      qfq: new Map([['2025-01-02', 0.8]]),
      hfq: new Map([['2025-01-02', 1]]),
    };
    const bars = [bar('2025-01-02', 10, 0), bar('2025-01-03', 9, 0.5)];
    const merged = mergeSohuFactors(stored, bars);

    expect(merged.qfq.get('2025-01-02')).toBeCloseTo(0.8 * 0.85, 6);
    expect(merged.hfq.get('2025-01-03')).toBeCloseTo(1 / 0.85, 6);
  });

  it('空因子不可用于增量', () => {
    expect(hasUsableFactors(null)).toBe(false);
    expect(hasUsableFactors({ qfq: new Map(), hfq: new Map() })).toBe(false);
  });
});
