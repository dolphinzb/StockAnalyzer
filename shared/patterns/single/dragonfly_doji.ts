/**
 * 蜻蜓十字（Dragonfly Doji）
 * 几何条件：实体占比 < 5%；上影线极短（< 5%）；下影线长（≥ 60%）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isDoji, lowerShadowRatio, upperShadowRatio } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 实体占比阈值 */
const DOJI_BODY_RATIO = 0.05;
/** 下影线占比最低要求 */
const MIN_LOWER_RATIO = 0.6;
/** 下影线占比理想值 */
const IDEAL_LOWER_RATIO = 0.9;
/** 上影线占比上限 */
const MAX_UPPER_RATIO = 0.05;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const geo = computeGeometry(candles[index]);
  if (!isDoji(geo, DOJI_BODY_RATIO)) return null;

  const upper = upperShadowRatio(geo);
  const lower = lowerShadowRatio(geo);
  if (lower < MIN_LOWER_RATIO) return null;
  if (upper > MAX_UPPER_RATIO) return null;

  const lowerStrength = strengthByRatio(lower, MIN_LOWER_RATIO, IDEAL_LOWER_RATIO);
  const upperStrength = 1 - upper / MAX_UPPER_RATIO;
  const strength = blendStrength([lowerStrength, Math.max(0, upperStrength)]);

  return {
    code: 'dragonfly_doji',
    name: '蜻蜓十字',
    direction: 'bullish',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const dragonfly_doji: PatternDefinition = {
  code: 'dragonfly_doji',
  name: '蜻蜓十字',
  candleCount: 1,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端出现的长下影十字星，典型看涨反转信号。',
};