/**
 * 看跌弃婴（Bearish Abandoned Baby）
 * 几何条件：
 *   - 第一根阳线
 *   - 第二根十字星，向上跳空（第二根 low > 第一根 high）
 *   - 第三根阴线，向下跳空（第三根 high < 第二根 low）
 * 方向：看跌（bearish）
 * 趋势前提：上涨后（up）
 */
import type { PatternContext, PatternDefinition, PatternHit } from '../../types';
import { computeGeometry, isBearish, isBullish, isDoji } from '../_lib/geometry';
import { trendMatches } from '../_lib/trend';
import { blendStrength, strengthByRatio } from '../_lib/strength';

const MIN_GAP_RATIO = 0.05;
const IDEAL_GAP_RATIO = 0.15;

function detector(ctx: PatternContext): PatternHit | null {
  const { candles, index, trend } = ctx;
  if (!trendMatches(trend, 'up')) return null;
  if (index < 2) return null;

  const first = computeGeometry(candles[index - 2]);
  const mid = computeGeometry(candles[index - 1]);
  const last = computeGeometry(candles[index]);
  if (first.body <= 0 || last.body <= 0) return null;

  if (!isBullish(first)) return null;
  if (!isDoji(mid)) return null;
  if (!isBearish(last)) return null;

  // 第二根向上跳空：mid.low > first.high
  const gapUpRatio = (mid.low - first.high) / first.body;
  if (gapUpRatio < MIN_GAP_RATIO) return null;

  // 第三根向下跳空：last.high < mid.low
  const gapDownRatio = (mid.low - last.high) / first.body;
  if (gapDownRatio < MIN_GAP_RATIO) return null;

  const upStrength = strengthByRatio(gapUpRatio, MIN_GAP_RATIO, IDEAL_GAP_RATIO);
  const downStrength = strengthByRatio(gapDownRatio, MIN_GAP_RATIO, IDEAL_GAP_RATIO);
  const strength = blendStrength([upStrength, downStrength]);

  return {
    code: 'bearish_abandoned_baby',
    name: '看跌弃婴',
    direction: 'bearish',
    startIndex: index - 2,
    endIndex: index,
    strength,
    trendContext: trend.direction,
  };
}

export const bearish_abandoned_baby: PatternDefinition = {
  code: 'bearish_abandoned_baby',
  name: '看跌弃婴',
  candleCount: 3,
  direction: 'bearish',
  requiredTrend: 'up',
  detector,
  description: '上涨趋势末端的强反转：阳线 + 向上跳空十字 + 向下跳空阴线。',
};