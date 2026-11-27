/**
 * 数据质量异常检测（纯函数）
 *
 * 设计原则：由数据源确保完整性，质量问题「只记录不阻断」导入。
 * 本模块只产出待写入 `data_quality_issues` 的记录，不做任何修复动作。
 */

import type { MarketDailyBar } from './marketPeriod';

/** 质量异常类型（与 data_quality_issues.issue_type 一致） */
export type MarketQualityIssueType =
  | 'gap'
  | 'ohlc_invalid'
  | 'duplicate'
  | 'price_jump'
  | 'stale'
  | 'factor_invalid';

/** 待写入的质量异常记录 */
export interface MarketQualityIssue {
  stockCode: string;
  tradeDate: string | null;
  issueType: MarketQualityIssueType;
  detail: string | null;
}

/** 单次任务最多记录的缺口条数（避免个别标的产生海量行） */
export const GAP_ISSUE_LIMIT = 200;

/** 单次任务最多记录的异常条数上限 */
export const ISSUE_LIMIT = 500;

/**
 * OHLC 非法：`low > open|close` 或 `high < open|close`
 */
export function detectOhlcInvalid(stockCode: string, bars: readonly MarketDailyBar[]): MarketQualityIssue[] {
  const issues: MarketQualityIssue[] = [];
  for (const bar of bars) {
    const { open, high, low, close } = bar;
    if (open === null || high === null || low === null || close === null) {
      continue;
    }
    const invalid =
      low > open || low > close || high < open || high < close || high < low || low < 0;
    if (invalid) {
      issues.push({
        stockCode,
        tradeDate: bar.tradeDate,
        issueType: 'ohlc_invalid',
        detail: `O=${open} H=${high} L=${low} C=${close}`,
      });
    }
    if (issues.length >= ISSUE_LIMIT) {
      break;
    }
  }
  return issues;
}

/**
 * 同一任务返回重复交易日
 */
export function detectDuplicateDates(
  stockCode: string,
  bars: readonly Pick<MarketDailyBar, 'tradeDate'>[]
): MarketQualityIssue[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const bar of bars) {
    if (seen.has(bar.tradeDate)) {
      duplicated.add(bar.tradeDate);
    }
    seen.add(bar.tradeDate);
  }
  return Array.from(duplicated)
    .slice(0, ISSUE_LIMIT)
    .map(tradeDate => ({
    stockCode,
    tradeDate,
    issueType: 'duplicate' as const,
    detail: '数据源返回重复交易日',
  }));
}

/**
 * 相邻交易日收盘价异常波动
 * @param threshold 绝对涨跌幅阈值（默认 50%）
 */
export function detectPriceJump(
  stockCode: string,
  bars: readonly MarketDailyBar[],
  threshold = 0.5
): MarketQualityIssue[] {
  const issues: MarketQualityIssue[] = [];
  let previousClose: number | null = null;
  for (const bar of bars) {
    if (bar.close === null || !Number.isFinite(bar.close)) {
      continue;
    }
    if (previousClose !== null && previousClose > 0) {
      const change = Math.abs(bar.close / previousClose - 1);
      if (change > threshold) {
        issues.push({
          stockCode,
          tradeDate: bar.tradeDate,
          issueType: 'price_jump',
          detail: `${previousClose} → ${bar.close}（${(change * 100).toFixed(2)}%）`,
        });
      }
    }
    previousClose = bar.close;
    if (issues.length >= ISSUE_LIMIT) {
      break;
    }
  }
  return issues;
}

/**
 * 交易日缺口：日历中有交易日但该证券无日线
 * @param expected 期望交易日（升序）
 * @param actual 实际返回的交易日
 */
export function detectGap(
  stockCode: string,
  expected: readonly string[],
  actual: readonly string[],
  limit = GAP_ISSUE_LIMIT
): MarketQualityIssue[] {
  const actualSet = new Set(actual);
  const issues: MarketQualityIssue[] = [];
  for (const tradeDate of expected) {
    if (actualSet.has(tradeDate)) {
      continue;
    }
    issues.push({
      stockCode,
      tradeDate,
      issueType: 'gap',
      detail: '交易日历存在该交易日但无日线数据',
    });
    if (issues.length >= limit) {
      break;
    }
  }
  return issues;
}

/**
 * 长期未更新：区间终点远晚于最后一根日线
 * @param thresholdDays 允许的滞后天数（默认 30 天）
 */
export function detectStale(
  stockCode: string,
  lastBarDate: string | null,
  endDate: string,
  thresholdDays = 30
): MarketQualityIssue[] {
  if (!lastBarDate) {
    return [];
  }
  const last = Date.parse(`${lastBarDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(last) || Number.isNaN(end)) {
    return [];
  }
  const days = Math.floor((end - last) / (24 * 60 * 60 * 1000));
  if (days <= thresholdDays) {
    return [];
  }
  return [
    {
      stockCode,
      tradeDate: lastBarDate,
      issueType: 'stale',
      detail: `最后一根日线 ${lastBarDate} 落后区间终点 ${endDate} 共 ${days} 天`,
    },
  ];
}

/**
 * 因子非法：raw 收盘价非正，或推导出的因子非正
 */
export function detectFactorInvalid(
  stockCode: string,
  rows: ReadonlyArray<{
    tradeDate: string;
    rawClose: number | null;
    qfqFactor: number | null;
    hfqFactor: number | null;
  }>
): MarketQualityIssue[] {
  const issues: MarketQualityIssue[] = [];
  for (const row of rows) {
    const raw = row.rawClose;
    if (raw === null || !Number.isFinite(raw) || raw <= 0) {
      issues.push({
        stockCode,
        tradeDate: row.tradeDate,
        issueType: 'factor_invalid',
        detail: `原始收盘价无效: ${String(raw)}`,
      });
    } else {
      const invalid =
        (row.qfqFactor !== null && (!Number.isFinite(row.qfqFactor) || row.qfqFactor <= 0)) ||
        (row.hfqFactor !== null && (!Number.isFinite(row.hfqFactor) || row.hfqFactor <= 0));
      if (invalid) {
        issues.push({
          stockCode,
          tradeDate: row.tradeDate,
          issueType: 'factor_invalid',
          detail: `因子非正: qfq=${String(row.qfqFactor)} hfq=${String(row.hfqFactor)}`,
        });
      }
    }
    if (issues.length >= ISSUE_LIMIT) {
      break;
    }
  }
  return issues;
}
