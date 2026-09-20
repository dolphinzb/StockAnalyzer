/**
 * 十字星（Doji）
 * 几何条件：开盘价 ≈ 收盘价（实体占总长 < 5%）
 * 方向：转折预警（warning）
 * 趋势前提：任意
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isDoji } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength } from '../_lib/strength';

/** 实体占比阈值（标准十字星：5%） */
const DOJI_BODY_RATIO = 0.05;

/** detector 实现 */
function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  // 趋势前提：任意（不做方向校验）
  if (!trendMatches(trend, 'any')) return null;

  const geo = computeGeometry(candles[index]);
  if (!isDoji(geo, DOJI_BODY_RATIO)) return null;

  // 强度：实体占比越小，越接近教科书标准十字星
  // bodyRatio 范围 [0, 0.05]，理想 0 → 1，最低 0.05 → 0
  const bodyStrength = 1 - geo.body / (geo.range || 1) / DOJI_BODY_RATIO;
  const strength = blendStrength([Math.max(0, bodyStrength)]);

  return {
    code: 'doji',
    name: '十字星',
    direction: 'warning',
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const doji: PatternDefinition = {
  code: 'doji',
  name: '十字星',
  candleCount: 1,
  direction: 'warning',
  requiredTrend: 'any',
  detector,
  description: '开盘价与收盘价几乎相同，多空力量均衡，常出现在趋势末端预示反转。',
};