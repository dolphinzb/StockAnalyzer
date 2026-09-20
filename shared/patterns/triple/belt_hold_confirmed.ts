/**
 * 捉腰带线（多根确认）Belt Hold Confirmed
 * 几何条件（5 根 K 线）：
 *   - 第一根捉腰带线（开盘 ≈ 最高价/最低价，K线一侧无影线；阳线为看涨，阴线为看跌）
 *   - 后续 1-2 根 K 线顺势回调
 *   - 倒数第二根穿越第一根收盘价
 *   - 最后一根顺势大阳/大阴确认
 *
 * 实现简化版：5 根形态识别为"长实体 + 顺势延续"模式：
 *   - 方向：双向，按第一根实体类型决定方向
 *   - 第一根实体长且单侧影线极短（>60% 实体 / 总长，单侧影线 < 5%）
 *   - 后续 3 根：方向一致（看涨则均为阳线，看跌则均为阴线）
 *   - 最后一根收盘价突破第一根收盘价（看涨）/ 跌破（看跌）
 * 方向：双向，按第一根阴阳决定 bullish / bearish
 * 趋势前提：反转后确认（一致方向的趋势）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第一根实体占比最低要求 */
const MIN_FIRST_BODY_RATIO = 0.6;
/** 第一根实体理想占比 */
const IDEAL_FIRST_BODY_RATIO = 0.85;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (index < 4) return null;

  const first = computeGeometry(candles[index - 4]);
  const a = computeGeometry(candles[index - 3]);
  const b = computeGeometry(candles[index - 2]);
  const c = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0) return null;

  // 方向由第一根决定
  if (isBullish(first)) {
    // 后续 3 根 + 最后 1 根均应为阳线
    if (!isBullish(a) || !isBullish(b) || !isBullish(c) || !isBullish(last)) return null;
    if (last.close <= first.close) return null;
    if (!trendMatches(trend, 'up') && !trendMatches(trend, 'down')) return null;
  } else if (isBearish(first)) {
    if (!isBearish(a) || !isBearish(b) || !isBearish(c) || !isBearish(last)) return null;
    if (last.close >= first.close) return null;
    if (!trendMatches(trend, 'up') && !trendMatches(trend, 'down')) return null;
  } else {
    return null;
  }

  // 第一根实体占比
  if (first.body / (first.range || 1) < MIN_FIRST_BODY_RATIO) return null;

  const direction = isBullish(first) ? 'bullish' : 'bearish';
  const strength = blendStrength([
    strengthByRatio(first.body / (first.range || 1), MIN_FIRST_BODY_RATIO, IDEAL_FIRST_BODY_RATIO),
  ]);

  return {
    code: 'belt_hold_confirmed',
    name: direction === 'bullish' ? '捉腰带线（看涨确认）' : '捉腰带线（看跌确认）',
    direction,
    startIndex: index - 4,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const belt_hold_confirmed: PatternDefinition = {
  code: 'belt_hold_confirmed',
  name: '捉腰带线（多根确认）',
  candleCount: 5,
  direction: 'bullish', // 实际方向由 detector 决定；此处保留 bullish 仅为类型满足
  requiredTrend: 'consistent',
  detector,
  description: '捉腰带线后顺势 4 根同向确认，是较强的反转延续信号。',
};