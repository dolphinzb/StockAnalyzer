import log from 'electron-log';
import type { TradeRecord } from '../database';

export const TRADE_FEE_RATE = 0.0003;
export const MIN_FEE = 5;
export const HUATAI_OTHER_FEE_RATE = 0.00002;
export const SHENZHEN_STAMP_TAX_RATE = 0.001;
export const SHANGHAI_STAMP_TAX_RATE = 0.001;

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
    const tradeFee = Math.max(tradeCount * tradePrice * TRADE_FEE_RATE, MIN_FEE);
    const huaTaiFee = tradeCount * tradePrice * HUATAI_OTHER_FEE_RATE;

    let totalCost = tradeCount * tradePrice;
    if (exchange === 'SHANGHAI') {
      totalCost += tradeFee;
    } else if (exchange === 'SHENZHEN') {
      totalCost += tradeFee + huaTaiFee;
    }

    const newHoldingPrice = Math.round((totalCost * 1000) / tradeCount) / 1000;
    return {
      holdingCount: tradeCount,
      holdingPrice: newHoldingPrice,
    };
  }

  const exchange = getExchange(stockCode);
  const tradeFee = Math.max(tradeCount * tradePrice * TRADE_FEE_RATE, MIN_FEE);
  const huaTaiFee = tradeCount * tradePrice * HUATAI_OTHER_FEE_RATE;

  if (tradeType === 'BUY') {
    if (exchange === 'SHANGHAI') {
      const newHoldingPrice = Math.round(
        (preRecord.holdingCount * preRecord.holdingPrice +
          tradeCount * tradePrice +
          tradeFee) *
        1000 /
        (preRecord.holdingCount + tradeCount)
      ) / 1000;
      return {
        holdingCount: preRecord.holdingCount + tradeCount,
        holdingPrice: newHoldingPrice,
      };
    } else if (exchange === 'SHENZHEN') {
      const newHoldingPrice = Math.round(
        (preRecord.holdingCount * preRecord.holdingPrice +
          tradeCount * tradePrice +
          tradeFee +
          huaTaiFee) *
        1000 /
        (preRecord.holdingCount + tradeCount)
      ) / 1000;
      return {
        holdingCount: preRecord.holdingCount + tradeCount,
        holdingPrice: newHoldingPrice,
      };
    } else {
      log.warn(`北交所股票 ${stockCode} 暂不支持买入费用计算`);
      const newHoldingPrice = Math.round(
        (preRecord.holdingCount * preRecord.holdingPrice +
          tradeCount * tradePrice) *
        1000 /
        (preRecord.holdingCount + tradeCount)
      ) / 1000;
      return {
        holdingCount: preRecord.holdingCount + tradeCount,
        holdingPrice: newHoldingPrice,
      };
    }
  }

  if (tradeType === 'SELL') {
    let taxRate = 0;
    if (exchange === 'SHENZHEN') {
      taxRate = SHENZHEN_STAMP_TAX_RATE;
    } else if (exchange === 'SHANGHAI') {
      taxRate = SHANGHAI_STAMP_TAX_RATE;
    }
    const tax = -tradeCount * tradePrice * taxRate;

    if (exchange === 'SHANGHAI') {
      const newHoldingPrice = Math.round(
        (preRecord.holdingCount * preRecord.holdingPrice +
          tradeCount * tradePrice +
          tradeFee +
          tax +
          huaTaiFee) *
        1000 /
        (preRecord.holdingCount + tradeCount)
      ) / 1000;
      return {
        holdingCount: preRecord.holdingCount + tradeCount,
        holdingPrice: newHoldingPrice,
      };
    } else if (exchange === 'SHENZHEN') {
      const newHoldingPrice = Math.round(
        (preRecord.holdingCount * preRecord.holdingPrice +
          tradeCount * tradePrice +
          tradeFee +
          tax +
          huaTaiFee) *
        1000 /
        (preRecord.holdingCount + tradeCount)
      ) / 1000;
      return {
        holdingCount: preRecord.holdingCount + tradeCount,
        holdingPrice: newHoldingPrice,
      };
    } else {
      log.warn(`北交所股票 ${stockCode} 暂不支持卖出费用计算`);
      const newHoldingPrice = Math.round(
        (preRecord.holdingCount * preRecord.holdingPrice +
          tradeCount * tradePrice) *
        1000 /
        (preRecord.holdingCount + tradeCount)
      ) / 1000;
      return {
        holdingCount: preRecord.holdingCount + tradeCount,
        holdingPrice: newHoldingPrice,
      };
    }
  }

  return {
    holdingCount: preRecord.holdingCount,
    holdingPrice: preRecord.holdingPrice,
  };
}