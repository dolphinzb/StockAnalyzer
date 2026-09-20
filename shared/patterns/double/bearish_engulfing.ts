/**
 * 看跌吞没（Bearish Engulfing）
 * 几何条件：第一根阳线 + 第二根阴线；阴线实体完全包住阳线实体
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBullish, isBearish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 包没宽度最低比例 */
const MIN_ENGULF_RATIO = 1.5;
/** 理想比例 */
const IDEAL_ENGULF_RATIO = 3;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBullish(prev)) return null;
  if (!isBearish(curr)) return null;

  const currLow = Math.min(curr.open, curr.close);
  const currHigh = Math.max(curr.open, curr.close);
  const prevLow = Math.min(prev.open, prev.close);
  const prevHigh = Math.max(prev.open, prev.close);
  if (currLow > prevLow) return null;
  if (currHigh < prevHigh) return null;

  const ratio = curr.body / prev.body;
  if (ratio < MIN_ENGULF_RATIO) return null;

  const strength = blendStrength([
    strengthByRatio(ratio, MIN_ENGULF_RATIO, IDEAL_ENGULF_RATIO),
  ]);

  return {
    code: 'bearish_engulfing',
    name: '看跌吞没',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const bearish_engulfing: PatternDefinition = {
  code: 'bearish_engulfing',
  name: '看跌吞没',
  candleCount: 2,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端出现的强反转形态，第二根阴线实体完全包住前一根阳线实体。',
};