/**
 * 黄昏星（Evening Star）
 * 几何条件：
 *   - 第一根阳线（实体较长）
 *   - 第二根小实体（星形）
 *   - 第三根阴线收盘深入第一根阳线实体中部以下
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish, isStar } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

const MIN_PENETRATION = 0.5;
const IDEAL_PENETRATION = 0.8;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;
  if (index < 2) return null;

  const first = computeGeometry(candles[index - 2]);
  const mid = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || mid.body <= 0 || last.body <= 0) return null;

  if (!isBullish(first)) return null;
  if (!isStar(mid)) return null;
  if (!isBearish(last)) return null;

  const firstMid = (first.open + first.close) / 2;
  if (last.close >= firstMid) return null;

  // 深入比例：(firstMid - last.close) / (firstMid - first.open)
  const penetration = (firstMid - last.close) / (firstMid - first.open);
  if (penetration < MIN_PENETRATION) return null;

  const strength = blendStrength([
    strengthByRatio(penetration, MIN_PENETRATION, IDEAL_PENETRATION),
  ]);

  return {
    code: 'evening_star',
    name: '黄昏星',
    direction: 'bearish',
    startIndex: index - 2,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const evening_star: PatternDefinition = {
  code: 'evening_star',
  name: '黄昏星',
  candleCount: 3,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端的经典反转形态：长阳 + 小实体 + 长阴深入阳线中部以下。',
};