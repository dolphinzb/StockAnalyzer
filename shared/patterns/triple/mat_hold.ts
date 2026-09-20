/**
 * 铺垫形态（Mat Hold）
 * 几何条件（5 根 K 线）：
 *   - 第一根：长阳线
 *   - 第二根：阳线（开盘跳空高开，收盘不破第一根收盘）
 *   - 中间三根：小阴线（在前两根实体内）
 *   - 第五根：长阳线，收盘突破所有
 * 方向：看涨持续（bullish）
 * 趋势前提：上升中（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第一根实体宽度 / 总长 最低比例 */
const MIN_FIRST_BODY_RATIO = 0.6;
/** 中间小阴线实体宽度上限（相对第一根实体） */
const MAX_MID_BODY_RATIO = 0.4;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;
  if (index < 4) return null;

  const first = computeGeometry(candles[index - 4]);
  const second = computeGeometry(candles[index - 3]);
  const m1 = computeGeometry(candles[index - 2]);
  const m2 = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || last.body <= 0) return null;

  // 第一根长阳线
  if (!isBullish(first)) return null;
  if (first.body / (first.range || 1) < MIN_FIRST_BODY_RATIO) return null;

  // 第二根阳线
  if (!isBullish(second)) return null;
  // 第二根收盘不低于第一根收盘（保持上行）
  if (second.close < first.close * 0.99) return null;

  // 中间两根小阴线
  if (!isBearish(m1) || !isBearish(m2)) return null;
  if (m1.body > first.body * MAX_MID_BODY_RATIO) return null;
  if (m2.body > first.body * MAX_MID_BODY_RATIO) return null;

  // 第五根长阳线
  if (!isBullish(last)) return null;
  // 收盘突破前 4 根最高
  const maxPrevClose = Math.max(first.close, second.close, m1.close, m2.close);
  if (last.close <= maxPrevClose) return null;

  const strength = blendStrength([
    strengthByRatio(first.body / (first.range || 1), MIN_FIRST_BODY_RATIO, 0.9),
  ]);

  return {
    code: 'mat_hold',
    name: '铺垫形态',
    direction: 'bullish',
    startIndex: index - 4,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const mat_hold: PatternDefinition = {
  code: 'mat_hold',
  name: '铺垫形态',
  candleCount: 5,
  direction: 'bullish',
  requiredTrend: 'up',
  detector,
  description: '上升趋势中长阳 + 阳线 + 小阴回调 + 小阴回调 + 长阳突破，是强势看涨持续信号。',
};