/**
 * 测试辅助函数
 * 为各形态测试构造标准 K 线数据
 */
import type { KlineData, PatternContext, TrendInfo, PatternDefinition } from '../../../shared/types';
import { computeTrend } from '../../../shared/patterns/_lib/trend';

/**
 * 构造单根 K 线数据
 * @param ohlc [open, high, low, close] 四个价格
 */
export function mkCandle(open: number, high: number, low: number, close: number): KlineData {
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
 * 生成 N 根同结构 K 线（用于建立趋势或构造背景）
 */
export function mkSequence(...Candles: KlineData[]): KlineData[] {
  return Candles.map((c, i) => ({ ...c, id: i + 1, tradeDate: `2024-01-${(i + 1).toString().padStart(2, '0')}` }));
}

/**
 * 生成 N 根连续阴线下跌序列（收盘 < 开盘，价格单调下降）
 */
export function mkDowntrend(count: number, startPrice = 20, step = 0.5): KlineData[] {
  const candles: KlineData[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price - step;
    candles.push(mkCandle(open, open + 0.1, close - 0.1, close));
    price = close;
  }
  return candles;
}

/**
 * 生成 N 根连续阳线上涨序列（收盘 > 开盘，价格单调上升）
 */
export function mkUptrend(count: number, startPrice = 10, step = 0.5): KlineData[] {
  const candles: KlineData[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + step;
    candles.push(mkCandle(open, open - 0.1, close - 0.1, close));
    price = close;
  }
  return candles;
}

/**
 * 构造 PatternContext 用于直接调用 detector
 * 自动计算 trend
 */
export function makeCtx(candles: KlineData[], index: number): PatternContext {
  const trend = computeTrend(candles, index);
  return { candles, index, trend };
}

/**
 * 构造 PatternContext 但 trend 由调用方指定（用于"反向趋势"测试）
 */
export function makeCtxWithTrend(candles: KlineData[], index: number, trend: TrendInfo): PatternContext {
  return { candles, index, trend };
}

/**
 * 触发 detector 并断言命中
 */
export function expectHit(def: PatternDefinition, candles: KlineData[], index?: number): void {
  const idx = index ?? candles.length - 1;
  const ctx = makeCtx(candles, idx);
  const hit = def.detector(ctx);
  expect(hit, `expected pattern "${def.code}" to hit at index ${idx}`).not.toBeNull();
}

/**
 * 触发 detector 并断言未命中
 */
export function expectMiss(def: PatternDefinition, candles: KlineData[], index?: number): void {
  const idx = index ?? candles.length - 1;
  const ctx = makeCtx(candles, idx);
  const hit = def.detector(ctx);
  expect(hit, `expected pattern "${def.code}" to miss at index ${idx}`).toBeNull();
}