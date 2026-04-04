import { BrowserWindow } from 'electron';
import log from 'electron-log';
import type { WatchlistStock } from '../database';
import { loadConfig, updateStockPrice } from '../database';
import { checkAlerts } from './alertService';

export interface PriceResult {
  stockCode: string;
  price: number;
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

function isWithinTradingHours(): boolean {
  const config = loadConfig();
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

function sendPriceUpdate(prices: PriceResult[]): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('prices:update', prices);
  }
}

function sendRefreshTimeUpdate(time: string): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('refresh:time-update', time);
  }
}

export async function fetchStockPrice(stockCode: string): Promise<PriceResult> {
  try {
    const config = loadConfig();
    if (!config.api?.url) {
      return { stockCode, price: 0, success: false, error: 'API URL not configured' };
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

    const text = await response.text();
    log.info(`API原始响应 [${stockCode}]: ${text}`);
    const price = parseStockPrice(text);

    if (price === null) {
      return { stockCode, price: 0, success: false, error: 'Failed to parse price' };
    }

    return { stockCode, price, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Failed to fetch price for ${stockCode}:`, errorMessage);
    return { stockCode, price: 0, success: false, error: errorMessage };
  }
}

function parseStockPrice(responseText: string): number | null {
  try {
    const match = responseText.match(/="([^"]+)"/);
    if (match && match[1]) {
      const parts = match[1].split(',');
      if (parts.length >= 3) {
        const priceStr = parts[3];
        return parseFloat(priceStr);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function refreshAllEnabledStocks(stocks: WatchlistStock[]): Promise<void> {
  const enabledStocks = stocks.filter(s => s.monitorEnabled);
  if (enabledStocks.length === 0) {
    log.debug('No enabled stocks to refresh');
    return;
  }

  log.info(`Refreshing prices for ${enabledStocks.length} stocks`);

  const now = new Date().toISOString();
  const results = await fetchStockPrices(enabledStocks.map(s => s.stockCode));

  for (const result of results) {
    const stock = enabledStocks.find(s => s.stockCode === result.stockCode);
    if (stock && result.success) {
      updateStockPrice(stock.stockCode, result.price);
      stock.currentPrice = result.price;
    }
  }

  sendPriceUpdate(results);

  lastRefreshTime = now;
  sendRefreshTimeUpdate(now);
  log.info(`Price refresh completed at ${now}`);
}

export async function fetchStockPrices(stockCodes: string[]): Promise<PriceResult[]> {
  if (stockCodes.length === 0) {
    return [];
  }

  const config = loadConfig();
  if (!config.api?.url) {
    return stockCodes.map(code => ({ stockCode: code, price: 0, success: false, error: 'API URL not configured' }));
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

    const text = await response.text();
    log.info(`API批量响应: ${text}`);

    return parseStockPricesResponse(text, stockCodes);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error(`Batch fetch error:`, errorMessage);
    return stockCodes.map(code => ({ stockCode: code, price: 0, success: false, error: errorMessage }));
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
      const stockCode = match[1].replace(/^(sh|sz|bj)/, '');
      const parts = match[2].split(',');
      const price = parts.length >= 4 ? parseFloat(parts[3]) : null;

      if (price !== null && !isNaN(price)) {
        results.push({ stockCode, price, success: true });
      } else {
        results.push({ stockCode, price: 0, success: false, error: 'Invalid price data' });
      }
    }
  }

  for (const code of stockCodes) {
    if (!results.some(r => r.stockCode === code)) {
      results.push({ stockCode: code, price: 0, success: false, error: 'Stock not found in response' });
    }
  }

  return results;
}

export function getLastRefreshTime(): string | null {
  return lastRefreshTime;
}

export async function manualRefresh(stocks: WatchlistStock[]): Promise<void> {
  await refreshAllEnabledStocks(stocks);
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
      if (!isWithinTradingHours()) {
        log.debug('Outside trading hours, skipping price fetch');
        return;
      }

      const stocks = getStocks();
      await refreshAllEnabledStocks(stocks);
      checkAlerts(stocks.filter(s => s.monitorEnabled && s.currentPrice !== null));
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
