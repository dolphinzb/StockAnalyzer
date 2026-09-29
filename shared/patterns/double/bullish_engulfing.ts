/**
 * 看涨吞没（Bullish Engulfing）
 * 几何条件：第一根阴线 + 第二根阳线；阳线实体完全包住阴线实体（即第二根 open ≤ 第一根 close 且第二根 close ≥ 第一根 open）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBullish, isBearish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第二根实体宽度 / 第一根实体宽度的最低比例（包没要彻底） */
const MIN_ENGULF_RATIO = 1.5;
/** 理想比例 */
const IDEAL_ENGULF_RATIO = 3;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBearish(prev)) return null;
  if (!isBullish(curr)) return null;

  // 完全包住：curr.open ≤ prev.close 且 curr.close ≥ prev.open
  // 等价于 curr.body 同时覆盖 prev.open 和 prev.close
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
    code: 'bullish_engulfing',
    name: '看涨吞没',
    direction: 'bullish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const bullish_engulfing: PatternDefinition = {
  code: 'bullish_engulfing',
  name: '看涨吞没',
  candleCount: 2,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端出现的强反转形态，第二根阳线实体完全包住前一根阴线实体。',
};