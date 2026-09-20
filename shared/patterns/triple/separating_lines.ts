/**
 * 分手线（Separating Lines）
 * 几何条件：
 *   - 第一根阳线（看涨分手线）或阴线（看跌分手线）
 *   - 第二根相同颜色的 K 线（开盘价 ≈ 第一根开盘价）
 *   - 第二根实体需明显大于第一根实体
 * 方向：双向
 *   - 阳线分手线 → 看涨（bullish）
 *   - 阴线分手线 → 看跌（bearish）
 * 趋势前提：持续（consistent）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 第二根开盘与第一根开盘贴合的容差 */
const OPEN_MATCH_TOLERANCE = 0.005;
/** 第二根实体宽度 / 第一根实体宽度 最低比例 */
const MIN_BODY_RATIO = 1.5;
/** 理想比例 */
const IDEAL_BODY_RATIO = 2.5;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up') && !trendMatches(trend, 'down')) return null;

  const prev = computeGeometry(candles[index - 1]);
  const curr = computeGeometry(candles[index]);
  if (prev.body <= 0 || curr.body <= 0) return null;

  // 颜色需一致
  let direction: 'bullish' | 'bearish' | null = null;
  if (isBullish(prev) && isBullish(curr)) direction = 'bullish';
  else if (isBearish(prev) && isBearish(curr)) direction = 'bearish';
  if (direction === null) return null;

  // 开盘价贴合
  if (prev.open <= 0) return null;
  const openDiff = Math.abs(curr.open - prev.open) / prev.open;
  if (openDiff > OPEN_MATCH_TOLERANCE) return null;

  // 第二根实体 ≥ 第一根实体的 1.5 倍
  const ratio = curr.body / prev.body;
  if (ratio < MIN_BODY_RATIO) return null;

  // 顺势校验：方向与趋势一致
  if (direction === 'bullish' && trend.direction !== 'up') return null;
  if (direction === 'bearish' && trend.direction !== 'down') return null;

  const strength = blendStrength([
    strengthByRatio(ratio, MIN_BODY_RATIO, IDEAL_BODY_RATIO),
  ]);

  return {
    code: 'separating_lines',
    name: direction === 'bullish' ? '分手线（看涨）' : '分手线（看跌）',
    direction,
    startIndex: index - 1,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const separating_lines: PatternDefinition = {
  code: 'separating_lines',
  name: '分手线',
  candleCount: 3, // PRD §4.3 归类（实际为 2 根）
  direction: 'bullish',
  requiredTrend: 'consistent',
  detector,
  description: '两根同色 K 线开盘价相同，第二根实体更大，是持续信号。',
};