/**
 * 墓碑十字（Gravestone Doji）
 * 几何条件：实体占比 < 5%；下影线极短（< 5%）；上影线长（≥ 60%）
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isDoji, lowerShadowRatio, upperShadowRatio } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 实体占比阈值 */
const DOJI_BODY_RATIO = 0.05;
/** 上影线占比最低要求 */
const MIN_UPPER_RATIO = 0.6;
/** 上影线占比理想值 */
const IDEAL_UPPER_RATIO = 0.9;
/** 下影线占比上限（超过则视为长腿十字） */
const MAX_LOWER_RATIO = 0.05;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  // 趋势前提：必须上涨
  if (!trendMatches(trend, 'up')) return null;

  const geo = computeGeometry(candles[index]);
  if (!isDoji(geo, DOJI_BODY_RATIO)) return null;

  const upper = upperShadowRatio(geo);
  const lower = lowerShadowRatio(geo);
  if (upper < MIN_UPPER_RATIO) return null;
  if (lower > MAX_LOWER_RATIO) return null;

  const upperStrength = strengthByRatio(upper, MIN_UPPER_RATIO, IDEAL_UPPER_RATIO);
  // 下影线越接近 0 越标准
  const lowerStrength = 1 - lower / MAX_LOWER_RATIO;
  const strength = blendStrength([upperStrength, Math.max(0, lowerStrength)]);

  return {
    code: 'gravestone_doji',
    name: '墓碑十字',
    direction: 'bearish',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const gravestone_doji: PatternDefinition = {
  code: 'gravestone_doji',
  name: '墓碑十字',
  candleCount: 1,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端出现的长上影十字星，典型看跌反转信号。',
};