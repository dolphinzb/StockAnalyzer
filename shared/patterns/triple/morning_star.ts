/**
 * 启明星（Morning Star）
 * 几何条件：
 *   - 第一根阴线（实体较长）
 *   - 第二根小实体（星形，开盘/收盘与第一根实体有跳空）
 *   - 第三根阳线实体深入第一根实体中部以上
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish, isStar } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第三根阳线深入第一根实体的最低比例（0~1） */
const MIN_PENETRATION = 0.5;
/** 理想深入比例 */
const IDEAL_PENETRATION = 0.8;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;
  if (index < 2) return null;

  const first = computeGeometry(candles[index - 2]);
  const mid = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || mid.body <= 0 || last.body <= 0) return null;

  if (!isBearish(first)) return null;
  if (!isStar(mid)) return null;
  if (!isBullish(last)) return null;

  // 第三根阳线收盘需深入第一根阴线实体中部以上
  const firstMid = (first.open + first.close) / 2;
  if (last.close <= firstMid) return null;

  // 深入比例：(last.close - firstMid) / (first.open - firstMid)
  const penetration = (last.close - firstMid) / (first.open - firstMid);
  if (penetration < MIN_PENETRATION) return null;

  const strength = blendStrength([
    strengthByRatio(penetration, MIN_PENETRATION, IDEAL_PENETRATION),
  ]);

  return {
    code: 'morning_star',
    name: '启明星',
    direction: 'bullish',
    startIndex: index - 2,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const morning_star: PatternDefinition = {
  code: 'morning_star',
  name: '启明星',
  candleCount: 3,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端的经典反转形态：长阴 + 小实体 + 长阳深入阴线中部以上。',
};