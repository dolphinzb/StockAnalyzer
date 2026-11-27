/**
 * 全市场行情库的周期派生与复权聚合（纯函数）
 *
 * 口径（见 change design D5）：
 * - 周 `period_start_date` 为自然周周一，月为 `YYYY-MM-01`
 * - `period_end_date` 为当前已纳入的最后一个交易日
 * - `is_final` 由交易日历判定：该周期之后没有更多交易日则为 1
 * - 只保存不复权聚合；复权周/月线必须「逐日应用因子后再聚合」
 */

/** 原始日线（读取自 kline_daily_raw） */
export interface MarketDailyBar {
  tradeDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  amount: number | null;
  turnoverRate: number | null;
}

/** 派生周期记录（周/月） */
export interface MarketDerivedBar {
  periodStartDate: string;
  periodEndDate: string;
  isFinal: boolean;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  amount: number | null;
  turnoverRate: number | null;
}

/** 复权派生周期记录（读取时按日线逐日应用因子后聚合） */
export interface MarketAdjustedPeriodBar extends MarketDerivedBar {
  changePercent: number | null;
  changeAmount: number | null;
  amplitude: number | null;
}

/** 派生周期类型 */
export type MarketPeriod = 'weekly' | 'monthly';

/**
 * 自然周周一（YYYY-MM-DD）
 * 以 UTC 计算，避免本地时区偏移导致跨日
 */
export function weekStartOf(date: string): string {
  const parsed = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  const dayOfWeek = parsed.getUTCDay(); // 0=周日
  const offset = (dayOfWeek + 6) % 7; // 周一=0
  parsed.setUTCDate(parsed.getUTCDate() - offset);
  return parsed.toISOString().slice(0, 10);
}

/** 自然月第一天（YYYY-MM-01） */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * 取日期所属周期的稳定标识
 * @param date YYYY-MM-DD
 * @param period 周期类型
 */
export function periodStartOf(date: string, period: MarketPeriod): string {
  return period === 'weekly' ? weekStartOf(date) : monthStartOf(date);
}

/**
 * 构建「交易日 → 下一交易日」映射
 * @param calendar 升序交易日（YYYY-MM-DD）
 */
export function buildNextTradingDayMap(calendar: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let index = 0; index < calendar.length - 1; index += 1) {
    map.set(calendar[index], calendar[index + 1]);
  }
  return map;
}

/**
 * 判断某周期是否已经结束（按交易日历该周期内已无后续交易日）
 * @param periodEndDate 周期内当前最后一个交易日
 * @param period 周期类型
 * @param nextTradingDayMap buildNextTradingDayMap 的结果
 */
export function isPeriodFinal(
  periodEndDate: string,
  period: MarketPeriod,
  nextTradingDayMap: Map<string, string>
): boolean {
  const next = nextTradingDayMap.get(periodEndDate);
  if (!next) {
    return true;
  }
  return periodStartOf(next, period) !== periodStartOf(periodEndDate, period);
}

/** 求和：全为 null 时返回 null */
function sumOf(values: Array<number | null>): number | null {
  let total = 0;
  let hasValue = false;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      hasValue = true;
    }
  }
  return hasValue ? total : null;
}

/** 极值：全为 null 时返回 null */
function extremeOf(values: Array<number | null>, mode: 'max' | 'min'): number | null {
  const numbers = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value)
  );
  if (numbers.length === 0) {
    return null;
  }
  return mode === 'max' ? Math.max(...numbers) : Math.min(...numbers);
}

/**
 * 把升序日线聚合为周/月线（不复权）
 * @param bars 按交易日升序的原始日线
 * @param period 周期类型
 * @param calendar 升序交易日（用于判定 is_final；缺省视为全部已完成）
 */
export function aggregateBars(
  bars: readonly MarketDailyBar[],
  period: MarketPeriod,
  calendar: readonly string[] = []
): MarketDerivedBar[] {
  const nextMap = buildNextTradingDayMap(calendar);
  const groups = new Map<string, MarketDailyBar[]>();

  for (const bar of bars) {
    const key = periodStartOf(bar.tradeDate, period);
    const group = groups.get(key);
    if (group) {
      group.push(bar);
    } else {
      groups.set(key, [bar]);
    }
  }

  const result: MarketDerivedBar[] = [];
  const orderedGroups = Array.from(groups.entries()).sort((left, right) =>
    left[0].localeCompare(right[0])
  );
  for (const [periodStartDate, group] of orderedGroups) {
    const ordered = [...group].sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
    const periodEndDate = ordered[ordered.length - 1].tradeDate;
    result.push({
      periodStartDate,
      periodEndDate,
      isFinal: isPeriodFinal(periodEndDate, period, nextMap),
      open: ordered[0].open,
      high: extremeOf(ordered.map(bar => bar.high), 'max'),
      low: extremeOf(ordered.map(bar => bar.low), 'min'),
      close: ordered[ordered.length - 1].close,
      volume: sumOf(ordered.map(bar => bar.volume)),
      amount: sumOf(ordered.map(bar => bar.amount)),
      turnoverRate: sumOf(ordered.map(bar => bar.turnoverRate)),
    });
  }

  return result;
}

/**
 * 复权周期聚合：先对每个交易日应用因子，再按周/月聚合
 *
 * 禁止用周/月 OHLC 乘单一因子：因子会因分红送转按日变化。
 * @param bars 升序日线，每行带当日复权因子
 * @param period 周期类型
 * @param calendar 升序交易日
 */
export function aggregateAdjustedBars(
  bars: ReadonlyArray<MarketDailyBar & { factor: number }>,
  period: MarketPeriod,
  calendar: readonly string[] = []
): MarketAdjustedPeriodBar[] {
  const scaled: MarketDailyBar[] = bars
    .filter(bar => Number.isFinite(bar.factor) && bar.factor > 0)
    .map(bar => ({
      ...bar,
      open: bar.open === null ? null : bar.open * bar.factor,
      high: bar.high === null ? null : bar.high * bar.factor,
      low: bar.low === null ? null : bar.low * bar.factor,
      close: bar.close === null ? null : bar.close * bar.factor,
    }));

  const merged = aggregateBars(scaled, period, calendar);
  return merged.map((bar, index) => {
    const previousClose = index > 0 ? merged[index - 1].close : null;
    const hasPrevious = typeof previousClose === 'number' && previousClose > 0;
    const hasClose = typeof bar.close === 'number';
    const changeAmount = hasPrevious && hasClose ? (bar.close as number) - previousClose : null;
    const changePercent =
      changeAmount === null ? null : (changeAmount / (previousClose as number)) * 100;
    const amplitude =
      hasPrevious && typeof bar.high === 'number' && typeof bar.low === 'number'
        ? ((bar.high - bar.low) / previousClose) * 100
        : null;
    return { ...bar, changeAmount, changePercent, amplitude };
  });
}
