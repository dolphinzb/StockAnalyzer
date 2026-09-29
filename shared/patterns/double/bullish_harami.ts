/**
 * 看涨孕线（Bullish Harami）
 * 几何条件：
 *   - 第一根阴线（实体较长）
 *   - 第二根阳线（实体较短）
 *   - 第二根实体完全位于第一根实体内
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第二根 / 第一根实体宽度的最高比例（孕线要求第二根更小） */
const MAX_RATIO = 0.5;
/** 理想比例（越小信号越强） */
const IDEAL_RATIO = 0.2;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBearish(prev)) return null;
  if (!isBullish(curr)) return null;

  const currLow = Math.min(curr.open, curr.close);
  const currHigh = Math.max(curr.open, curr.close);
  const prevLow = Math.min(prev.open, prev.close);
  const prevHigh = Math.max(prev.open, prev.close);
  // 必须完全位于前一根实体内
  if (currLow < prevLow) return null;
  if (currHigh > prevHigh) return null;

  const ratio = curr.body / prev.body;
  if (ratio > MAX_RATIO) return null;

  // 强度：比值越小越强（线性反向映射：MAX_RATIO→0, IDEAL_RATIO→1）
  const strength = blendStrength([
    1 - strengthByRatio(ratio, IDEAL_RATIO, MAX_RATIO),
  ]);

  return {
    code: 'bullish_harami',
    name: '看涨孕线',
    direction: 'bullish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const bullish_harami: PatternDefinition = {
  code: 'bullish_harami',
  name: '看涨孕线',
  candleCount: 2,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端出现的小阳线被前一根长阴线完全包住，是潜在反转信号。',
};