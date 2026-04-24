import { contextBridge, ipcRenderer } from 'electron';
import type { CalculateOpenInput, CalculatePositionInput, ConfigAPI, GridAPI, IndexData, OpenResult, PositionResult, WindowAPI } from '../shared/types';

// LogAPI 本地定义
interface LogReadResult {
  content: string;
  error: string | null;
}

interface LogAPI {
  readLog(): Promise<LogReadResult>;
  getLogPath(): Promise<string>;
}

// 渲染进程本地类型（从 src/types 导入，但 preload 无法直接导入，需要重新定义）
interface PriceUpdate {
  stockCode: string;
  price: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClosePrice: number;
  priceChange: number;
  priceChangePercent: number;
  timestamp: string;
}

interface Alert {
  stockCode: string;
  stockName: string;
  alertType: 'BUY' | 'SELL';
  triggerPrice: number;
  threshold: number;
  timestamp: string;
}

interface WatchlistStock {
  id: number;
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
  monitorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddStockInput {
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
}

interface UpdateStockInput {
  buyThreshold?: number;
  sellThreshold?: number;
  monitorEnabled?: boolean;
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
}

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
  onIndexUpdate(callback: (data: { indices: IndexData[]; status: 'normal' | 'error'; errorMessage?: string | null; timestamp: string }) => void): () => void;
}

interface PositionAPI {
  getPositions(): Promise<any[]>;
  getTradeRecords(stockCode: string): Promise<any[]>;
  addTradeRecord(trade: AddTradeInput): Promise<any>;
  updateTradeRecord(trade: UpdateTradeInput): Promise<any>;
  deleteTradeRecord(id: number): Promise<boolean>;
  fetchPrices(stockCodes: string[]): Promise<{ stockCode: string; price: number; success: boolean; error?: string }[]>;
  getStockName(stockCode: string): Promise<{ stockCode: string; stockName: string; success: boolean; error?: string }>;
}

// 窗口控制 API
const windowAPI: WindowAPI = {
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
    const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
};

// 配置 API
const configAPI: ConfigAPI = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config) => ipcRenderer.invoke('config:set', config),
  onConfigLoaded: (callback: (config: import('../shared/types').AppConfig) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, config: import('../shared/types').AppConfig) => callback(config);
    ipcRenderer.on('config:loaded', handler);
    return () => ipcRenderer.removeListener('config:loaded', handler);
  },
};

// 自选股监控 API
const stockWatcherAPI: StockWatcherAPI = {
  getWatchlist: () => ipcRenderer.invoke('watchlist:get'),
  addStock: (input: AddStockInput) => ipcRenderer.invoke('watchlist:add', input),
  updateStock: (id: number, updates: UpdateStockInput) => ipcRenderer.invoke('watchlist:update', id, updates),
  deleteStock: (id: number) => ipcRenderer.invoke('watchlist:delete', id),
  refreshPrices: () => ipcRenderer.invoke('prices:refresh'),
  getLastRefreshTime: () => ipcRenderer.invoke('prices:last-time'),
  onPriceUpdate: (callback: (prices: PriceUpdate[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, prices: PriceUpdate[]) => callback(prices);
    ipcRenderer.on('prices:update', handler);
    return () => ipcRenderer.removeListener('prices:update', handler);
  },
  onAlert: (callback: (alert: Alert) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, alert: Alert) => callback(alert);
    ipcRenderer.on('alert:trigger', handler);
    return () => ipcRenderer.removeListener('alert:trigger', handler);
  },
  onRefreshTimeUpdate: (callback: (time: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, time: string) => callback(time);
    ipcRenderer.on('refresh:time', handler);
    return () => ipcRenderer.removeListener('refresh:time', handler);
  },
  onIndexUpdate: (callback: (data: { indices: IndexData[]; status: 'normal' | 'error'; errorMessage?: string | null; timestamp: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { indices: IndexData[]; status: 'normal' | 'error'; errorMessage?: string | null; timestamp: string }) => callback(data);
    ipcRenderer.on('index:update', handler);
    return () => ipcRenderer.removeListener('index:update', handler);
  },
};

// 持仓 API
const positionAPI: PositionAPI = {
  getPositions: () => ipcRenderer.invoke('position:get-list'),
  getTradeRecords: (stockCode: string) => ipcRenderer.invoke('position:get-records', stockCode),
  addTradeRecord: (trade: AddTradeInput) => ipcRenderer.invoke('position:add-record', trade),
  updateTradeRecord: (trade: UpdateTradeInput) => ipcRenderer.invoke('position:update-record', trade),
  deleteTradeRecord: (id: number) => ipcRenderer.invoke('position:delete-record', id),
  fetchPrices: (stockCodes: string[]) => ipcRenderer.invoke('position:fetch-prices', stockCodes),
  getStockName: (stockCode: string) => ipcRenderer.invoke('stock:get-name', stockCode),
};

// 网格交易 API
const gridAPI: GridAPI = {
  calculatePosition: (input: CalculatePositionInput): PositionResult => {
    const { totalAmount, currentPrice, currentHoldingCount, averageHoldingPrice } = input;
    const currentPositionAmount = currentHoldingCount * averageHoldingPrice;
    const targetPositionAmount = totalAmount / 3;
    const targetPosition = Math.floor(targetPositionAmount / currentPrice / 100) * 100;
    const adjustAmount = targetPosition - currentHoldingCount;
    const deviationPercent = currentHoldingCount > 0 ? Math.abs(adjustAmount) / currentHoldingCount * 100 : 0;
    return {
      currentPositionAmount,
      targetPosition,
      targetPositionAmount,
      adjustAmount,
      deviationPercent,
    };
  },
  calculateOpen: (input: CalculateOpenInput): OpenResult => {
    const { totalAmount, openPrice } = input;
    const openAmount = totalAmount * 0.5;
    const buyCount = Math.floor(openAmount / openPrice / 100) * 100;
    return {
      openAmount,
      buyCount,
    };
  },
};

// 历史交易记录相关类型
interface HistoricalTradeRecord {
  id: string;
  stockCode: string;
  stockName: string;
  openTime: string;
  closeTime: string;
  totalBuyCount: number;
  totalSellCount: number;
  totalShares: number;
  totalBuyAmount: number;
  totalSellAmount: number;
  totalFees: number;
  totalProfit: number;
  profitRatio: number;
  totalDividendAmount: number;
}

interface TradeDetail {
  tradeDate: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradePrice: number;
  tradeCount: number;
  fee: number;
}

interface HistoricalTradeAPI {
  getAll(): Promise<HistoricalTradeRecord[]>;
  getCycleDetails(cycleId: string): Promise<TradeDetail[]>;
}

// 日志 API
const logAPI: LogAPI = {
  readLog: () => ipcRenderer.invoke('log:read'),
  getLogPath: () => ipcRenderer.invoke('log:getPath'),
};

// 历史交易 API
const historicalTradeAPI: HistoricalTradeAPI = {
  getAll: () => ipcRenderer.invoke('historicalTrade:getAll'),
  getCycleDetails: (cycleId: string) => ipcRenderer.invoke('historicalTrade:getCycleDetails', cycleId),
};

// 暴露所有 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', windowAPI);
contextBridge.exposeInMainWorld('configAPI', configAPI);
contextBridge.exposeInMainWorld('stockWatcherAPI', stockWatcherAPI);
contextBridge.exposeInMainWorld('positionApi', positionAPI);
contextBridge.exposeInMainWorld('gridApi', gridAPI);
contextBridge.exposeInMainWorld('logApi', logAPI);
contextBridge.exposeInMainWorld('historicalTradeAPI', historicalTradeAPI);
