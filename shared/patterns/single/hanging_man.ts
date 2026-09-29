/**
 * 上吊线（Hanging Man）
 * 几何条件：与锤子线完全一致（长下影、实体小、上影短）
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, upperShadowRatio } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 下影线与实体最低比例 */
const MIN_LOWER_TO_BODY = 2;
/** 理想比例 */
const IDEAL_LOWER_TO_BODY = 3;
/** 上影线占比上限 */
const MAX_UPPER_TO_BODY = 0.5;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;

  const geo = computeGeometry(candles[index]);
  if (geo.range <= 0 || geo.body <= 0) return null;

  const ratio = geo.lowerShadow / geo.body;
  if (ratio < MIN_LOWER_TO_BODY) return null;

  const upperToBody = geo.upperShadow / geo.body;
  if (upperToBody > MAX_UPPER_TO_BODY) return null;

  const upperToRange = upperShadowRatio(geo);
  if (upperToRange > 0.1) return null;

  const lowerStrength = strengthByRatio(ratio, MIN_LOWER_TO_BODY, IDEAL_LOWER_TO_BODY);
  const upperStrength = 1 - upperToBody / MAX_UPPER_TO_BODY;
  const strength = blendStrength([lowerStrength, Math.max(0, upperStrength)]);

  return {
    code: 'hanging_man',
    name: '上吊线',
    direction: 'bearish',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const hanging_man: PatternDefinition = {
  code: 'hanging_man',
  name: '上吊线',
  candleCount: 1,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端出现的锤子形态，典型看跌反转信号。',
};