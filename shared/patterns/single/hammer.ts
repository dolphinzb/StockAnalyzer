/**
 * 锤子线（Hammer）
 * 几何条件：实体位于 K 线顶部；下影线 ≥ 2 倍实体；上影线很短（≤ 实体 0.5 倍）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, upperShadowRatio } from '../_lib/geometry';
import { blendStrength, strengthByRatio } from '../_lib/strength';
import { trendMatches } from '../_lib/trend';

/** 下影线与实体最低比例 */
const MIN_LOWER_TO_BODY = 2;
/** 理想比例 */
const IDEAL_LOWER_TO_BODY = 3;
/** 上影线占比上限（相对实体） */
const MAX_UPPER_TO_BODY = 0.5;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const candle = candles[index];
  const geo = computeGeometry(candle);
  if (geo.range <= 0 || geo.body <= 0) return null;

  const lowerShadow = geo.lowerShadow;
  const ratio = lowerShadow / geo.body;
  if (ratio < MIN_LOWER_TO_BODY) return null;

  const upperToBody = geo.upperShadow / geo.body;
  if (upperToBody > MAX_UPPER_TO_BODY) return null;

  // 实体位于顶部：min(open,close) ≈ low + 下影线
  // 即实体的下边界 = low + lowerShadow
  // 由于 lowerShadow 由 min(open,close)-low 计算，恒等式天然成立；
  // 这里改为校验"实体上边界离最高价很近"，即 max(open,close) ≈ high
  const upperToRange = upperShadowRatio(geo);
  if (upperToRange > 0.1) return null;

  const lowerStrength = strengthByRatio(ratio, MIN_LOWER_TO_BODY, IDEAL_LOWER_TO_BODY);
  const upperStrength = 1 - upperToBody / MAX_UPPER_TO_BODY;
  const strength = blendStrength([lowerStrength, Math.max(0, upperStrength)]);

  return {
    code: 'hammer',
    name: '锤子线',
    direction: 'bullish',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const hammer: PatternDefinition = {
  code: 'hammer',
  name: '锤子线',
  candleCount: 1,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端出现的长下影小实体，典型看涨反转信号。',
};