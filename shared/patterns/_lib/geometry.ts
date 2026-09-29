/**
 * 共享几何工具库
 * 提供所有形态检测器共用的 K 线几何计算函数（纯函数，无副作用）
 */
import type { KlineData } from '../../types';

/**
 * K 线颜色（涨跌）
 * - 'bullish': 阳线（收盘 > 开盘）
 * - 'bearish': 阴线（收盘 < 开盘）
 * - 'doji': 十字（收盘 == 开盘，按浮点容差判定）
 */
export type CandleColor = 'bullish' | 'bearish' | 'doji';

/** 单根 K 线几何特征 */
export interface CandleGeometry {
  /** 实体长度（|close - open|） */
  body: number;
  /** 上影线长度（high - max(open, close)） */
  upperShadow: number;
  /** 下影线长度（min(open, close) - low） */
  lowerShadow: number;
  /** 总长度（high - low） */
  range: number;
  /** 颜色 */
  color: CandleColor;
  /** 开盘价 */
  open: number;
  /** 收盘价 */
  close: number;
  /** 最高价 */
  high: number;
  /** 最低价 */
  low: number;
}

/**
 * 浮点比较容差（用于十字星判定）
 */
export const EPSILON = 1e-6;

/**
 * 安全获取 K 线价格字段（允许 null，统一返回 number）
 * 数据库中 OHLC 字段允许为 null，此处统一回退为 0 以避免检测器报错
 */
function readPrice(candle: KlineData, field: 'open' | 'close' | 'high' | 'low'): number {
  const v = candle[field];
  return v === null || v === undefined ? 0 : v;
}

/**
 * 计算单根 K 线的几何特征
 */
export function computeGeometry(candle: KlineData): CandleGeometry {
  const open = readPrice(candle, 'open');
  const close = readPrice(candle, 'close');
  const high = readPrice(candle, 'high');
  const low = readPrice(candle, 'low');

  const body = Math.abs(close - open);
  const upperShadow = high - Math.max(open, close);
  const lowerShadow = Math.min(open, close) - low;
  const range = high - low;

  let color: CandleColor;
  if (Math.abs(close - open) < EPSILON) {
    color = 'doji';
  } else if (close > open) {
    color = 'bullish';
  } else {
    color = 'bearish';
  }

  return { body, upperShadow, lowerShadow, range, color, open, close, high, low };
}

/**
 * 判定是否为阳线
 */
export function isBullish(geo: CandleGeometry): boolean {
  return geo.color === 'bullish';
}

/**
 * 判定是否为阴线
 */
export function isBearish(geo: CandleGeometry): boolean {
  return geo.color === 'bearish';
}

/**
 * 判定是否为十字星（实体/总长 < threshold）
 * @param geo K 线几何特征
 * @param threshold 十字阈值，默认 0.05（即实体占比 < 5%）
 */
export function isDoji(geo: CandleGeometry, threshold = 0.05): boolean {
  if (geo.range <= 0) return false;
  return geo.body / geo.range < threshold;
}

/**
 * 判定是否为"星形"（实体很短，可用于启明星/弃婴等三根形态的中间 K 线判定）
 * 比十字星宽松：实体占比 < 30%
 */
export function isStar(geo: CandleGeometry, threshold = 0.3): boolean {
  if (geo.range <= 0) return false;
  return geo.body / geo.range < threshold;
}

/**
 * 计算实体占总长比例（0~1）
 */
export function bodyRatio(geo: CandleGeometry): number {
  if (geo.range <= 0) return 0;
  return geo.body / geo.range;
}

/**
 * 计算上影线占总长比例（0~1）
 */
export function upperShadowRatio(geo: CandleGeometry): number {
  if (geo.range <= 0) return 0;
  return geo.upperShadow / geo.range;
}

/**
 * 计算下影线占总长比例（0~1）
 */
export function lowerShadowRatio(geo: CandleGeometry): number {
  if (geo.range <= 0) return 0;
  return geo.lowerShadow / geo.range;
}

/**
 * 安全读取 K 线收盘价（兼容 null）
 */
export function readClose(candle: KlineData): number {
  return readPrice(candle, 'close');
}

/**
 * 安全读取 K 线开盘价（兼容 null）
 */
export function readOpen(candle: KlineData): number {
  return readPrice(candle, 'open');
}

/**
 * 安全读取 K 线最高价（兼容 null）
 */
export function readHigh(candle: KlineData): number {
  return readPrice(candle, 'high');
}

/**
 * 安全读取 K 线最低价（兼容 null）
 */
export function readLow(candle: KlineData): number {
  return readPrice(candle, 'low');
}