/**
 * 蜡烛图形态识别库 —— 公开入口
 *
 * 设计原则：
 * 1. 渲染进程**仅**通过本文件 import，不直接 import 单根/双根/三根子目录
 * 2. 所有 detector 为纯函数，无 fs / electron 依赖
 * 3. 检测入口 `detectPatterns(candles)` 在 K 线 < 20 根时返回空数组（与 PRD §8 一致）
 */
import type { KlineData, PatternDefinition, PatternHit } from '../types';

// 注：REGISTRY_COUNTS 仅作为公开导出（外部消费方用），本文件不直接引用
import { computeTrend } from './_lib/trend';
import { REGISTRY } from './registry';

export type { PatternDefinition, PatternHit } from '../types';
export {
  bodyRatio, computeGeometry, EPSILON, isBearish, isBullish, isDoji,
  isStar, lowerShadowRatio, readClose,
  readHigh,
  readLow, readOpen, upperShadowRatio
} from './_lib/geometry';
export type { CandleColor, CandleGeometry } from './_lib/geometry';
export { blendStrength, clamp01, proximity, strengthByRatio } from './_lib/strength';
export { computeTrend } from './_lib/trend';
export { REGISTRY, REGISTRY_COUNTS } from './registry';

/** 最小 K 线根数（用于 MA10 计算） */
export const MIN_KLINE_FOR_DETECTION = 20;

/**
 * 检测 K 线序列中的所有形态命中
 *
 * 行为：
 * - K 线数 < 20：返回 []（与 PRD §8 "数据不足" 一致）
 * - 遍历每根 K 线作为形态末根，按 candleCount 向前取形态窗口
 * - 同一 (code, endIndex) 仅保留强度最高的一次命中
 * - 默认按 (endIndex, descending) → (strength, descending) 排序
 *
 * @param candles 按日期升序的 K 线数据
 */
export function detectPatterns(candles: KlineData[]): PatternHit[] {
  if (candles.length < MIN_KLINE_FOR_DETECTION) {
    return [];
  }

  // 用 Map 实现 (code, endIndex) 去重，保留强度最高者
  const dedup = new Map<string, PatternHit>();

  for (let i = 0; i < candles.length; i++) {
    const trend = computeTrend(candles, i);
    const ctx = { candles, index: i, trend };

    for (const def of REGISTRY) {
      // 末根 K 线索引必须能容纳形态所需根数
      if (i < def.candleCount - 1) continue;

      const hit = safeInvoke(def, ctx);
      if (hit === null) continue;

      const key = `${def.code}@${hit.endIndex}`;
      const existing = dedup.get(key);
      if (!existing || hit.strength > existing.strength) {
        dedup.set(key, hit);
      }
    }
  }

  // 默认排序：先按 endIndex 倒序（最近的形态靠前），再按 strength 倒序
  const hits = Array.from(dedup.values());
  hits.sort((a, b) => {
    if (a.endIndex !== b.endIndex) return b.endIndex - a.endIndex;
    return b.strength - a.strength;
  });
  return hits;
}

/**
 * 安全调用 detector（捕获异常，避免单个 detector 报错中断整次扫描）
 * - 设计理由：算法库为第三方拓展点，单个 detector 抛错不应影响其他形态命中
 */
function safeInvoke(def: PatternDefinition, ctx: Parameters<PatternDefinition['detector']>[0]): PatternHit | null {
  try {
    return def.detector(ctx);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[patterns] detector "${def.code}" threw:`, err);
    return null;
  }
}