/**
 * 切入线（In Neck）
 * 几何条件：
 *   - 第一根阴线
 *   - 第二根阳线开盘 < 第一根最低价（跳空低开）
 *   - 第二根收盘略高于第一根收盘价（差异 < 1% 且 > 0）
 * 方向：看跌持续（bearish）
 * 趋势前提：下跌后（down）
 *
 * 与待入线的区别：切入线第二根收盘价略高于第一根收盘价
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish, readClose } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, proximity } from '../_lib/strength';

/** 收盘价差值上限（相对前一根收盘价的比例） */
const CLOSE_DIFF_MAX = 0.01;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  if (!isBearish(prev)) return null;
  if (!isBullish(curr)) return null;

  // 跳空低开
  if (curr.open >= prev.low) return null;

  // 第二根收盘略高于前一根收盘
  const prevClose = readClose(candles[index - 1]);
  const currClose = readClose(candles[index]);
  if (prevClose <= 0) return null;
  const diff = currClose - prevClose;
  if (diff <= 0) return null;
  const diffRatio = diff / prevClose;
  if (diffRatio > CLOSE_DIFF_MAX) return null;

  // 强度：差值越小越接近"贴合"，越强
  const strength = blendStrength([proximity(diffRatio, 0, CLOSE_DIFF_MAX)]);

  return {
    code: 'in_neck',
    name: '切入线',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const in_neck: PatternDefinition = {
  code: 'in_neck',
  name: '切入线',
  candleCount: 2,
  direction: 'bearish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势中跳空低开后小阳线略切入前阴线收盘，下跌趋势仍将持续。',
};