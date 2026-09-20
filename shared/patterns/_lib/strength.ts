/**
 * 信号强度评分工具库
 * 将形态几何特征的实际值映射到 [0, 1] 强度区间
 *
 * 评分原则（与 PRD §5.3 对齐）：
 * - 实际值 < 阈值下限：0（不应触发命中，仅供评分时使用）
 * - 实际值 = 阈值下限：接近 0（勉强算形态）
 * - 实际值 = 理想上限（教科书标准）：1
 * - 二者之间：线性插值
 */

/**
 * 将数值限制在 [0, 1] 区间
 */
export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 阈值贴近度线性映射
 * 当 actual >= ideal 时返回 1；当 actual <= minRequired 时返回 0；当处于二者之间时线性插值
 *
 * 典型用法：
 *   // 锤子线下影线 ≥ 2 倍实体；理想下影线 ≥ 3 倍实体
 *   strengthByRatio(lowerShadow, 2 * body, 3 * body)
 *
 * @param actual 实际值（如影线长度）
 * @param minRequired 触发形态的最低要求
 * @param ideal 教科书理想值（达到此值视为满分）
 */
export function strengthByRatio(actual: number, minRequired: number, ideal: number): number {
  if (ideal <= minRequired) {
    // 阈值参数不合法时退化为二元判定
    return actual >= minRequired ? 1 : 0;
  }
  if (actual >= ideal) return 1;
  if (actual <= minRequired) return 0;
  return (actual - minRequired) / (ideal - minRequired);
}

/**
 * 多个子评分的加权平均
 * 用于综合形态的多维度特征（如吞没形态同时看实体比例与吞没程度）
 *
 * @param parts 各子评分（已限幅到 [0, 1]）
 * @returns 加权平均，结果限制到 [0, 1]
 */
export function blendStrength(parts: number[]): number {
  if (parts.length === 0) return 0;
  let sum = 0;
  for (const p of parts) sum += clamp01(p);
  return clamp01(sum / parts.length);
}

/**
 * 判定"贴合度"：当实际值与目标值越接近，分数越高
 * 典型用法：墓碑十字/蜻蜓十字要求上/下影线 ≈ 总长（占比高），贴近 1 时最强
 *
 * @param actual 实际占比（如 0.95）
 * @param target 目标占比（教科书理想，如 0.95）
 * @param tolerance 容差（如 0.1），差值 ≤ 容差时为 1
 */
export function proximity(actual: number, target: number, tolerance: number): number {
  if (tolerance <= 0) return actual >= target ? 1 : 0;
  const diff = Math.abs(actual - target);
  if (diff <= 0) return 1;
  if (diff >= tolerance) return 0;
  return 1 - diff / tolerance;
}