import log from 'electron-log';
import type { TradeRecord } from '../database';

export const TRADE_FEE_RATE = 0.0003;
export const MIN_FEE = 5;
export const TRANSFER_FEE_RATE = 0.00001;  // 过户费率 0.001% (十万分之一)，沪深两市双向收取
export const SHENZHEN_STAMP_TAX_RATE = 0.0005;  // 印花税率 0.05% (万分之五)，仅卖出收取（2023年8月28日起实施）
export const SHANGHAI_STAMP_TAX_RATE = 0.0005;  // 印花税率 0.05% (万分之五)，仅卖出收取（2023年8月28日起实施）

export type Exchange = 'SHENZHEN' | 'SHANGHAI' | 'BEIJING';

export function getExchange(stockCode: string): Exchange {
  const code = stockCode.toLowerCase();
  if (code.startsWith('sh') || code.startsWith('6') || code.startsWith('5')) {
    return 'SHANGHAI';
  }
  if (code.startsWith('sz') || code.startsWith('0') || code.startsWith('1') || code.startsWith('3')) {
    return 'SHENZHEN';
  }
  if (code.startsWith('bj') || code.startsWith('8') || code.startsWith('4')) {
    return 'BEIJING';
  }
  return 'SHENZHEN';
}

export interface CalcResult {
  holdingCount: number;
  holdingPrice: number;
}

/**
 * FIFO买入批次
 * 用于股息税FIFO逐批计算
 */
export interface BuyBatch {
  /** 批次剩余股数 */
  remainingCount: number;
  /** 买入日期 (YYYY-MM-DD) */
  purchaseDate: string;
}

/**
 * 计算买入交易的资金流出金额（买入金额+手续费+过户费）
 * 复用现有手续费常量，与calcHoldingPrice中的手续费计算逻辑保持一致
 * @param tradePrice 交易单价
 * @param tradeCount 交易数量
 * @param stockCode 股票代码（用于判断交易所）
 * @returns 买入金额+手续费+过户费
 */
export function calcStockBuyAmount(tradePrice: number, tradeCount: number, stockCode: string): number {
  const absCount = Math.abs(tradeCount);
  const exchange = getExchange(stockCode);
  const tradeFee = Math.round(Math.max(absCount * tradePrice * TRADE_FEE_RATE, MIN_FEE) * 100) / 100;
  const transferFee = Math.round(absCount * tradePrice * TRANSFER_FEE_RATE * 100) / 100;  // 过户费：沪深两市都收取
  const tradeAmount = absCount * tradePrice;

  const totalFee = tradeFee + transferFee;
  return tradeAmount + totalFee;
}

/**
 * 计算卖出交易的资金流入金额（卖出金额-手续费-印花税-过户费）
 * 复用现有手续费常量，与calcHoldingPrice中的手续费计算逻辑保持一致
 * @param tradePrice 交易单价
 * @param tradeCount 交易数量
 * @param stockCode 股票代码（用于判断交易所）
 * @returns 卖出金额-手续费-印花税-过户费
 */
export function calcStockSellAmount(tradePrice: number, tradeCount: number, stockCode: string): number {
  const absCount = Math.abs(tradeCount);
  const exchange = getExchange(stockCode);
  const tradeFee = Math.round(Math.max(absCount * tradePrice * TRADE_FEE_RATE, MIN_FEE) * 100) / 100;
  const transferFee = Math.round(absCount * tradePrice * TRANSFER_FEE_RATE * 100) / 100;  // 过户费：沪深两市都收取
  const tradeAmount = absCount * tradePrice;
  const stampTax = Math.round(tradeAmount * (exchange === 'BEIJING' ? 0 : SHANGHAI_STAMP_TAX_RATE) * 100) / 100;

  const totalFee = tradeFee + stampTax + transferFee;
  return tradeAmount - totalFee;
}

/**
 * 计算指定日期的次日日期
 * 简单+1天，不考虑交易日历
 * @param dateStr 日期字符串 (YYYY-MM-DD)
 * @returns 次日日期字符串 (YYYY-MM-DD)
 */
