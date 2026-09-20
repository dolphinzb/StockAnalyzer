/**
 * 思量红三兵（Deliberation）
 * 几何条件：
 *   - 第一根、第二根阳线（与红三兵类似）
 *   - 第三根阳线开盘跳空高开于第二根实体之上但收盘接近第二根收盘价（小实体，"思量"）
 * 方向：转折预警（warning）
 * 趋势前提：上升中（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第三根实体宽度相对第二根的最大比例 */
const MAX_LAST_BODY_RATIO = 0.5;
/** 第三根实体宽度理想比例（越小越标准） */
const IDEAL_LAST_BODY_RATIO = 0.2;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;
  if (index < 2) return null;

  const first = computeGeometry(candles[index - 2]);
  const mid = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || mid.body <= 0 || last.body <= 0) return null;

  if (!isBullish(first) || !isBullish(mid) || !isBullish(last)) return null;

  // 前两根收盘递增
  if (mid.close <= first.close) return null;

  // 第三根开盘跳空高开于第二根实体上边界之上
  if (last.open <= mid.close) return null;

  // 第三根是小实体（思量）
  const ratio = last.body / mid.body;
  if (ratio > MAX_LAST_BODY_RATIO) return null;

  // 第三根收盘仍较第二根持平或略高（容差 1%）
  if (last.close < mid.close * 0.99) return null;

  // 强度：第三根实体越小信号越强
  const strength = blendStrength([
    1 - strengthByRatio(ratio, IDEAL_LAST_BODY_RATIO, MAX_LAST_BODY_RATIO),
  ]);

  return {
    code: 'deliberation',
    name: '思量红三兵',
    direction: 'warning',
    startIndex: index - 2,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const deliberation: PatternDefinition = {
  code: 'deliberation',
  name: '思量红三兵',
  candleCount: 3,
  direction: 'warning',
  requiredTrend: 'up',
  detector,
  description: '上升趋势中第三根跳空高开但小阳线，市场犹豫，潜在见顶信号。',
};