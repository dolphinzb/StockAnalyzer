/**
 * 下降三法（Falling Three Methods）
 * 几何条件（5 根 K 线）：
 *   - 第一根：长阴线
 *   - 中间三根：小阳线（反弹），全部在前一根长阴线实体内
 *   - 第五根：长阴线，收盘价低于第一根收盘价
 * 方向：看跌持续（bearish）
 * 趋势前提：下跌中（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

const MAX_MID_BODY_RATIO = 0.5;
const MIN_FIRST_BODY_RATIO = 0.6;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;
  if (index < 4) return null;

  const first = computeGeometry(candles[index - 4]);
  const m1 = computeGeometry(candles[index - 3]);
  const m2 = computeGeometry(candles[index - 2]);
  const m3 = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || last.body <= 0) return null;

  if (!isBearish(first) || !isBearish(last)) return null;
  if (first.body / (first.range || 1) < MIN_FIRST_BODY_RATIO) return null;

  if (!isBullish(m1) || !isBullish(m2) || !isBullish(m3)) return null;
  if (m1.body > first.body * MAX_MID_BODY_RATIO) return null;
  if (m2.body > first.body * MAX_MID_BODY_RATIO) return null;
  if (m3.body > first.body * MAX_MID_BODY_RATIO) return null;

  const firstLow = Math.min(first.open, first.close);
  const firstHigh = Math.max(first.open, first.close);
  for (const m of [m1, m2, m3]) {
    if (m.high > firstHigh) return null;
    if (m.low < firstLow) return null;
  }

  if (last.close >= first.close) return null;

  const firstStrength = strengthByRatio(
    first.body / (first.range || 1),
    MIN_FIRST_BODY_RATIO,
    0.9,
  );
  const strength = blendStrength([firstStrength]);

  return {
    code: 'falling_three_methods',
    name: '下降三法',
    direction: 'bearish',
    startIndex: index - 4,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const falling_three_methods: PatternDefinition = {
  code: 'falling_three_methods',
  name: '下降三法',
  candleCount: 5,
  direction: 'bearish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势中长阴 + 三根小阳反弹 + 长阴破位，是经典看跌持续信号。',
};