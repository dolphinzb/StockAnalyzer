/**
 * 上升三法（Rising Three Methods）
 * 几何条件（5 根 K 线）：
 *   - 第一根：长阳线
 *   - 中间三根：小阴线（回调），全部在前一根长阳线实体内
 *   - 第五根：长阳线，收盘价高于第一根收盘价
 * 方向：看涨持续（bullish）
 * 趋势前提：上升中（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 中间小阴线实体宽度上限（相对第一根实体的比例） */
const MAX_MID_BODY_RATIO = 0.5;
/** 第一根实体宽度相对总长的最低比例 */
const MIN_FIRST_BODY_RATIO = 0.6;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;
  if (index < 4) return null;

  const first = computeGeometry(candles[index - 4]);
  const m1 = computeGeometry(candles[index - 3]);
  const m2 = computeGeometry(candles[index - 2]);
  const m3 = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || last.body <= 0) return null;

  // 第一根、第五根长阳线
  if (!isBullish(first) || !isBullish(last)) return null;
  if (first.body / (first.range || 1) < MIN_FIRST_BODY_RATIO) return null;

  // 中间三根小阴线
  if (!isBearish(m1) || !isBearish(m2) || !isBearish(m3)) return null;
  if (m1.body > first.body * MAX_MID_BODY_RATIO) return null;
  if (m2.body > first.body * MAX_MID_BODY_RATIO) return null;
  if (m3.body > first.body * MAX_MID_BODY_RATIO) return null;

  // 中间三根都在第一根实体内（high ≤ first.high, low ≥ first.low）
  const firstLow = Math.min(first.open, first.close);
  const firstHigh = Math.max(first.open, first.close);
  for (const m of [m1, m2, m3]) {
    if (m.high > firstHigh) return null;
    if (m.low < firstLow) return null;
  }

  // 第五根收盘高于第一根收盘
  if (last.close <= first.close) return null;

  // 强度：第一根实体占比越接近 1 越强
  const firstStrength = strengthByRatio(
    first.body / (first.range || 1),
    MIN_FIRST_BODY_RATIO,
    0.9,
  );
  const strength = blendStrength([firstStrength]);

  return {
    code: 'rising_three_methods',
    name: '上升三法',
    direction: 'bullish',
    startIndex: index - 4,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const rising_three_methods: PatternDefinition = {
  code: 'rising_three_methods',
  name: '上升三法',
  candleCount: 5,
  direction: 'bullish',
  requiredTrend: 'up',
  detector,
  description: '上升趋势中长阳 + 三根小阴回调 + 长阳突破，是经典看涨持续信号。',
};