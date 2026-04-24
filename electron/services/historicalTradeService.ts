import log from 'electron-log';
import type { HistoricalTradeRecord, TradeDetail } from '../../shared/types';
import type { TradeRecord } from '../database';
import { getAllTradeRecords, getTradeRecordsByStockCode } from '../database';

/**
 * 交易周期内部数据结构
 * 代表一个开仓-清仓周期内的所有交易记录
 */
interface TradeCycle {
  /** 股票代码 */
  stockCode: string;
  /** 股票名称 */
  stockName: string;
  /** 周期索引 */
  cycleIndex: number;
  /** 开仓交易记录 */
  openTrade: TradeRecord;
  /** 清仓交易记录 */
  closeTrade: TradeRecord;
  /** 周期内所有交易记录（按时间正序） */
  trades: TradeRecord[];
}

/**
 * 计算买入交易手续费
 * 公式：MAX(成交金额 × 0.0005, 5元) + 成交金额 × 0.00001
 * @param amount 成交金额（成交价格 × 成交数量）
 * @returns 手续费金额（元）
 */
export function calculateBuyFee(amount: number): number {
  return Math.max(amount * 0.0005, 5) + amount * 0.00001;
}

/**
 * 计算卖出交易手续费
 * 公式：MAX(成交金额 × 0.0005, 5元) + 成交金额 × 0.00001 + 成交金额 × 0.0005
 * @param amount 成交金额（成交价格 × 成交数量）
 * @returns 手续费金额（元）
 */
export function calculateSellFee(amount: number): number {
  return Math.max(amount * 0.0005, 5) + amount * 0.00001 + amount * 0.0005;
}

/**
 * 识别所有股票的交易周期
 * 遍历所有交易记录，按股票代码分组，识别每个开仓-清仓周期
 * @returns 交易周期数组
 */
function identifyAllCycles(): TradeCycle[] {
  const allRecords = getAllTradeRecords();
  if (allRecords.length === 0) {
    return [];
  }

  // 按股票代码分组
  const stockGroups = new Map<string, TradeRecord[]>();
  for (const record of allRecords) {
    if (!stockGroups.has(record.stockCode)) {
      stockGroups.set(record.stockCode, []);
    }
    stockGroups.get(record.stockCode)!.push(record);
  }

  const allCycles: TradeCycle[] = [];

  // 对每只股票识别交易周期
  stockGroups.forEach((records, stockCode) => {
    const cycles = identifyStockCycles(stockCode, records);
    allCycles.push(...cycles);
  });

  return allCycles;
}

/**
 * 识别单只股票的所有交易周期
 * @param stockCode 股票代码
 * @param records 该股票的交易记录数组（已按时间正序排列）
 * @returns 该股票的交易周期数组
 */
function identifyStockCycles(stockCode: string, records: TradeRecord[]): TradeCycle[] {
  const cycles: TradeCycle[] = [];
  let cycleIndex = 0;
  let currentCycleTrades: TradeRecord[] = [];
  let openTrade: TradeRecord | null = null;
  let inCycle = false;

  for (const record of records) {
    if (!inCycle) {
      // 不在周期内，寻找开仓点
      // 开仓点定义：holdingCount 从 0 开始的首次买入交易
      if (record.tradeType === 'BUY' && record.holdingCount > 0) {
        // 检查之前的持仓是否为0（或者是第一笔交易）
        const prevRecord = getPreviousRecord(records, record);
        if (!prevRecord || prevRecord.holdingCount === 0) {
          // 找到开仓点
          inCycle = true;
          openTrade = record;
          currentCycleTrades = [record];
        }
      }
    } else {
      // 在周期内，添加交易记录
      currentCycleTrades.push(record);

      // 清仓点定义：卖出交易后 holdingCount 变为 0
      if (record.tradeType === 'SELL' && record.holdingCount === 0) {
        // 找到清仓点，完成一个周期
        cycles.push({
          stockCode,
          stockName: record.stockName,
          cycleIndex,
          openTrade: openTrade!,
          closeTrade: record,
          trades: [...currentCycleTrades],
        });

        cycleIndex++;
        inCycle = false;
        openTrade = null;
        currentCycleTrades = [];
      }
    }
  }

  return cycles;
}

/**
 * 获取交易记录的前一条记录
 * @param records 所有交易记录数组
 * @param current 当前交易记录
 * @returns 前一条交易记录，如果没有则返回 null
 */
function getPreviousRecord(records: TradeRecord[], current: TradeRecord): TradeRecord | null {
  const index = records.findIndex(r => r.id === current.id);
  if (index <= 0) {
    return null;
  }
  return records[index - 1];
}

/**
 * 计算交易周期的统计数据
 * @param cycle 交易周期
 * @returns 历史开仓记录
 */
