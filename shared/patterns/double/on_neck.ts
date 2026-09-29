/**
 * 待入线（On Neck）
 * 几何条件：
 *   - 第一根阴线
 *   - 第二根阳线开盘 < 第一根最低价（跳空低开）
 *   - 第二根收盘 ≈ 第一根收盘价（差异 < 0.5%）
 * 方向：看跌持续（bearish）
 * 趋势前提：下跌后（down）
 *
 * 注：经典理论中"待入线"出现在下跌趋势中，预示价格仍将下行（看跌持续信号）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish, readClose } from '../_lib/geometry';
import { blendStrength, proximity } from '../_lib/strength';
import { trendMatches } from '../_lib/trend';

/** 收盘价贴合容差（相对前一根收盘价的比例） */
const CLOSE_MATCH_TOLERANCE = 0.005;

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

  // 收盘价接近前一根收盘价
  const prevClose = readClose(candles[index - 1]);
  const currClose = readClose(candles[index]);
  if (prevClose <= 0) return null;
  const diff = Math.abs(currClose - prevClose) / prevClose;
  if (diff > CLOSE_MATCH_TOLERANCE) return null;

  // 强度：diff 越小越强
  const strength = blendStrength([proximity(diff, 0, CLOSE_MATCH_TOLERANCE)]);

  return {
    code: 'on_neck',
    name: '待入线',
    direction: 'bearish',
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const on_neck: PatternDefinition = {
  code: 'on_neck',
  name: '待入线',
  candleCount: 2,
  direction: 'bearish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势中跳空低开后小阳线收于前阴线收盘价附近，下跌仍将持续。',
};