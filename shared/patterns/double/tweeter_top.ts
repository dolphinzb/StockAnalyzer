/**
 * 平头顶部（Tweeter Top）
 * 几何条件：两根 K 线最高价相等（误差容忍 0.1%）
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { readHigh } from '../_lib/geometry';
import { blendStrength, proximity } from '../_lib/strength';
import { trendMatches } from '../_lib/trend';

/** 最高价相等的容差（相对前一根最高价的比例） */
const HIGH_EQUAL_TOLERANCE = 0.001;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;

  const prevHigh = readHigh(candles[index - 1]);
  const currHigh = readHigh(candles[index]);
  if (prevHigh <= 0) return null;

  const diff = Math.abs(currHigh - prevHigh) / prevHigh;
  if (diff > HIGH_EQUAL_TOLERANCE) return null;

  // 强度：最高价越接近（diff 越小），信号越强
  const strength = blendStrength([proximity(diff, 0, HIGH_EQUAL_TOLERANCE)]);

  return {
    code: 'tweeter_top',
    name: '平头顶部',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const tweeter_top: PatternDefinition = {
  code: 'tweeter_top',
  name: '平头顶部',
  candleCount: 2,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '连续两根 K 线最高价相同，构成平头顶部形态，是潜在看跌反转信号。',
};