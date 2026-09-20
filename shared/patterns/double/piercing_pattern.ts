/**
 * 刺透形态（Piercing Pattern）
 * 几何条件：
 *   - 第一根阴线
 *   - 第二根阳线开盘价 < 第一根最低价（跳空低开）
 *   - 第二根收盘价 > 第一根实体中部
 *   - 第二根收盘价 < 第一根开盘价（未完全吞没）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
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
  if (!trendMatches(trend, 'down')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBearish(prev)) return null;
  if (!isBullish(curr)) return null;

  // 跳空低开：curr.open < prev.low
  if (curr.open >= prev.low) return null;

  // 第二根收盘需深入阴线实体中部
  const prevMid = (prev.open + prev.close) / 2;
  if (curr.close <= prevMid) return null;

  // 未完全吞没：curr.close < prev.open
  if (curr.close >= prev.open) return null;

  // 深入比例：(curr.close - prevMid) / (prev.open - prevMid)
  const penetration = (curr.close - prevMid) / (prev.open - prevMid);
  if (penetration < MIN_PENETRATION) return null;

  const strength = blendStrength([
    strengthByRatio(penetration, MIN_PENETRATION, IDEAL_PENETRATION),
  ]);

  return {
    code: 'piercing_pattern',
    name: '刺透形态',
    direction: 'bullish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const piercing_pattern: PatternDefinition = {
  code: 'piercing_pattern',
  name: '刺透形态',
  candleCount: 2,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端跳空低开后深涨至前阴线实体中部，是经典看涨反转。',
};