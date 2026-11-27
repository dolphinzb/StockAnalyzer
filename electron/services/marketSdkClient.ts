/**
 * stock-sdk 适配层：把 SDK 收敛成行情库同步需要的最小接口
 *
 * 单独抽出的原因：
 * - 同步服务与单元测试只需要「日线 / 代码列表 / 交易日历 / 批量名称」四个能力
 * - SDK 层另设 3 req/s 作为第二道保护，服务层 1 秒滑动窗口仍是权威限制
 */

import { StockSDK } from 'stock-sdk';
import { createSohuKlineClient } from './sohuKlineClient';

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

/** SDK rateLimit 第二道保护（与服务层默认 RPS 对齐，避免成为瓶颈） */
export const SDK_RATE_LIMIT_RPS = 3;

/**
 * 给 SDK 异常补上调用上下文（代码、复权类型、日期区间等），原始异常保留在 cause 中
 */
function withSdkContext<T>(label: string, run: () => Promise<T>): Promise<T> {
  return run().catch(error => {
    const wrapped = new Error(`${label} 失败`) as Error & { cause?: unknown };
    wrapped.cause = error;
    throw wrapped;
  });
}

/**
 * 创建真实 stock-sdk 客户端
 * @param requestsPerSecond SDK 内部限流（默认 3 req/s，与服务层匀速限流一致）
 */
export function createStockSdkMarketClient(requestsPerSecond = SDK_RATE_LIMIT_RPS): MarketSdkLike {
  const sdk = new StockSDK({
    rateLimit: { requestsPerSecond, maxBurst: requestsPerSecond },
  });

  return {
    getHistoryKline(symbol, options) {
      const label = `stock-sdk getHistoryKline ${symbol} ${options.adjust || 'raw'} ${
        options.startDate ?? ''
      }~${options.endDate ?? ''}`;
      return withSdkContext(label, async () => {
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
      });
    },
    getAShareCodeList(options) {
      return withSdkContext('stock-sdk getAShareCodeList', () =>
        sdk.getAShareCodeList(options ?? { simple: true })
      );
    },
    getTradingCalendar() {
      return withSdkContext('stock-sdk getTradingCalendar', () => sdk.getTradingCalendar());
    },
    getAllQuotesByCodes(codes) {
      return withSdkContext(`stock-sdk getAllQuotesByCodes (${codes.length} 只)`, async () => {
        const quotes = await sdk.getAllQuotesByCodes(codes);
        return quotes.map(quote => ({ code: quote.code, name: quote.name }));
      });
    },
    search(keyword) {
      return withSdkContext(`stock-sdk search ${keyword}`, async () => {
        const results = await sdk.search(keyword);
        return results.map(result => ({ code: result.code, name: result.name }));
      });
    },
  };
}

export interface MarketSdkClientOptions {
  /** 元数据请求继续沿用 stock-sdk 的内部限流 */
  requestsPerSecond?: number;
  /** 注入 K 线实现；默认使用搜狐客户端 */
  klineClient?: Pick<MarketSdkLike, 'getHistoryKline'>;
}

/**
 * 创建行情库使用的混合客户端：
 * - K 线走搜狐适配器
 * - 证券池、交易日历、名称补全和搜索继续走 stock-sdk
 */
export function createMarketSdkClient(options: MarketSdkClientOptions = {}): MarketSdkLike {
  const metadataClient = createStockSdkMarketClient(options.requestsPerSecond ?? SDK_RATE_LIMIT_RPS);
  const klineClient = options.klineClient ?? createSohuKlineClient();

  return {
    getHistoryKline(symbol, itemOptions) {
      const label = `sohu getHistoryKline ${symbol} ${itemOptions.adjust || 'raw'} ${
        itemOptions.startDate ?? ''
      }~${itemOptions.endDate ?? ''}`;
      return withSdkContext(label, () => klineClient.getHistoryKline(symbol, itemOptions));
    },
    getAShareCodeList(options) {
      return metadataClient.getAShareCodeList(options);
    },
    getTradingCalendar() {
      return metadataClient.getTradingCalendar();
    },
    getAllQuotesByCodes(codes) {
      return metadataClient.getAllQuotesByCodes?.(codes) ?? Promise.resolve([]);
    },
    search(keyword) {
      return metadataClient.search?.(keyword) ?? Promise.resolve([]);
    },
  };
}
