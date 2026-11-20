import { BrowserWindow } from 'electron';
import log from 'electron-log';
import type { AppConfig, IndexData, IndexDirection, QuoteSnapshot } from '../../shared/types';
import type { WatchlistStock } from '../database';
import { loadConfig } from '../database';
import { checkAndTriggerAlert, type PriceUpdate } from './alertService';
import { getProvider, QuoteProviderError } from './quoteProviders';
import type { QuoteProvider } from './quoteProviders';
import { toPrefixedCode } from './quoteProviders/code';

// 指数代码常量（带前缀）
const INDEX_CODES = ['sh000001', 'sh000688', 'sz399001'];
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

export interface StockInfo {
  stockCode: string;
  stockName: string;
  success: boolean;
  error?: string;
}

/** 按 provider 构造并执行一次请求，返回与 codes 等长的快照数组 */
async function requestSnapshots(provider: QuoteProvider, codes: string[]): Promise<QuoteSnapshot[]> {
  const request = provider.buildRequest(codes);
  const response = await fetch(request.url, { headers: request.headers });
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

export async function refreshAllEnabledStocks(stocks: WatchlistStock[], config: AppConfig): Promise<void> {
  const enabledStocks = stocks.filter(s => s.monitorEnabled);
  const now = new Date().toISOString();

  // 始终获取指数数据（无论是否有监控股票）
  const allCodes = [...enabledStocks.map(s => s.stockCode), ...INDEX_CODES];
  const results = await fetchStockPrices(allCodes, config);

  // 分离股票和指数结果（解析后代码保留前缀）
  const stockResults = results.filter(r => !INDEX_CODES.includes(r.stockCode));
  const indexResults = results.filter(r => INDEX_CODES.includes(r.stockCode));

  // log.info(`指数结果数量: ${indexResults.length}`);
  // log.info(`指数结果详情: ${JSON.stringify(indexResults)}`);

  // 检查股票价格告警
  for (const result of stockResults) {
    if (result.success) {
      // 去掉前缀后匹配数据库中的股票代码
      const codeWithoutPrefix = result.stockCode.replace(/^(sh|sz|bj)/, '');
      const stock = enabledStocks.find(s => s.stockCode === codeWithoutPrefix);
      if (stock) {
        checkAndTriggerAlert(stock, result.price);
      }
    }
  }

  // 发送股票价格更新（仅当有股票时）
  if (stockResults.length > 0) {
    const priceUpdates = stockResults
      .filter(r => r.success)
      .map(r => {
        const priceChange = r.prevClosePrice !== 0 ? r.price - r.prevClosePrice : 0;
        const priceChangePercent = r.prevClosePrice !== 0
          ? Math.round(((r.price - r.prevClosePrice) / r.prevClosePrice) * 10000) / 100
          : 0;
        return {
          // 去掉前缀，与数据库格式一致
          stockCode: r.stockCode.replace(/^(sh|sz|bj)/, ''),
          price: r.price,
          openPrice: r.openPrice,
          highPrice: r.highPrice,
          lowPrice: r.lowPrice,
          prevClosePrice: r.prevClosePrice,
          priceChange,
          priceChangePercent,
          timestamp: now,
        };
      });
    sendPriceUpdate(priceUpdates);
  }

  // 解析并发送指数数据更新
  const indexData = parseIndexData(indexResults, now);

  // log.info(`解析后的指数数据: ${JSON.stringify(indexData)}`);

  // 检查指数数据是否全部获取失败
  const allIndexFailed = indexResults.length > 0 && indexResults.every(r => !r.success);
  if (allIndexFailed) {
    // log.info('指数数据全部获取失败，发送错误状态');
    sendIndexUpdate([], 'error', '数据更新失败');
  } else {
    // log.info('指数数据获取成功，发送正常状态');
    sendIndexUpdate(indexData, 'normal');
  }

  lastRefreshTime = now;
  sendRefreshTimeUpdate(now);
  log.debug(`Price refresh completed at ${now}`);
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

export async function manualRefresh(stocks: WatchlistStock[]): Promise<void> {
  const config = loadConfig();
  await refreshAllEnabledStocks(stocks, config);
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
      await refreshAllEnabledStocks(stocks, currentConfig);
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
