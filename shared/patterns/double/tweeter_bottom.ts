/**
 * 平头底部（Tweeter Bottom）
 * 几何条件：两根 K 线最低价相等（误差容忍 0.1%）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { readLow } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, proximity } from '../_lib/strength';

const LOW_EQUAL_TOLERANCE = 0.001;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const prevLow = readLow(candles[index - 1]);
  const currLow = readLow(candles[index]);
  if (prevLow <= 0) return null;

  const diff = Math.abs(currLow - prevLow) / prevLow;
  if (diff > LOW_EQUAL_TOLERANCE) return null;

  const strength = blendStrength([proximity(diff, 0, LOW_EQUAL_TOLERANCE)]);

  return {
    code: 'tweeter_bottom',
    name: '平头底部',
    direction: 'bullish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const tweeter_bottom: PatternDefinition = {
  code: 'tweeter_bottom',
  name: '平头底部',
  candleCount: 2,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '连续两根 K 线最低价相同，构成平头底部形态，是潜在看涨反转信号。',
};