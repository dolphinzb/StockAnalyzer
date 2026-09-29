/**
 * 长腿十字（Long-Legged Doji）
 * 几何条件：实体占比 < 5%（同 doji），且上下影线都很长（均 ≥ 总长 30%）
 * 方向：转折预警（warning）
 * 趋势前提：任意
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isDoji, lowerShadowRatio, upperShadowRatio } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 实体占比阈值 */
const DOJI_BODY_RATIO = 0.05;
/** 上下影线占比最低要求 */
const MIN_SHADOW_RATIO = 0.3;
/** 上下影线占比理想值（教科书标准） */
const IDEAL_SHADOW_RATIO = 0.45;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'any')) return null;

  const geo = computeGeometry(candles[index]);
  if (!isDoji(geo, DOJI_BODY_RATIO)) return null;

  const upper = upperShadowRatio(geo);
  const lower = lowerShadowRatio(geo);
  if (upper < MIN_SHADOW_RATIO || lower < MIN_SHADOW_RATIO) return null;

  const upperStrength = strengthByRatio(upper, MIN_SHADOW_RATIO, IDEAL_SHADOW_RATIO);
  const lowerStrength = strengthByRatio(lower, MIN_SHADOW_RATIO, IDEAL_SHADOW_RATIO);
  const strength = blendStrength([upperStrength, lowerStrength]);

  return {
    code: 'long_legged_doji',
    name: '长腿十字',
    direction: 'warning',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const long_legged_doji: PatternDefinition = {
  code: 'long_legged_doji',
  name: '长腿十字',
  candleCount: 1,
  direction: 'warning',
  requiredTrend: 'any',
  detector,
  description: '上下影线都很长的十字星，反映市场剧烈震荡，趋势可能反转。',
};