import { BrowserWindow } from 'electron';
import log from 'electron-log';
import type { AppConfig, IndexData, IndexDirection, QuoteSnapshot } from '../../shared/types';
import type { KlineFallbackQuote, WatchlistStock } from '../database';
import { getLatestKlineQuotes, loadConfig } from '../database';
import { checkAndTriggerAlert, type PriceUpdate } from './alertService';
import { getLastTradingDay } from './klineDownloadService';
import { getProvider, QuoteProviderError } from './quoteProviders';
import type { QuoteProvider } from './quoteProviders';
import { toPrefixedCode } from './quoteProviders/code';

// 指数代码常量（带前缀）
const INDEX_CODES = ['sh000001', 'sh000688', 'sz399001'];
const QUOTE_TIMEOUT_MS = 5000;
const INDEX_NAMES: Record<string, string> = {
  'sh000001': '上证指数',
  'sh000688': '科创50',
  'sz399001': '深成指数',
};

// 上次成功获取的指数数据（用于错误时显示）
let lastSuccessfulIndexData: IndexData[] = [];

export interface PriceResult {
  stockCode: string;
  price: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClosePrice: number;
  success: boolean;
  error?: string;
}

/** 取昨日作为基准，得到交易日历口径的前一交易日（YYYY-MM-DD） */
export async function getPreviousTradingDay(baseDate: Date = new Date()): Promise<string> {
  const yesterday = new Date(baseDate);
  yesterday.setDate(yesterday.getDate() - 1);
  const ymd = await getLastTradingDay(yesterday);
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function stripCodePrefix(code: string): string {
  return code.replace(/^(sh|sz|bj)/, '');
}

/**
 * 逐只合并实时行情与日 K 回退，只产出有有效现价的项。
 * 实时成功且现价 > 0 时用实时值；否则用满足新鲜度条件的该股最新日 K 补齐整行。
 */
export function mergeQuoteUpdates(
  stockResults: PriceResult[],
  stocks: WatchlistStock[],
  fallbackQuotes: Map<string, KlineFallbackQuote>,
  previousTradingDay: string,
  timestamp: string
): PriceUpdate[] {
  const updates: PriceUpdate[] = [];
  const stockByCode = new Map(stocks.map(stock => [stock.stockCode, stock]));

  for (const result of stockResults) {
    const stockCode = stripCodePrefix(result.stockCode);
    if (!stockByCode.has(stockCode)) continue;

    if (result.success && result.price > 0) {
      const priceChange = result.prevClosePrice !== 0 ? result.price - result.prevClosePrice : 0;
      const priceChangePercent = result.prevClosePrice !== 0
        ? Math.round(((result.price - result.prevClosePrice) / result.prevClosePrice) * 10000) / 100
        : 0;
      updates.push({
        stockCode,
        price: result.price,
        openPrice: result.openPrice,
        highPrice: result.highPrice,
        lowPrice: result.lowPrice,
        prevClosePrice: result.prevClosePrice,
        priceChange,
        priceChangePercent,
        timestamp,
      });
      continue;
    }

    const kline = fallbackQuotes.get(stockCode);
    if (!kline || !previousTradingDay || kline.tradeDate < previousTradingDay) continue;
    const close = kline.close;
    if (close === null || close <= 0) continue;

    updates.push({
      stockCode,
      price: close,
      openPrice: kline.open,
      highPrice: kline.high,
      lowPrice: kline.low,
      prevClosePrice: kline.changeAmount === null ? null : close - kline.changeAmount,
      priceChange: kline.changeAmount,
      priceChangePercent: kline.changePercent,
      timestamp,
    });
  }

  return updates;
}

let lastRefreshTime: string | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;



function isWithinTradingHours(config: AppConfig): boolean {
  const now = new Date();
  
  // 检查是否为工作日 (0=周日, 1-5=周一至周五, 6=周六)
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    log.debug(`Today is weekend (day ${dayOfWeek}), skipping price fetch`);
    return false;
  }
  
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const morningStart = config.trading?.morningStart ?? '09:30';
  const morningEnd = config.trading?.morningEnd ?? '11:30';
  const afternoonStart = config.trading?.afternoonStart ?? '13:00';
  const afternoonEnd = config.trading?.afternoonEnd ?? '15:00';

  const isInMorning = currentTime >= morningStart && currentTime <= morningEnd;
  const isInAfternoon = currentTime >= afternoonStart && currentTime <= afternoonEnd;
  const isInTradingHours = isInMorning || isInAfternoon;

  log.debug(`Current time: ${currentTime}, Morning: ${morningStart}-${morningEnd}, Afternoon: ${afternoonStart}-${afternoonEnd}, In trading hours: ${isInTradingHours}`);
  return isInTradingHours;
}

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendPriceUpdate(prices: PriceUpdate[]): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('prices:update', prices);
  }
}

