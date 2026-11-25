/**
 * stock-sdk 适配层：把 SDK 收敛成行情库同步需要的最小接口
 *
 * 单独抽出的原因：
 * - 同步服务与单元测试只需要「日线 / 代码列表 / 交易日历 / 批量名称」四个能力
 * - SDK 层另设 3 req/s 作为第二道保护，服务层 1 秒滑动窗口仍是权威限制
 */

import { StockSDK } from 'stock-sdk';

/** 数据源返回的单根日线（已归一化） */
export interface MarketKlineItem {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  amount: number | null;
  amplitude: number | null;
  changePercent: number | null;
  change: number | null;
  turnoverRate: number | null;
}

/** 同步服务依赖的 SDK 能力 */
export interface MarketSdkLike {
  getHistoryKline(
    symbol: string,
    options: {
      period: 'daily';
      adjust: '' | 'qfq' | 'hfq';
      startDate?: string;
      endDate?: string;
    }
  ): Promise<MarketKlineItem[]>;
  getAShareCodeList(options?: { simple?: boolean }): Promise<string[]>;
  getTradingCalendar(): Promise<string[]>;
  getAllQuotesByCodes?(codes: string[]): Promise<Array<{ code: string; name: string }>>;
  search?(keyword: string): Promise<Array<{ code: string; name: string }>>;
}

/** SDK rateLimit 第二道保护的默认值（与 design D7 一致） */
export const SDK_RATE_LIMIT_RPS = 3;

/**
 * 创建真实 stock-sdk 客户端
 * @param requestsPerSecond SDK 内部限流（默认 3 req/s）
 */
export function createStockSdkMarketClient(requestsPerSecond = SDK_RATE_LIMIT_RPS): MarketSdkLike {
  const sdk = new StockSDK({
    rateLimit: { requestsPerSecond, maxBurst: requestsPerSecond },
  });

  return {
    async getHistoryKline(symbol, options) {
      const items = await sdk.getHistoryKline(symbol, {
        period: options.period,
        adjust: options.adjust,
        startDate: options.startDate,
        endDate: options.endDate,
      });
      return items.map(item => ({
        date: item.date,
        open: item.open,
        high: item.high,
        low: item.low,
        close: item.close,
        volume: item.volume,
        amount: item.amount,
        amplitude: item.amplitude,
        changePercent: item.changePercent,
        change: item.change,
        turnoverRate: item.turnoverRate,
      }));
    },
    async getAShareCodeList(options) {
      return sdk.getAShareCodeList(options ?? { simple: true });
    },
    async getTradingCalendar() {
      return sdk.getTradingCalendar();
    },
    async getAllQuotesByCodes(codes) {
      const quotes = await sdk.getAllQuotesByCodes(codes);
      return quotes.map(quote => ({ code: quote.code, name: quote.name }));
    },
    async search(keyword) {
      const results = await sdk.search(keyword);
      return results.map(result => ({ code: result.code, name: result.name }));
    },
  };
}
