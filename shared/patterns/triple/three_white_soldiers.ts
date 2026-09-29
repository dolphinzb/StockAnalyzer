/**
 * 红三兵（Three White Soldiers）
 * 几何条件：
 *   - 连续三根阳线
 *   - 每根开盘价在前一根实体范围内（即"渐进上升"）
 *   - 每根收盘价高于前一根收盘价
 * 方向：看涨持续（bullish）
 * 趋势前提：下跌后或上升中（down/up，trendMatches 处理）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBullish } from '../_lib/geometry';
import { blendStrength, strengthByRatio } from '../_lib/strength';
import { trendMatches } from '../_lib/trend';

/** 开盘价允许超出前一根实体范围的容差（相对前一根实体长度） */
const OPEN_INSIDE_TOLERANCE = 0.1;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  // 趋势前提：下跌后反转 或 上升中持续（即 up 或 down 都允许）
  if (!trendMatches(trend, 'up') && !trendMatches(trend, 'down')) return null;
  if (index < 2) return null;

  const a = computeGeometry(candles[index - 2]);
  const b = computeGeometry(candles[index - 1]);
  const c = computeGeometry(candles[index]);
  if (a.body <= 0 || b.body <= 0 || c.body <= 0) return null;

  if (!isBullish(a) || !isBullish(b) || !isBullish(c)) return null;

  // 收盘价递增
  if (c.close <= b.close) return null;
  if (b.close <= a.close) return null;

  // 开盘价在前一根实体范围内（容差 OPEN_INSIDE_TOLERANCE）
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

  // 强度：实体平均长度占比越大越强
  const avgBodyStrength = blendStrength([
    strengthByRatio(a.body / (a.range || 1), 0.5, 0.8),
    strengthByRatio(b.body / (b.range || 1), 0.5, 0.8),
    strengthByRatio(c.body / (c.range || 1), 0.5, 0.8),
  ]);

  return {
    code: 'three_white_soldiers',
    name: '红三兵',
    direction: 'bullish',
    startIndex: index - 2,
    endIndex: index,
    strength: avgBodyStrength,
    trendContext: trend.direction,
  };
}

export const three_white_soldiers: PatternDefinition = {
  code: 'three_white_soldiers',
  name: '红三兵',
  candleCount: 3,
  direction: 'bullish',
  requiredTrend: 'consistent', // 接受 down→up 转折或 up 中持续
  detector,
  description: '连续三根递进阳线，每根开盘位于前一根实体范围内，是经典看涨持续信号。',
};