export function getNextDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 计算两个日期之间的天数差
 * @param startDateStr 开始日期 (YYYY-MM-DD)
 * @param endDateStr 结束日期 (YYYY-MM-DD)
 * @returns 天数差（endDate - startDate）
 */
export function calcDaysBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * 根据持股天数判断股息红利税税率
 * 持股期限 ≤ 1个月：税率20%
 * 1个月 < 持股期限 ≤ 1年：税率10%
 * 持股期限 > 1年：税率0%（免税）
 * @param days 持股天数
 * @returns 税率（0~0.2）
 */
export function getDividendTaxRate(days: number): number {
  if (days <= 30) {
    return 0.20;
  } else if (days <= 365) {
    return 0.10;
  }
  return 0;
}

/**
 * 使用FIFO方法计算卖出时的股息税
 * 根据买入批次和持股天数，逐批计算应扣股息税
 * @param stockCode 股票代码
 * @param sellDate 卖出日期 (YYYY-MM-DD)
 * @param sellCount 卖出数量
 * @param allTrades 该股票的所有交易记录（按日期升序排列）
 * @returns 股息税金额（四舍五入到分）
 */
export function calcDividendTax(
  stockCode: string,
  sellDate: string,
  sellCount: number,
  allTrades: TradeRecord[]
): number {
  const absSellCount = Math.abs(sellCount);
  log.info(`[calcDividendTax] 开始计算: 股票=${stockCode}, 卖出日期=${sellDate}, 卖出数量=${absSellCount}`);
  
  // 构建FIFO买入批次列表：只取卖出日期之前的买入记录
  const batches: BuyBatch[] = [];
  for (const trade of allTrades) {
    // 只处理卖出日期之前的交易
    if (trade.tradeDate > sellDate) {
      continue;
    }
    if (trade.tradeType === 'BUY') {
      batches.push({
        remainingCount: Math.abs(trade.tradeCount),
        purchaseDate: trade.tradeDate,
      });
    } else if (trade.tradeType === 'SELL') {
      // 卖出时按FIFO消耗之前的买入批次
      let remaining = Math.abs(trade.tradeCount);
      for (const batch of batches) {
        if (remaining <= 0) break;
        if (batch.remainingCount > 0) {
          const consumed = Math.min(batch.remainingCount, remaining);
          batch.remainingCount -= consumed;
          remaining -= consumed;
        }
      }
    }
  }

  log.info(`[calcDividendTax] FIFO批次构建完成，剩余批次: ${batches.filter(b => b.remainingCount > 0).map(b => `${b.purchaseDate}(${b.remainingCount}股)`).join(', ')}`);

  // 按FIFO顺序消耗批次，计算卖出数量对应的股息税
  let remainingSell = absSellCount;
  let totalTax = 0;

  for (const batch of batches) {
    if (remainingSell <= 0) break;
    if (batch.remainingCount <= 0) continue;

    // 计算本批次被卖出的数量
    const soldFromBatch = Math.min(batch.remainingCount, remainingSell);
    // 计算持股天数
    const holdingDays = calcDaysBetween(batch.purchaseDate, sellDate);
    // 获取对应税率
    const taxRate = getDividendTaxRate(holdingDays);
    
    log.info(`[calcDividendTax] 处理批次: 买入日期=${batch.purchaseDate}, 卖出数量=${soldFromBatch}, 持股天数=${holdingDays}, 税率=${(taxRate * 100).toFixed(0)}%`);
    
    // 如果税率为0（持股超过1年免税），跳过
    if (taxRate === 0) {
      remainingSell -= soldFromBatch;
      continue;
    }
    
    // 查询该批次在持有期间的所有分红记录
    // 分红金额 = 每股股息(tradePrice) × 持股数量(soldFromBatch)
    let totalDividendAmount = 0;
    for (const trade of allTrades) {
      // 只统计买入日期之后、卖出日期之前（含）的分红记录
      if (trade.tradeDate > batch.purchaseDate && 
          trade.tradeDate <= sellDate && 
          trade.tradeType === 'DIVIDEND') {
        // 累加该批次的分红金额：每股股息 × 本批次卖出的股数
        const dividendForBatch = trade.tradePrice * soldFromBatch;
        totalDividendAmount += dividendForBatch;
        log.info(`[calcDividendTax] 找到分红记录: 日期=${trade.tradeDate}, 每股股息=${trade.tradePrice}, 本批次分红金额=${dividendForBatch.toFixed(2)}`);
      }
    }
    
    // 计算本批次的股息税：分红金额 × 税率
    const batchTax = totalDividendAmount * taxRate;
    totalTax += batchTax;
    log.info(`[calcDividendTax] 批次税额: 分红总额=${totalDividendAmount.toFixed(2)}, 税率=${(taxRate * 100).toFixed(0)}%, 税额=${batchTax.toFixed(2)}`);
    remainingSell -= soldFromBatch;
  }

  const finalTax = Math.round(totalTax * 100) / 100;
  log.info(`[calcDividendTax] 最终结果: 总税额=${totalTax.toFixed(2)}, 四舍五入后=${finalTax}`);
  
  // 四舍五入到分
  return finalTax;
}

