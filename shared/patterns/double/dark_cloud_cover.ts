/**
 * 乌云盖顶（Dark Cloud Cover）
 * 几何条件：
 *   - 第一根阳线（实体足够长）
 *   - 第二根阴线开盘价 > 第一根最高价（即跳空高开）
 *   - 第二根收盘价 < 第一根实体中部（深入阳线实体一半以上）
 *   - 第二根收盘价 > 第一根开盘价（未完全吞没）
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第二根收盘深入第一根实体的最低比例（0~1） */
const MIN_PENETRATION = 0.5;
/** 理想深入比例 */
const IDEAL_PENETRATION = 0.8;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBullish(prev)) return null;
  if (!isBearish(curr)) return null;

  // 跳空高开：curr.open > prev.high
  if (curr.open <= prev.high) return null;

  // 第二根收盘需深入阳线实体中部
  const prevMid = (prev.open + prev.close) / 2;
  if (curr.close >= prevMid) return null;

  // 未完全吞没：curr.close > prev.open
  if (curr.close <= prev.open) return null;

  // 计算深入比例：(prevMid - curr.close) / (prevMid - prev.open)
  const penetration = (prevMid - curr.close) / (prevMid - prev.open);
  if (penetration < MIN_PENETRATION) return null;

  const strength = blendStrength([
    strengthByRatio(penetration, MIN_PENETRATION, IDEAL_PENETRATION),
  ]);

  return {
    code: 'dark_cloud_cover',
    name: '乌云盖顶',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const dark_cloud_cover: PatternDefinition = {
  code: 'dark_cloud_cover',
  name: '乌云盖顶',
  candleCount: 2,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端跳空高开后深跌至前阳线实体中部，是经典看跌反转。',
};