export function calculateCycleStats(cycle: TradeCycle): HistoricalTradeRecord {
  let totalBuyCount = 0;
  let totalSellCount = 0;
  let totalShares = 0;
  let totalBuyAmount = 0;
  let totalSellAmount = 0;
  let totalDividendAmount = 0;
  let totalFees = 0;

  for (const trade of cycle.trades) {
    const amount = trade.tradePrice * trade.tradeCount;

    if (trade.tradeType === 'BUY') {
      totalBuyCount++;
      totalShares += trade.tradeCount;
      totalBuyAmount += amount;
      totalFees += calculateBuyFee(amount);
    } else if (trade.tradeType === 'SELL') {
      totalSellCount++;
      totalSellAmount += Math.abs(amount);
      totalFees += calculateSellFee(Math.abs(amount));
    } else if (trade.tradeType === 'DIVIDEND') {
      // 分红金额 = trade_price × holding_count × 0.9
      totalDividendAmount += trade.tradePrice * trade.holdingCount * 0.9;
    }
  }

  // 总盈利 = 总卖出金额 + 分红金额 - 总买入金额 - 总手续费
  const totalProfit = totalSellAmount + totalDividendAmount - totalBuyAmount - totalFees;

  // 盈利比例 = (总盈利 / 总买入金额) × 100%
  // 当总买入金额为 0 时，盈利比例为 0
  const profitRatio = totalBuyAmount > 0 ? (totalProfit / totalBuyAmount) * 100 : 0;

  return {
    id: `${cycle.stockCode}_${cycle.cycleIndex}`,
    stockCode: cycle.stockCode,
    stockName: cycle.stockName,
    openTime: cycle.openTrade.tradeDate,
    closeTime: cycle.closeTrade.tradeDate,
    totalBuyCount,
    totalSellCount,
    totalShares,
    totalBuyAmount: Math.round(totalBuyAmount * 100) / 100,
    totalSellAmount: Math.round(totalSellAmount * 100) / 100,
    totalDividendAmount: Math.round(totalDividendAmount * 100) / 100,
    totalFees: Math.round(totalFees * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    profitRatio: Math.round(profitRatio * 100) / 100,
  };
}

/**
 * 获取所有历史开仓记录
 * @returns 历史开仓记录数组，按清仓时间倒序排列
 */
export function getAllHistoricalTrades(): HistoricalTradeRecord[] {
  try {
    const cycles = identifyAllCycles();
    const records = cycles.map(calculateCycleStats);

    // 按清仓时间倒序排列（最近清仓的显示在最前面）
    records.sort((a, b) => b.closeTime.localeCompare(a.closeTime));

    return records;
  } catch (error) {
    log.error('获取历史开仓记录失败:', error);
    throw error;
  }
}

/**
 * 获取指定交易周期的交易明细
 * @param cycleId 周期 ID（格式：stockCode_cycleIndex）
 * @returns 交易明细数组，按交易时间正序排列
 */
export function getCycleDetails(cycleId: string): TradeDetail[] {
  try {
    // 解析 cycleId
    const lastUnderscoreIndex = cycleId.lastIndexOf('_');
    if (lastUnderscoreIndex === -1) {
      throw new Error('无效的周期 ID 格式');
    }

    const stockCode = cycleId.substring(0, lastUnderscoreIndex);
    const cycleIndex = parseInt(cycleId.substring(lastUnderscoreIndex + 1), 10);

    if (isNaN(cycleIndex)) {
      throw new Error('无效的交易周期索引');
    }

    // 获取该股票的所有交易记录
    const records = getTradeRecordsByStockCode(stockCode);
    if (records.length === 0) {
      return [];
    }

    // 识别该股票的所有交易周期
    const cycles = identifyStockCycles(stockCode, records);

    // 找到指定的周期
    const cycle = cycles.find(c => c.cycleIndex === cycleIndex);
    if (!cycle) {
      return [];
    }

    // 转换为交易明细
    const details: TradeDetail[] = cycle.trades.map(trade => {
      const amount = trade.tradePrice * trade.tradeCount;
      let fee = 0;
      if (trade.tradeType === 'BUY') {
        fee = calculateBuyFee(amount);
      } else if (trade.tradeType === 'SELL') {
        fee = calculateSellFee(Math.abs(amount));
      }

      return {
        tradeDate: trade.tradeDate,
        tradeType: trade.tradeType,
        tradePrice: trade.tradePrice,
        tradeCount: trade.tradeCount,
        holdingCount: trade.holdingCount,
        fee: Math.round(fee * 100) / 100,
      };
    });

    return details;
  } catch (error) {
    log.error('获取交易明细失败:', error);
    throw error;
  }
}
