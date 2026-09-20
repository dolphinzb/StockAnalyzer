import { describe, it, expect } from 'vitest';
import type { KlineData } from '../../../shared/types';
import { detectPatterns, REGISTRY, REGISTRY_COUNTS, MIN_KLINE_FOR_DETECTION } from '../../../shared/patterns';

/**
 * 构造一个 hammer 测试场景
 * 形态：前一日大阴线 + 当日锤子线（harness）= 锤子形态
 * 趋势：先连续 20+ 天下跌，再出锤子线
 */
function buildCandle(open: number | null, close: number | null, high: number | null, low: number | null): KlineData {
  return {
    id: 1,
    stockCode: '000001',
    tradeDate: '2024-01-01',
    adjustType: '',
    open,
    close,
    high,
    low,
    volume: 1000,
    amount: 1000,
    amplitude: 0,
    changePercent: 0,
    changeAmount: 0,
    turnoverRate: 0,
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * 生成 N 根同样收/开的 K 线（用于生成趋势）
 */
function repeat(open: number, close: number, count: number): KlineData[] {
  const out: KlineData[] = [];
  for (let i = 0; i < count; i++) {
    out.push(buildCandle(open, close, Math.max(open, close) + 0.5, Math.min(open, close) - 0.5));
  }
  return out;
}

describe('shared/patterns detectPatterns & registry', () => {
  it('REGISTRY total length === 32 (9 single + 10 double + 13 triple)', () => {
    expect(REGISTRY.length).toBe(32);
    expect(REGISTRY_COUNTS.total).toBe(32);
    expect(REGISTRY_COUNTS.single).toBe(9);
    expect(REGISTRY_COUNTS.double).toBe(10);
    expect(REGISTRY_COUNTS.triple).toBe(13);
  });

  it('returns empty array when candles length < 20', () => {
    const short = repeat(10, 10, 15);
    expect(detectPatterns(short)).toEqual([]);
    expect(MIN_KLINE_FOR_DETECTION).toBe(20);
  });

  it('detects a hammer in a downtrend', () => {
    // 前 20 根持续阴线下跌，最后一根是锤子线
    const downTrend: KlineData[] = [];
    let price = 20;
    for (let i = 0; i < 20; i++) {
      const open = price;
      const close = price - 0.5; // 持续阴跌
      downTrend.push(buildCandle(open, close, open + 0.2, close - 0.2));
      price = close;
    }
    // 第 21 根：锤子线 —— open=close=price，下影线 = 2 × body，上影线 = 0
    const body = 0.5;
    const open = price;
    const close = open + body;
    const lower = body * 2; // 下影线 2 倍实体
    const upper = body * 0.2;
    const high = close + upper;
    const low = open - lower;
    downTrend.push(buildCandle(open, close, high, low));

    const hits = detectPatterns(downTrend);
    const hammerHit = hits.find((h) => h.code === 'hammer');
    expect(hammerHit).toBeDefined();
    expect(hammerHit!.direction).toBe('bullish');
    expect(hammerHit!.endIndex).toBe(20);
  });

  it('dedup: same (code, endIndex) returns only the highest strength', () => {
    // 构造一个简单上涨趋势，包含吞没形态
    const candles: KlineData[] = [];
    // 前 20 根下跌（建立下跌趋势）
    let p = 20;
    for (let i = 0; i < 20; i++) {
      candles.push(buildCandle(p, p - 0.5, p + 0.2, p - 0.7));
      p = p - 0.5;
    }
    // 倒数第 2 根：再走一个小阴线
    candles.push(buildCandle(p, p - 0.3, p + 0.2, p - 0.5));
    // 最后一根：大阳线吞没前一根
    const prevBody = 0.3;
    const bigOpen = p - 0.4;
    const bigClose = p + 0.5;
    candles.push(buildCandle(bigOpen, bigClose, bigClose + 0.1, bigOpen - 0.1));

    const hits = detectPatterns(candles);
    // 同一 (bullish_engulfing, endIndex=21) 只应有一条命中
    const engulfs = hits.filter((h) => h.code === 'bullish_engulfing' && h.endIndex === 21);
    expect(engulfs.length).toBe(1);
  });

  it('sorts hits by endIndex descending, then by strength descending', () => {
    // 简单验证排序：detection 返回顺序应满足 (endIndex, strength) 字典序倒序
    const candles: KlineData[] = [];
    let p = 20;
    for (let i = 0; i < 25; i++) {
      candles.push(buildCandle(p, p - 0.3, p + 0.1, p - 0.5));
      p = p - 0.3;
    }
    const hits = detectPatterns(candles);
    for (let i = 1; i < hits.length; i++) {
      const prev = hits[i - 1];
      const curr = hits[i];
      if (prev.endIndex !== curr.endIndex) {
        expect(prev.endIndex).toBeGreaterThanOrEqual(curr.endIndex);
      } else {
        expect(prev.strength).toBeGreaterThanOrEqual(curr.strength);
      }
    }
  });
});