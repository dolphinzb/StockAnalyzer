/**
 * 搜狐日线本地复权引擎
 *
 * 搜狐 hisHq 返回的价格是不复权价格，但涨跌额/涨跌幅已经按除权除息口径给出。
 * 因此可用「当日收盘 - 涨跌额」反推除权后的前收，与原始前收比较得到事件因子。
 */

import type { MarketKlineItem } from './marketSdkClient';

export interface SohuFactorSet {
  qfq: Map<string, number>;
  hfq: Map<string, number>;
}

export interface SohuDerivedFactors extends SohuFactorSet {
  /** 事件日 → 事件因子；该日之前的全部历史价格需要乘此因子 */
  eventFactors: Map<string, number>;
}

const MIN_EVENT_DELTA = 1e-4;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function impliedPreviousClose(bar: MarketKlineItem): number | null {
  if (!finite(bar.close)) return null;
  if (finite(bar.change)) return bar.close - bar.change;
  if (finite(bar.changePercent) && bar.changePercent > -100) {
    return bar.close / (1 + bar.changePercent / 100);
  }
  return null;
}

function isCorporateAction(rawPreviousClose: number, impliedPrevious: number): boolean {
  if (!finite(rawPreviousClose) || !finite(impliedPrevious) || rawPreviousClose <= 0 || impliedPrevious <= 0) {
    return false;
  }
  const tolerance = Math.max(0.02, (rawPreviousClose + impliedPrevious) * MIN_EVENT_DELTA);
  return Math.abs(impliedPrevious - rawPreviousClose) > tolerance;
}

/**
 * 按日期升序的搜狐原始日线推导事件因子与 raw/qfq/hfq 累计因子。
 */
export function deriveSohuFactors(bars: readonly MarketKlineItem[]): SohuDerivedFactors {
  const sorted = [...bars].sort((left, right) => left.date.localeCompare(right.date));
  const eventFactors = new Map<string, number>();

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const impliedPrevious = impliedPreviousClose(current);
    if (!finite(previous.close) || !finite(impliedPrevious)) continue;
    if (!isCorporateAction(previous.close, impliedPrevious)) continue;

    const factor = impliedPrevious / previous.close;
    if (finite(factor) && factor > 0) {
      eventFactors.set(current.date, factor);
    }
  }

  const qfq = new Map<string, number>();
  const hfq = new Map<string, number>();
  if (sorted.length === 0) {
    return { qfq, hfq, eventFactors };
  }

  let qfqMultiplier = 1;
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const nextDate = index < sorted.length - 1 ? sorted[index + 1].date : null;
    if (nextDate) {
      const nextFactor = eventFactors.get(nextDate);
      if (nextFactor) qfqMultiplier *= nextFactor;
    }
    qfq.set(sorted[index].date, qfqMultiplier);
  }

  let hfqMultiplier = 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const currentFactor = eventFactors.get(sorted[index].date);
    if (currentFactor) hfqMultiplier /= currentFactor;
    hfq.set(sorted[index].date, hfqMultiplier);
  }

  return { qfq, hfq, eventFactors };
}

function hfqBaseAt(factors: ReadonlyMap<string, number>, date: string): number {
  let base = 1;
  let baseDate = '';
  factors.forEach((factor, factorDate) => {
    if (factorDate < date && factorDate > baseDate) {
      baseDate = factorDate;
      base = factor;
    }
  });
  return base;
}

/**
 * 将增量区间推导出的新事件合并到已在内存/数据库中的历史因子。
 * bars 需要包含增量起点前一个交易日，用于识别起点当天是否发生除权除息。
 */
export function mergeSohuFactors(
  stored: SohuFactorSet | null,
  bars: readonly MarketKlineItem[]
): SohuFactorSet {
  const derived = deriveSohuFactors(bars);
  const qfq = new Map<string, number>(stored?.qfq ?? []);
  const hfq = new Map<string, number>(stored?.hfq ?? []);

  derived.eventFactors.forEach((factor, eventDate) => {
    qfq.forEach((value, date) => {
      if (date < eventDate) qfq.set(date, value * factor);
    });
    hfq.forEach((value, date) => {
      if (date >= eventDate) hfq.set(date, value / factor);
    });
  });

  for (const bar of bars) {
    if (!qfq.has(bar.date)) qfq.set(bar.date, derived.qfq.get(bar.date) ?? 1);
    if (!hfq.has(bar.date)) {
      hfq.set(bar.date, hfqBaseAt(hfq, bar.date) * (derived.hfq.get(bar.date) ?? 1));
    }
  }

  return { qfq, hfq };
}

/**
 * 将累计因子应用到原始日线，生成 raw/qfq/hfq 对应序列。
 */
export function applySohuFactors(
  bars: readonly MarketKlineItem[],
  factors: SohuFactorSet,
  adjust: '' | 'qfq' | 'hfq'
): MarketKlineItem[] {
  const factorMap = adjust === 'qfq' ? factors.qfq : factors.hfq;
  const result: MarketKlineItem[] = [];

  for (const bar of bars) {
    if (adjust === '') {
      result.push({ ...bar });
      continue;
    }

    const multiplier = factorMap.get(bar.date) ?? 1;
    const open = finite(bar.open) ? round2(bar.open * multiplier) : bar.open;
    const high = finite(bar.high) ? round2(bar.high * multiplier) : bar.high;
    const low = finite(bar.low) ? round2(bar.low * multiplier) : bar.low;
    const close = finite(bar.close) ? round2(bar.close * multiplier) : bar.close;
    const change = finite(bar.change) ? round2(bar.change * multiplier) : bar.change;

    result.push({
      ...bar,
      open,
      high,
      low,
      close,
      change,
    });
  }

  return result.map((bar, index) => {
    const previousClose = index > 0 && finite(result[index - 1].close) ? result[index - 1].close : null;
    if (!finite(bar.high) || !finite(bar.low) || !finite(previousClose) || previousClose <= 0) {
      return { ...bar, amplitude: null };
    }
    return { ...bar, amplitude: round2(((bar.high - bar.low) / previousClose) * 100) };
  });
}

export function hasUsableFactors(factors: SohuFactorSet | null | undefined): factors is SohuFactorSet {
  return !!factors && factors.qfq.size > 0 && factors.hfq.size > 0;
}
