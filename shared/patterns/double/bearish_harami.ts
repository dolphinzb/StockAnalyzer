/**
 * 看跌孕线（Bearish Harami）
 * 几何条件：
 *   - 第一根阳线（实体较长）
 *   - 第二根阴线（实体较短），完全位于第一根实体内
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

const MAX_RATIO = 0.5;
const IDEAL_RATIO = 0.2;

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
  if (currLow < prevLow) return null;
  if (currHigh > prevHigh) return null;

  const ratio = curr.body / prev.body;
  if (ratio > MAX_RATIO) return null;

  const strength = blendStrength([
    1 - strengthByRatio(ratio, IDEAL_RATIO, MAX_RATIO),
  ]);

  return {
    code: 'bearish_harami',
    name: '看跌孕线',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const bearish_harami: PatternDefinition = {
  code: 'bearish_harami',
  name: '看跌孕线',
  candleCount: 2,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端出现的小阴线被前一根长阳线完全包住，是潜在反转信号。',
};