export function calcHoldingPrice(
  preRecord: TradeRecord | null,
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND',
  tradePrice: number,
  tradeCount: number,
  stockCode: string
): CalcResult {
  if (tradeType === 'DIVIDEND') {
    if (preRecord) {
      return {
        holdingCount: preRecord.holdingCount,
        holdingPrice: Math.round((preRecord.holdingPrice - tradePrice) * 1000) / 1000,
      };
    }
    return { holdingCount: 0, holdingPrice: 0 };
  }

  if (!preRecord) {
    const exchange = getExchange(stockCode);
    const tradeFee = Math.round(Math.max(tradeCount * tradePrice * TRADE_FEE_RATE, MIN_FEE) * 100) / 100;
    const transferFee = Math.round(tradeCount * tradePrice * TRANSFER_FEE_RATE * 100) / 100;  // 过户费：沪深两市都收取

    const totalCost = tradeCount * tradePrice + tradeFee + transferFee;

    const newHoldingPrice = Math.round((totalCost * 1000) / tradeCount) / 1000;
    return {
      holdingCount: tradeCount,
      holdingPrice: newHoldingPrice,
    };
  }

  const exchange = getExchange(stockCode);
  const tradeFee = Math.round(Math.max(tradeCount * tradePrice * TRADE_FEE_RATE, MIN_FEE) * 100) / 100;
  const transferFee = Math.round(tradeCount * tradePrice * TRANSFER_FEE_RATE * 100) / 100;  // 过户费：沪深两市都收取

  if (tradeType === 'BUY') {
    // 买入：沪深两市都收取佣金和过户费
    const newHoldingPrice = Math.round(
      (preRecord.holdingCount * preRecord.holdingPrice +
        tradeCount * tradePrice +
        tradeFee +
        transferFee) *
      1000 /
      (preRecord.holdingCount + tradeCount)
    ) / 1000;
    return {
      holdingCount: preRecord.holdingCount + tradeCount,
      holdingPrice: newHoldingPrice,
    };
  }

  if (tradeType === 'SELL') {
    let taxRate = 0;
    if (exchange === 'SHENZHEN') {
      taxRate = SHENZHEN_STAMP_TAX_RATE;
    } else if (exchange === 'SHANGHAI') {
      taxRate = SHANGHAI_STAMP_TAX_RATE;
    }
    const tax = -Math.round(tradeCount * tradePrice * taxRate * 100) / 100;

    // 卖出：沪深两市都收取佣金、印花税和过户费
    const newHoldingPrice = Math.round(
      (preRecord.holdingCount * preRecord.holdingPrice +
        tradeCount * tradePrice +
        tradeFee +
        tax +
        transferFee) *
      1000 /
      (preRecord.holdingCount + tradeCount)
    ) / 1000;
    return {
      holdingCount: preRecord.holdingCount + tradeCount,
      holdingPrice: newHoldingPrice,
    };
  }

  return {
    holdingCount: preRecord.holdingCount,
    holdingPrice: preRecord.holdingPrice,
  };
}