/**
 * 趋势判定工具库
 * 实现 MA5/MA10 计算与 TrendInfo.direction 判定（up/down/flat）
 * 在 K 线 < 20 根时返回 flat（无法计算 MA10）
 */
import type { KlineData, TrendInfo, TrendDirection } from '../../types';
import { readClose } from './geometry';

/**
 * 计算 N 日均线（简单移动平均）
 * @param values 价格序列
 * @param period 周期
 * @returns 末点的均线值；数据不足时返回 null
 */
export function computeMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  let sum = 0;
  for (const v of slice) sum += v;
  return sum / period;
}

/**
 * 计算 K 线序列在 index 位置的趋势上下文
 * - K 线 < 20 根 → flat
 * - MA5 > MA10 且 收盘 > 10 根前收盘 → up
 * - MA5 < MA10 且 收盘 < 10 根前收盘 → down
 * - 其余 → flat
 *
 * @param candles K 线序列（按日期升序）
 * @param index 当前检测位置
 */
export function computeTrend(candles: KlineData[], index: number): TrendInfo {
  // 数据不足时统一返回零值 + flat（与 PRD §8 "K 线不足" 处理一致）
  if (candles.length < 20) {
    const fallbackClose = index >= 0 && index < candles.length ? readClose(candles[index]) : 0;
    return { direction: 'flat', ma5: fallbackClose, ma10: fallbackClose };
  }

  if (index < 0 || index >= candles.length) {
    return { direction: 'flat', ma5: 0, ma10: 0 };
  }

  // 收集到 index（含）为止的收盘价序列
  const closes: number[] = [];
  for (let i = 0; i <= index; i++) {
    closes.push(readClose(candles[i]));
  }

  const ma5 = computeMA(closes, 5);
  const ma10 = computeMA(closes, 10);
  if (ma5 === null || ma10 === null) {
    return { direction: 'flat', ma5: 0, ma10: 0 };
  }

  // 10 根前收盘价（即 index - 10 处的收盘价）
  const prevIndex = index - 10;
  if (prevIndex < 0) {
    return { direction: 'flat', ma5, ma10 };
  }
  const prevClose = readClose(candles[prevIndex]);
  const curClose = readClose(candles[index]);

  let direction: TrendDirection = 'flat';
  if (ma5 > ma10 && curClose > prevClose) {
    direction = 'up';
  } else if (ma5 < ma10 && curClose < prevClose) {
    direction = 'down';
  }

  return { direction, ma5, ma10 };
}

/**
 * 判断趋势是否满足形态所需的前提
 * - 'up': 要求 direction === 'up'
 * - 'down': 要求 direction === 'down'
 * - 'any': 任意
 * - 'consistent': 形态方向需与趋势方向一致（看涨形态看趋势 up，看跌看 down，warning 看 flat 也算）
 *   - 此函数仅处理 up/down/any；consistent 由调用方根据形态方向自行判定
 */
export function trendMatches(trend: TrendInfo, required: 'up' | 'down' | 'any' | 'consistent'): boolean {
  if (required === 'any') return true;
  if (required === 'consistent') return true; // consistent 由调用方补充判断
  return trend.direction === required;
}