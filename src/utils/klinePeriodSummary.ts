import { KLINE_PERIOD_LABELS, type KlineDownloadPeriodResult } from '../../shared/types';

/** 周期结果文案（行内展示 + 悬停/提示完整文本） */
export interface PeriodSummaryText {
  /** 行内展示用：超长时优先保留失败周期信息并截断 */
  short: string;
  /** Toast / title 用：完整文案 */
  full: string;
}

/** 行内文案默认最大长度（中文字符按 1 计） */
const DEFAULT_MAX_LENGTH = 36;

/**
 * 构建单个周期的展示片段
 * 成功 → 「日线 不复权 5 条 · 前复权 5 条」；失败 → 「周线 失败：未获取到K线数据」
 * @param item 单周期下载明细
 * @returns 文案片段与该片段是否代表失败
 */
function buildSegment(item: KlineDownloadPeriodResult): { text: string; failed: boolean } {
  const label = KLINE_PERIOD_LABELS[item.period] ?? item.period;

  if (!item.success) {
    return { text: `${label} 失败：${item.error || '未获取到K线数据'}`, failed: true };
  }

  const parts: string[] = [];
  if (item.unadjustedCount !== undefined) {
    parts.push(`不复权 ${item.unadjustedCount} 条`);
  }
  if (item.adjustedCount !== undefined) {
    parts.push(`前复权 ${item.adjustedCount} 条`);
  }

  return { text: `${label} ${parts.length > 0 ? parts.join(' · ') : '成功'}`, failed: false };
}

/**
 * 按周期格式化下载结果文案
 * 失败周期的信息优先保留：超长截断时先丢弃成功周期片段，仍超长才截断文本本身
 * @param byPeriod 按周期的下载明细
 * @param maxLength 行内文案最大长度
 * @returns 行内文案与完整文案
 */
export function formatPeriodCounts(
  byPeriod: KlineDownloadPeriodResult[] | undefined,
  maxLength: number = DEFAULT_MAX_LENGTH
): PeriodSummaryText {
  if (!byPeriod || byPeriod.length === 0) {
    return { short: '成功', full: '成功' };
  }

  const segments = byPeriod.map(buildSegment);
  const full = segments.map(segment => segment.text).join('；');

  if (full.length <= maxLength) {
    return { short: full, full };
  }

  // 超长：优先保留失败周期，避免失败原因被截掉
  const failedText = segments.filter(segment => segment.failed).map(segment => segment.text).join('；');
  if (failedText.length > 0) {
    const short = failedText.length <= maxLength ? `${failedText}…` : `${failedText.slice(0, maxLength)}…`;
    return { short, full };
  }

  return { short: `${full.slice(0, maxLength)}…`, full };
}
