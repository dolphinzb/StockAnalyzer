/**
 * 光头光脚（Marubozu）
 * 几何条件：实体几乎占据整根 K 线（实体 / 总长 ≥ 90%），几乎没有影线
 * 方向：双向（按阴阳）：阳线 → bullish；阴线 → bearish
 * 趋势前提：持续（consistent，形态方向需与趋势方向一致）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish } from '../_lib/geometry';
import { blendStrength, strengthByRatio } from '../_lib/strength';

/** 实体占比最低要求 */
const MIN_BODY_RATIO = 0.9;
/** 实体占比理想值（满分） */
const IDEAL_BODY_RATIO = 0.98;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  const geo = computeGeometry(candles[index]);
  if (geo.range <= 0) return null;

  const ratio = geo.body / geo.range;
  if (ratio < MIN_BODY_RATIO) return null;

  const direction = isBullish(geo) ? 'bullish' : isBearish(geo) ? 'bearish' : 'warning';
  if (direction === 'warning') return null;

  // 趋势需与形态方向一致（持续信号）
  const trendOk =
    (direction === 'bullish' && trend.direction === 'up') ||
    (direction === 'bearish' && trend.direction === 'down');
  if (!trendOk) return null;

  const strength = blendStrength([
    strengthByRatio(ratio, MIN_BODY_RATIO, IDEAL_BODY_RATIO),
  ]);

  return {
    code: 'marubozu',
    name: direction === 'bullish' ? '光头光脚阳线' : '光头光脚阴线',
    direction,
    startIndex: index,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const marubozu: PatternDefinition = {
  code: 'marubozu',
  name: '光头光脚',
  candleCount: 1,
  direction: 'bullish', // 实际方向由 detector 决定；此处保留 bullish 仅为类型满足
  requiredTrend: 'consistent',
  detector,
  description: '实体几乎占据整根 K 线、无影线的强趋势 K 线。阳线为看涨持续，阴线为看跌持续。',
};