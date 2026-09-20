/**
 * 插入线（Thrusting）
 * 几何条件：
 *   - 第一根阴线
 *   - 第二根阳线开盘 < 第一根最低价（跳空低开）
 *   - 第二根收盘略低于第一根实体中部（仅小部分深入）
 *   - 第二根收盘 < 第一根开盘价（未完全吞没）
 * 方向：看跌持续（bearish）
 * 趋势前提：下跌后（down）
 *
 * 与刺透形态（Piercing Pattern）的区别：插入线第二根收盘仅深入阴线实体中部以下
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第二根收盘深入第一根实体的最低比例（0~1） */
const MIN_PENETRATION = 0.1;
/** 理想深入比例（恰好在中下部） */
const IDEAL_PENETRATION = 0.3;
/** 第二根收盘必须低于第一根实体中部 */
const MID_BOUNDARY = 0.5;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBearish(prev)) return null;
  if (!isBullish(curr)) return null;

  if (curr.open >= prev.low) return null;
  if (curr.close >= prev.open) return null; // 未完全吞没

  const prevMid = (prev.open + prev.close) / 2;
  if (curr.close >= prevMid) return null; // 必须低于中部

  // 深入比例：(curr.close - prev.low) / (prev.open - prev.low)
  const penetration = (curr.close - prev.low) / (prev.open - prev.low);
  if (penetration < MIN_PENETRATION) return null;
  if (penetration > MID_BOUNDARY) return null;

  const strength = blendStrength([
    strengthByRatio(penetration, MIN_PENETRATION, IDEAL_PENETRATION),
  ]);

  return {
    code: 'thrusting',
    name: '插入线',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const thrusting: PatternDefinition = {
  code: 'thrusting',
  name: '插入线',
  candleCount: 3, // PRD §4.3 归类（实际为 2 根；放此 barrel 保持 PRD 计数）
  direction: 'bearish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势中跳空低开后小阳线仅插入前阴线实体下部，下跌仍将持续。',
};