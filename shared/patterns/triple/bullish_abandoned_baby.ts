/**
 * 看涨弃婴（Bullish Abandoned Baby）
 * 几何条件：
 *   - 第一根阴线
 *   - 第二根十字星，向下跳空（即第二根 high < 第一根 low）
 *   - 第三根阳线，向上跳空（即第三根 low > 第二根 high）
 * 方向：看涨（bullish）
 * 趋势前提：下跌后（down）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish, isDoji } from '../_lib/geometry';
import { blendStrength, strengthByRatio } from '../_lib/strength';
import { trendMatches } from '../_lib/trend';

/** 跳空最低要求（相对前一根实体长度的比例） */
const MIN_GAP_RATIO = 0.05;
/** 理想跳空比例 */
const IDEAL_GAP_RATIO = 0.15;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'down')) return null;
  if (index < 2) return null;

  const first = computeGeometry(candles[index - 2]);
  const mid = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || last.body <= 0) return null;

  if (!isBearish(first)) return null;
  if (!isDoji(mid)) return null;
  if (!isBullish(last)) return null;

  // 第二根向下跳空：mid.high < first.low
  const gapDownRatio = (first.low - mid.high) / first.body;
  if (gapDownRatio < MIN_GAP_RATIO) return null;

  // 第三根向上跳空：last.low > mid.high
  const gapUpRatio = (last.low - mid.high) / first.body;
  if (gapUpRatio < MIN_GAP_RATIO) return null;

  const downStrength = strengthByRatio(gapDownRatio, MIN_GAP_RATIO, IDEAL_GAP_RATIO);
  const upStrength = strengthByRatio(gapUpRatio, MIN_GAP_RATIO, IDEAL_GAP_RATIO);
  const strength = blendStrength([downStrength, upStrength]);

  return {
    code: 'bullish_abandoned_baby',
    name: '看涨弃婴',
    direction: 'bullish',
    startIndex: index - 2,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const bullish_abandoned_baby: PatternDefinition = {
  code: 'bullish_abandoned_baby',
  name: '看涨弃婴',
  candleCount: 3,
  direction: 'bullish',
  requiredTrend: 'down',
  detector,
  description: '下跌趋势末端的强反转：阴线 + 向下跳空十字 + 向上跳空阳线。',
};