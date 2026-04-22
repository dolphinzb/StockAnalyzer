import { BrowserWindow } from 'electron';
import log from 'electron-log';
import type { AppConfig, IndexData, IndexDirection } from '../../shared/types';
import type { WatchlistStock } from '../database';
import { loadConfig } from '../database';
import { checkAndTriggerAlert, type PriceUpdate } from './alertService';

// 指数代码常量（带前缀）
const INDEX_CODES = ['sh000001', 'sz399001'];
const INDEX_NAMES: Record<string, string> = {
  'sh000001': '上证指数',
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

function getStockCodeWithPrefix(stockCode: string): string {
  if (stockCode.startsWith('sh') || stockCode.startsWith('sz') || stockCode.startsWith('bj')) {
    return stockCode;
  }
  if (stockCode.startsWith('6') || stockCode.startsWith('5')) {
    return `sh${stockCode}`;
  }
  if (stockCode.startsWith('0') || stockCode.startsWith('1') || stockCode.startsWith('3')) {
    return `sz${stockCode}`;
  }
  if (stockCode.startsWith('8') || stockCode.startsWith('4')) {
    return `bj${stockCode}`;
  }
  return `sz${stockCode}`;
}

function isWithinTradingHours(config: AppConfig): boolean {
  const now = new Date();
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

export async function fetchStockPrice(stockCode: string): Promise<PriceResult> {
  try {
    const config = loadConfig();
    if (!config.api?.url) {
      return { stockCode, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: 'API URL not configured' };
    }

    const stockCodeWithPrefix = getStockCodeWithPrefix(stockCode);
    const url = `${config.api.url}${stockCodeWithPrefix}`;
    const response = await fetch(url, {
      headers: {
        Referer: 'http://finance.sina.com.cn',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(arrayBuffer);
    log.info(`API原始响应 [${stockCode}]: ${text}`);
    const stockData = parseStockData(text);

    if (stockData === null) {
      return { stockCode, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: 'Failed to parse price' };
    }

    return { stockCode, ...stockData, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to fetch price for ${stockCode}:`, errorMessage);
    return { stockCode, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: errorMessage };
  }
}

export interface StockInfo {
  stockCode: string;
  stockName: string;
  success: boolean;
  error?: string;
}

export async function fetchStockName(stockCode: string): Promise<StockInfo> {
  try {
    const config = loadConfig();
    if (!config.api?.url) {
      return { stockCode, stockName: '', success: false, error: 'API URL not configured' };
    }

    const stockCodeWithPrefix = getStockCodeWithPrefix(stockCode);
    const url = `${config.api.url}${stockCodeWithPrefix}`;
    const response = await fetch(url, {
      headers: {
        Referer: 'http://finance.sina.com.cn',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(arrayBuffer);
    log.info(`API原始响应 [${stockCode}]: ${text}`);
    const stockName = parseStockName(text, stockCode);

    if (!stockName) {
      return { stockCode, stockName: '', success: false, error: 'Failed to parse stock name' };
    }

    return { stockCode, stockName, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to fetch stock name for ${stockCode}:`, errorMessage);
    return { stockCode, stockName: '', success: false, error: errorMessage };
  }
}

function parseStockName(responseText: string, _stockCode: string): string | null {
  try {
    const match = responseText.match(/hq_str_\w+="([^"]+)"/);
    if (match && match[1]) {
      const parts = match[1].split(',');
      if (parts.length >= 1) {
        return parts[0];
      }
    }
    return null;
  } catch {
    return null;
  }
}

interface ParsedStockData {
  price: number;
  openPrice: number;
  prevClosePrice: number;
  highPrice: number;
  lowPrice: number;
}

function parseStockData(responseText: string): ParsedStockData | null {
  try {
    const match = responseText.match(/="([^"]+)"/);
    if (match && match[1]) {
      const parts = match[1].split(',');
      // 新浪API字段: 0=名称, 1=今开, 2=昨收, 3=当前价, 4=最高, 5=最低
      if (parts.length >= 6) {
        return {
          openPrice: parseFloat(parts[1]),
          prevClosePrice: parseFloat(parts[2]),
          price: parseFloat(parts[3]),
          highPrice: parseFloat(parts[4]),
          lowPrice: parseFloat(parts[5]),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseStockPrice(responseText: string): number | null {
  const data = parseStockData(responseText);
  return data ? data.price : null;
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
  log.info(`Price refresh completed at ${now}`);
}

export async function fetchStockPrices(stockCodes: string[], config: AppConfig): Promise<PriceResult[]> {
  if (stockCodes.length === 0) {
    return [];
  }

  if (!config.api?.url) {
    return stockCodes.map(code => ({ stockCode: code, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: 'API URL not configured' }));
  }

  const stockCodesWithPrefix = stockCodes.map(code => getStockCodeWithPrefix(code));
  const url = `${config.api.url}${stockCodesWithPrefix.join(',')}`;

  try {
    const response = await fetch(url, {
      headers: {
        Referer: 'http://finance.sina.com.cn',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(arrayBuffer);
    log.info(`API批量响应: ${text}`);

    return parseStockPricesResponse(text, stockCodes);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Batch fetch error:`, errorMessage);
    return stockCodes.map(code => ({ stockCode: code, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: errorMessage }));
  }
}

function parseStockPricesResponse(responseText: string, stockCodes: string[]): PriceResult[] {
  const results: PriceResult[] = [];
  const entries = responseText.split(';');

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/hq_str_(\w+)="([^"]+)"/);
    if (match && match[1] && match[2]) {
      // 保留完整代码（带前缀），避免 sh000001 和 sz000001 混淆
      const stockCode = match[1];
      const parts = match[2].split(',');
      // 新浪API字段: 0=名称, 1=今开, 2=昨收, 3=当前价, 4=最高, 5=最低
      const price = parts.length >= 4 ? parseFloat(parts[3]) : null;

      if (price !== null && !isNaN(price) && parts.length >= 6) {
        results.push({
          stockCode,
          price,
          openPrice: parseFloat(parts[1]),
          prevClosePrice: parseFloat(parts[2]),
          highPrice: parseFloat(parts[4]),
          lowPrice: parseFloat(parts[5]),
          success: true,
        });
      } else if (price !== null && !isNaN(price)) {
        results.push({ stockCode, price, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: true });
      } else {
        results.push({ stockCode, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: 'Invalid price data' });
      }
    }
  }

  // 匹配时直接使用传入的 stockCodes（已带前缀）
  for (const code of stockCodes) {
    if (!results.some(r => r.stockCode === code)) {
      results.push({ stockCode: code, price: 0, openPrice: 0, highPrice: 0, lowPrice: 0, prevClosePrice: 0, success: false, error: 'Stock not found in response' });
    }
  }

  return results;
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
