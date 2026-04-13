import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig } from '../shared/types';

/**
 * 自选股实体类型
 */
interface WatchlistStock {
  id: number;
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
  monitorEnabled: boolean;
  currentPrice: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 添加股票输入类型
 */
interface AddStockInput {
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
}

/**
 * 更新股票输入类型
 */
interface UpdateStockInput {
  buyThreshold?: number;
  sellThreshold?: number;
  monitorEnabled?: boolean;
}

/**
 * 告警类型
 */
interface Alert {
  stockCode: string;
  stockName: string;
  alertType: 'BUY' | 'SELL';
  triggerPrice: number;
  threshold: number;
  timestamp: string;
}

/**
 * 价格更新类型
 */
interface PriceUpdate {
  stockCode: string;
  price: number;
  timestamp: string;
}

interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;
  holdingPrice: number;
}

interface TradeRecord {
  id: number;
  stockCode: string;
  stockName: string;
  tradeDate: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradePrice: number;
  tradeCount: number;
  holdingCount: number;
  holdingPrice: number;
}

interface AddTradeInput {
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}

interface UpdateTradeInput {
  id: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
  holdingCount: number;
  holdingPrice: number;
}

interface PositionAPI {
  getPositions(): Promise<Position[]>;
  getTradeRecords(stockCode: string): Promise<TradeRecord[]>;
  addTradeRecord(trade: AddTradeInput): Promise<TradeRecord>;
  updateTradeRecord(trade: UpdateTradeInput): Promise<TradeRecord>;
  deleteTradeRecord(id: number): Promise<boolean>;
  fetchPrices(stockCodes: string[]): Promise<{ stockCode: string; price: number; success: boolean; error?: string }[]>;
  getStockName(stockCode: string): Promise<{ stockCode: string; stockName: string; success: boolean; error?: string }>;
}

/**
 * 股票监控 API
 */
interface StockWatcherAPI {
  getWatchlist(): Promise<WatchlistStock[]>;
  addStock(stock: AddStockInput): Promise<WatchlistStock>;
  updateStock(id: number, updates: UpdateStockInput): Promise<WatchlistStock>;
  deleteStock(id: number): Promise<void>;
  refreshPrices(): Promise<void>;
  getLastRefreshTime(): Promise<string | null>;
  onPriceUpdate(callback: (prices: PriceUpdate[]) => void): () => void;
  onAlert(callback: (alert: Alert) => void): () => void;
  onRefreshTimeUpdate(callback: (time: string) => void): () => void;
}

const electronAPI = {
  platform: process.platform as 'windows' | 'mac' | 'linux',
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximized: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window:maximized', (_event, isMaximized) => {
      callback(isMaximized);
    });
  },
};

const configAPI = {
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  setConfig: (config: AppConfig): Promise<boolean> => ipcRenderer.invoke('config:set', config),
  onConfigLoaded: (callback: (config: AppConfig) => void) => {
    ipcRenderer.on('config:loaded', (_event, config) => {
      callback(config);
    });
  },
};