function sendRefreshTimeUpdate(time: string): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('refresh:time', time);
  }
}

/** 合并后的结果统一进入告警与下发链路；空结果不推送，保留界面已有价格 */
export function publishQuoteUpdates(stocks: WatchlistStock[], updates: PriceUpdate[]): void {
  if (updates.length === 0) return;

  const stockByCode = new Map(stocks.map(stock => [stock.stockCode, stock]));
  for (const update of updates) {
    const stock = stockByCode.get(update.stockCode);
    if (stock) {
      checkAndTriggerAlert(stock, update.price);
    }
  }
  sendPriceUpdate(updates);
}

export interface StockInfo {
  stockCode: string;
  stockName: string;
  success: boolean;
  error?: string;
}

/** 按 provider 构造并执行一次请求，返回与 codes 等长的快照数组 */
async function requestSnapshots(provider: QuoteProvider, codes: string[]): Promise<QuoteSnapshot[]> {
  const request = provider.buildRequest(codes);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUOTE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(request.url, { headers: request.headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new QuoteProviderError(provider.id, `HTTP ${response.status}`);
  }
  return provider.parse(provider.decode(await response.arrayBuffer()), codes);
}

/**
 * 按代码查询证券名称（录入自选股/交易记录时自动带名）。
 * 与批量行情共用同一 provider 适配器，切换数据源后依然可用。
 */
export async function fetchStockName(stockCode: string): Promise<StockInfo> {
  const provider = getProvider(loadConfig().api?.provider ?? 'sina');
  const codeWithPrefix = toPrefixedCode(stockCode);

  try {
    const snapshot = (await requestSnapshots(provider, [codeWithPrefix]))[0];
    // 只以名称是否存在判定：停牌标的现价可能无效，但名称仍可用（如东财 f2=0、f14 有值）
    if (!snapshot || !snapshot.name) {
      return { stockCode, stockName: '', success: false, error: snapshot?.error ?? '未获取到证券名称' };
    }
    return { stockCode, stockName: snapshot.name, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to fetch stock name for ${stockCode}:`, errorMessage);
    return { stockCode, stockName: '', success: false, error: errorMessage };
  }
}

export async function refreshWatchlistQuotes(stocks: WatchlistStock[], config: AppConfig): Promise<PriceUpdate[]> {
  const now = new Date().toISOString();

  // 取价范围为全部自选股 + 三项指数；monitor_enabled 只影响告警，不裁剪取价
  const allCodes = [...stocks.map(s => s.stockCode), ...INDEX_CODES];
  const results = await fetchStockPrices(allCodes, config);

  // 分离股票和指数结果（解析后代码保留前缀）
  const stockResults = results.filter(r => !INDEX_CODES.includes(r.stockCode));
  const indexResults = results.filter(r => INDEX_CODES.includes(r.stockCode));

  const fallbackQuotes = stocks.length > 0
    ? getLatestKlineQuotes(stocks.map(s => s.stockCode))
    : new Map();
  const needsFallback = stockResults.some(r => !r.success || r.price <= 0);
  const previousTradingDay = needsFallback ? await getPreviousTradingDay() : '';

  const priceUpdates = mergeQuoteUpdates(stockResults, stocks, fallbackQuotes, previousTradingDay, now);

  // 回退价与实时价走同一份合并结果进入告警与下发（未监控股由 checkAndTriggerAlert 内部拦截）
  publishQuoteUpdates(stocks, priceUpdates);

  // 解析并发送指数数据更新
  const indexData = parseIndexData(indexResults, now);

  // 检查指数数据是否全部获取失败
  const allIndexFailed = indexResults.length > 0 && indexResults.every(r => !r.success);
  if (allIndexFailed) {
    sendIndexUpdate([], 'error', '数据更新失败');
  } else {
    sendIndexUpdate(indexData, 'normal');
  }

  lastRefreshTime = now;
  sendRefreshTimeUpdate(now);
  log.debug(`Price refresh completed at ${now}`);
  return priceUpdates;
}

export async function fetchStockPrices(stockCodes: string[], config: AppConfig): Promise<PriceResult[]> {
  if (stockCodes.length === 0) {
    return [];
  }

  const codesWithPrefix = stockCodes.map(code => toPrefixedCode(code));
  const provider = getProvider(config.api?.provider ?? 'sina');

  try {
    const snapshots = await requestSnapshots(provider, codesWithPrefix);
    const snapshotByCode = new Map(snapshots.map(snapshot => [snapshot.code, snapshot]));

    return codesWithPrefix.map((code) => {
      const snapshot = snapshotByCode.get(code);
      if (!snapshot || !snapshot.success) {
        return {
          stockCode: code,
          price: 0,
          openPrice: 0,
          highPrice: 0,
          lowPrice: 0,
          prevClosePrice: 0,
          success: false,
          error: snapshot?.error ?? '数据源未返回该代码',
        };
      }
      return {
        stockCode: code,
        price: snapshot.price,
        openPrice: snapshot.openPrice,
        highPrice: snapshot.highPrice,
        lowPrice: snapshot.lowPrice,
        prevClosePrice: snapshot.prevClosePrice,
        success: true,
      };
    });
  } catch (error) {
    // 失败不降级：本轮全部标记失败并记录日志，不切换到其他数据源重试
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`[${provider.id}] 批量行情获取失败:`, errorMessage);
    return codesWithPrefix.map(code => ({
      stockCode: code,
      price: 0,
      openPrice: 0,
      highPrice: 0,
      lowPrice: 0,
      prevClosePrice: 0,
      success: false,
      error: errorMessage,
    }));
  }
}

/**
 * 解析指数数据
 * @param indexResults 指数价格结果数组
 * @param timestamp ISO格式时间戳
 * @returns 解析后的指数数据数组
 */
function parseIndexData(indexResults: PriceResult[], timestamp: string): IndexData[] {
  const indexData: IndexData[] = [];

  for (const result of indexResults) {
    // 解析结果已保留前缀
    const indexCode = result.stockCode;
    const indexName = INDEX_NAMES[indexCode] || '未知指数';

    if (!result.success || result.price <= 0) {
      // 获取失败时返回空，使用上次成功数据
      continue;
    }

    const currentPrice = result.price;
    const prevClosePrice = result.prevClosePrice;
    const change = prevClosePrice !== 0 ? currentPrice - prevClosePrice : 0;
    const changePercent = prevClosePrice !== 0
      ? Math.round((change / prevClosePrice) * 10000) / 100
      : 0;

    // 判断涨跌方向
    let direction: IndexDirection;
    if (changePercent > 0) {
      direction = 'up';
    } else if (changePercent < 0) {
      direction = 'down';
    } else {
      direction = 'flat';
    }

    indexData.push({
      code: indexCode,
      name: indexName,
      price: currentPrice,
      change,
      changePercent,
      direction,
      lastUpdate: timestamp,
    });
  }

  // 如果成功获取到数据，更新缓存
  if (indexData.length > 0) {
    lastSuccessfulIndexData = indexData;
  }

  return indexData;
}

/**
 * 通过IPC发送指数数据更新到渲染进程
 * @param indices 指数数据数组
 * @param status 数据状态
 * @param errorMessage 错误信息（可选）
 */
function sendIndexUpdate(indices: IndexData[], status: 'normal' | 'error', errorMessage?: string): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 如果获取失败，发送上次成功的数据
    const dataToSend = indices.length > 0 ? indices : lastSuccessfulIndexData;
    mainWindow.webContents.send('index:update', {
      indices: dataToSend,
      status,
      errorMessage,
      timestamp: new Date().toISOString(),
    });
  }
}

export function getLastRefreshTime(): string | null {
  return lastRefreshTime;
}

export async function manualRefresh(stocks: WatchlistStock[]): Promise<PriceUpdate[]> {
  const config = loadConfig();
  return refreshWatchlistQuotes(stocks, config);
}

export function startScheduler(getStocks: () => WatchlistStock[]): void {
  if (schedulerInterval) {
    log.warn('Scheduler already running');
    return;
  }

  const config = loadConfig();
  const intervalSeconds = (config.polling?.interval ?? 1) * 60;
  const intervalMs = intervalSeconds * 1000;

  log.info(`Starting scheduler with interval: ${intervalSeconds}s (${config.polling?.interval} minutes)`);

  schedulerInterval = setInterval(async () => {
    try {
      const currentConfig = loadConfig();
      if (!isWithinTradingHours(currentConfig)) {
        log.debug('Outside trading hours, skipping price fetch');
        return;
      }

      const stocks = getStocks();
      await refreshWatchlistQuotes(stocks, currentConfig);
    } catch (error) {
      log.error('Scheduler error:', error);
    }
  }, intervalMs);
}

export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log.info('Scheduler stopped');
  }
}

export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}
