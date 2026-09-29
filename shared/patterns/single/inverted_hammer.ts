/**
 * 倒锤子（Inverted Hammer）
 * 几何条件：实体位于 K 线底部；上影线 ≥ 2 倍实体；下影线很短（≤ 实体 0.5 倍）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, lowerShadowRatio } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 上影线与实体最低比例 */
const MIN_UPPER_TO_BODY = 2;
/** 理想比例 */
const IDEAL_UPPER_TO_BODY = 3;
/** 下影线占比上限 */
const MAX_LOWER_TO_BODY = 0.5;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const geo = computeGeometry(candles[index]);
  if (geo.range <= 0 || geo.body <= 0) return null;

  const ratio = geo.upperShadow / geo.body;
  if (ratio < MIN_UPPER_TO_BODY) return null;

  const lowerToBody = geo.lowerShadow / geo.body;
  if (lowerToBody > MAX_LOWER_TO_BODY) return null;

  const lowerToRange = lowerShadowRatio(geo);
  if (lowerToRange > 0.1) return null;

  const upperStrength = strengthByRatio(ratio, MIN_UPPER_TO_BODY, IDEAL_UPPER_TO_BODY);
  const lowerStrength = 1 - lowerToBody / MAX_LOWER_TO_BODY;
  const strength = blendStrength([upperStrength, Math.max(0, lowerStrength)]);

  return {
    code: 'inverted_hammer',
    name: '倒锤子',
    direction: 'bullish',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const inverted_hammer: PatternDefinition = {
  code: 'inverted_hammer',
  name: '倒锤子',
  candleCount: 1,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端出现的长上影小实体，需次日阳线确认。',
};