const stockWatcherAPI: StockWatcherAPI = {
  getWatchlist: (): Promise<WatchlistStock[]> => ipcRenderer.invoke('watchlist:get'),
  addStock: (stock: AddStockInput): Promise<WatchlistStock> => ipcRenderer.invoke('watchlist:add', stock),
  updateStock: (id: number, updates: UpdateStockInput): Promise<WatchlistStock> =>
    ipcRenderer.invoke('watchlist:update', id, updates),
  deleteStock: (id: number): Promise<void> => ipcRenderer.invoke('watchlist:delete', id),
  refreshPrices: (): Promise<void> => ipcRenderer.invoke('prices:refresh'),
  getLastRefreshTime: (): Promise<string | null> => ipcRenderer.invoke('prices:last-time'),
  onPriceUpdate: (callback: (prices: PriceUpdate[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, prices: PriceUpdate[]) => callback(prices);
    ipcRenderer.on('prices:update', handler);
    return () => ipcRenderer.removeListener('prices:update', handler);
  },
  onAlert: (callback: (alert: Alert) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, alert: Alert) => callback(alert);
    ipcRenderer.on('alert:trigger', handler);
    return () => ipcRenderer.removeListener('alert:trigger', handler);
  },
  onRefreshTimeUpdate: (callback: (time: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, time: string) => callback(time);
    ipcRenderer.on('refresh:time-update', handler);
    return () => ipcRenderer.removeListener('refresh:time-update', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('configAPI', configAPI);
contextBridge.exposeInMainWorld('stockWatcherAPI', stockWatcherAPI);

const positionAPI: PositionAPI = {
  getPositions: (): Promise<Position[]> => ipcRenderer.invoke('position:get-list'),
  getTradeRecords: (stockCode: string): Promise<TradeRecord[]> => ipcRenderer.invoke('position:get-records', stockCode),
  addTradeRecord: (trade: AddTradeInput): Promise<TradeRecord> => ipcRenderer.invoke('position:add-record', trade),
  updateTradeRecord: (trade: UpdateTradeInput): Promise<TradeRecord> => ipcRenderer.invoke('position:update-record', trade),
  deleteTradeRecord: (id: number): Promise<boolean> => ipcRenderer.invoke('position:delete-record', id),
  fetchPrices: (stockCodes: string[]): Promise<{ stockCode: string; price: number; success: boolean; error?: string }[]> => ipcRenderer.invoke('position:fetch-prices', stockCodes),
  getStockName: (stockCode: string): Promise<{ stockCode: string; stockName: string; success: boolean; error?: string }> => ipcRenderer.invoke('stock:get-name', stockCode),
};

contextBridge.exposeInMainWorld('positionApi', positionAPI);

interface CalculatePositionInput {
  totalAmount: number;
  currentPrice: number;
  currentHoldingCount: number;
  averageHoldingPrice: number;
}

interface PositionResult {
  currentPositionAmount: number;
  targetPosition: number;
  targetPositionAmount: number;
  adjustAmount: number;
  deviationPercent: number;
}

interface CalculateOpenInput {
  totalAmount: number;
  openPrice: number;
}

interface OpenResult {
  openAmount: number;
  buyCount: number;
}

const GRID_TARGET_RATIO = 0.5;
const MIN_TRADE_UNIT = 100;

function calculatePosition(input: CalculatePositionInput): PositionResult {
  const { totalAmount, currentPrice, currentHoldingCount, averageHoldingPrice } = input;

  const currentPositionAmount = currentHoldingCount * averageHoldingPrice;
  const targetPositionAmount = totalAmount * GRID_TARGET_RATIO;
  const targetPosition = Math.floor(targetPositionAmount / currentPrice / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;
  const adjustAmount = targetPosition - currentHoldingCount;
  const deviationPercent = targetPosition !== 0
    ? ((currentHoldingCount - targetPosition) / targetPosition) * 100
    : 0;

  return {
    currentPositionAmount,
    targetPosition,
    targetPositionAmount,
    adjustAmount,
    deviationPercent
  };
}

function calculateOpen(input: CalculateOpenInput): OpenResult {
  const { totalAmount, openPrice } = input;

  const openAmount = totalAmount * GRID_TARGET_RATIO;
  const buyCount = Math.floor(openAmount / openPrice / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;

  return {
    openAmount,
    buyCount
  };
}

const gridApi = {
  calculatePosition,
  calculateOpen
};

contextBridge.exposeInMainWorld('gridApi', gridApi);

interface LogReadResult {
  content: string;
  error: string | null;
}

interface LogAPI {
  readLog(): Promise<LogReadResult>;
  getLogPath(): Promise<string>;
}

const logApi: LogAPI = {
  readLog: (): Promise<LogReadResult> => ipcRenderer.invoke('log:read'),
  getLogPath: (): Promise<string> => ipcRenderer.invoke('log:getPath'),
};

contextBridge.exposeInMainWorld('logApi', logApi);
