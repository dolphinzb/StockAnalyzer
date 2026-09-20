/**
 * 黑三鸦（Three Black Crows）
 * 几何条件：
 *   - 连续三根阴线
 *   - 每根开盘价在前一根实体范围内
 *   - 每根收盘价低于前一根收盘价
 * 方向：看跌持续（bearish）
 * 趋势前提：上涨后反转 或 下跌中持续
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish } from '../_lib/geometry';
import { blendStrength, strengthByRatio } from '../_lib/strength';
import { trendMatches } from '../_lib/trend';

const OPEN_INSIDE_TOLERANCE = 0.1;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up') && !trendMatches(trend, 'down')) return null;
  if (index < 2) return null;

  const a = computeGeometry(candles[index - 2]);
  const b = computeGeometry(candles[index - 1]);
  const c = computeGeometry(candles[index]);
  if (a.body <= 0 || b.body <= 0 || c.body <= 0) return null;

  if (!isBearish(a) || !isBearish(b) || !isBearish(c)) return null;

  if (c.close >= b.close) return null;
  if (b.close >= a.close) return null;

  const aRange = Math.max(a.open, a.close) - Math.min(a.open, a.close);
  const bRange = Math.max(b.open, b.close) - Math.min(b.open, b.close);
  const aMin = Math.min(a.open, a.close);
  const aMax = Math.max(a.open, a.close);
  const bMin = Math.min(b.open, b.close);
  const bMax = Math.max(b.open, b.close);
  const cMin = Math.min(c.open, c.close);
  const cMax = Math.max(c.open, c.close);
  const toleranceA = aRange * OPEN_INSIDE_TOLERANCE;
  const toleranceB = bRange * OPEN_INSIDE_TOLERANCE;
  if (bMin < aMin - toleranceA) return null;
  if (bMax > aMax + toleranceA) return null;
  if (cMin < bMin - toleranceB) return null;
  if (cMax > bMax + toleranceB) return null;

  const avgBodyStrength = blendStrength([
    strengthByRatio(a.body / (a.range || 1), 0.5, 0.8),
    strengthByRatio(b.body / (b.range || 1), 0.5, 0.8),
    strengthByRatio(c.body / (c.range || 1), 0.5, 0.8),
  ]);

  return {
    code: 'three_black_crows',
    name: '黑三鸦',
    direction: 'bearish',
    startIndex: index - 2,
    endIndex: index,
    strength: avgBodyStrength,
    trendContext: trend.direction,
  };
}

export const three_black_crows: PatternDefinition = {
  code: 'three_black_crows',
  name: '黑三鸦',
  candleCount: 3,
  direction: 'bearish',
  requiredTrend: 'consistent',
  detector,
  description: '连续三根递进阴线，每根开盘位于前一根实体范围内，是经典看跌持续信号。',
};