import { BrowserWindow } from 'electron';
import log from 'electron-log';
import type { WatchlistStock } from '../database';

export interface Alert {
  stockCode: string;
  stockName: string;
  alertType: 'BUY' | 'SELL';
  triggerPrice: number;
  threshold: number;
  timestamp: string;
}

export interface PriceUpdate {
  stockCode: string;
  price: number;
  timestamp: string;
}

interface AlertDebounceEntry {
  type: 'BUY' | 'SELL';
  lastTime: number;
}

const alertDebounceMap = new Map<string, AlertDebounceEntry>();

const DEBOUNCE_MS = 5 * 60 * 1000;

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendAlertToRenderer(alert: Alert): void {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alert:trigger', alert);
    log.debug('Alert sent to renderer:', alert);
  }
}

function showSystemNotification(alert: Alert): void {
  const { Notification } = require('electron');
  if (Notification.isSupported()) {
    const title = alert.alertType === 'BUY' ? '买入告警' : '卖出告警';
    const body = `${alert.stockName} (${alert.stockCode})\n当前价格: ¥${alert.triggerPrice}\n阈值: ¥${alert.threshold}`;
    const notification = new Notification({
      title,
      body,
      silent: false,
    });
    notification.show();
    log.info('System notification shown:', title, alert.stockCode);
  }
}

export function checkAndTriggerAlert(stock: WatchlistStock, currentPrice: number): void {
  if (!stock.monitorEnabled) {
    return;
  }

  const alertType = currentPrice <= stock.buyThreshold
    ? 'BUY' as const
    : currentPrice >= stock.sellThreshold
      ? 'SELL' as const
      : null;

  if (!alertType) {
    return;
  }

  const debounceKey = `${stock.stockCode}_${alertType}`;
  const lastAlert = alertDebounceMap.get(debounceKey);
  const now = Date.now();

  if (lastAlert && (now - lastAlert.lastTime) < DEBOUNCE_MS) {
    log.debug(`Alert debounced for ${stock.stockCode} (${alertType})`);
    return;
  }

  const threshold = alertType === 'BUY' ? stock.buyThreshold : stock.sellThreshold;

  const alert: Alert = {
    stockCode: stock.stockCode,
    stockName: stock.stockName,
    alertType,
    triggerPrice: currentPrice,
    threshold,
    timestamp: new Date().toISOString(),
  };

  alertDebounceMap.set(debounceKey, { type: alertType, lastTime: now });
  sendAlertToRenderer(alert);
  showSystemNotification(alert);

  log.info(`Alert triggered: ${alertType} for ${stock.stockCode} at ${currentPrice}`);
}

export function clearAlertDebounce(): void {
  alertDebounceMap.clear();
  log.debug('Alert debounce map cleared');
}
