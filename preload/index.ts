import { contextBridge, ipcRenderer } from 'electron';
import type { AddTradeResult, CalculateOpenInput, CalculatePositionInput, ConfigAPI, CreateStrategyInput, FundManagementAPI, GridAPI, GridStrategyAPI, IndexData, KlineAPI, KlineBatchDownloadInput, KlineBatchProgressPayload, KlineDownloadInput, KlinePeriod, OpenResult, PositionResult, TransferRecordInput, TransferRecordUpdate, UpdateStrategyInput, WindowAPI } from '../shared/types';

// LogAPI 本地定义
interface LogReadResult {
  content: string;
  error: string | null;
}

interface LogOpenDirectoryResult {
  success: boolean;
  error?: string;
}

interface LogAPI {
  readLog(date?: string): Promise<LogReadResult>;
  listLogDates(): Promise<string[]>;
  getLogPath(): Promise<string>;
  openLogDirectory(): Promise<LogOpenDirectoryResult>;
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
  sortOrder: number;
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
  reorderWatchlist(orderedIds: number[]): Promise<WatchlistStock[]>;
  refreshPrices(): Promise<void>;
  getLastRefreshTime(): Promise<string | null>;
  onPriceUpdate(callback: (prices: PriceUpdate[]) => void): () => void;
  onAlert(callback: (alert: Alert) => void): () => void;
  onRefreshTimeUpdate(callback: (time: string) => void): () => void;
  onIndexUpdate(callback: (data: { indices: IndexData[]; status: 'normal' | 'error'; errorMessage?: string | null; timestamp: string }) => void): () => void;
}

// 分页查询交易记录的返回结果
interface PaginatedTradeRecords {
  records: any[];
  total: number;
  hasMore: boolean;
}

interface PositionAPI {
  getPositions(): Promise<any[]>;
  getTradeRecords(stockCode: string, page?: number, pageSize?: number): Promise<PaginatedTradeRecords>;
  addTradeRecord(trade: AddTradeInput): Promise<AddTradeResult>;
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
  reorderWatchlist: (orderedIds: number[]) => ipcRenderer.invoke('watchlist:reorder', orderedIds),
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
  getTradeRecords: (stockCode: string, page?: number, pageSize?: number) => ipcRenderer.invoke('position:get-records', stockCode, page, pageSize),
  addTradeRecord: (trade: AddTradeInput) => ipcRenderer.invoke('position:add-record', trade),
  updateTradeRecord: (trade: UpdateTradeInput) => ipcRenderer.invoke('position:update-record', trade),
  deleteTradeRecord: (id: number) => ipcRenderer.invoke('position:delete-record', id),
  fetchPrices: (stockCodes: string[]) => ipcRenderer.invoke('position:fetch-prices', stockCodes),
  getStockName: (stockCode: string) => ipcRenderer.invoke('stock:get-name', stockCode),
};

// 网格交易 API
const gridAPI: GridAPI = {
  calculatePosition: (input: CalculatePositionInput): Promise<PositionResult> =>
    ipcRenderer.invoke('grid:calculatePosition', input),
  calculateOpen: (input: CalculateOpenInput): Promise<OpenResult> =>
    ipcRenderer.invoke('grid:calculateOpen', input),
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
  readLog: (date?: string) => ipcRenderer.invoke('log:read', date),
  listLogDates: () => ipcRenderer.invoke('log:list'),
  getLogPath: () => ipcRenderer.invoke('log:getPath'),
  openLogDirectory: () => ipcRenderer.invoke('log:open-directory'),
};

// 备份 API
interface BackupResult {
  success: boolean;
  error?: string | null;
}

interface BackupAPI {
  manualBackup(): Promise<BackupResult>;
}

const backupAPI: BackupAPI = {
  manualBackup: () => ipcRenderer.invoke('backup:manual'),
};

// 历史交易 API
const historicalTradeAPI: HistoricalTradeAPI = {
  getAll: () => ipcRenderer.invoke('historicalTrade:getAll'),
  getCycleDetails: (cycleId: string) => ipcRenderer.invoke('historicalTrade:getCycleDetails', cycleId),
};

// 网格策略 API
const gridStrategyAPI: GridStrategyAPI = {
  getAllStrategies: () => ipcRenderer.invoke('grid-strategy:get-all'),
  getPresetStrategies: () => ipcRenderer.invoke('grid-strategy:get-presets'),
  createStrategy: (input: CreateStrategyInput) => ipcRenderer.invoke('grid-strategy:create', input),
  updateStrategy: (input: UpdateStrategyInput) => ipcRenderer.invoke('grid-strategy:update', input),
  deleteStrategy: (id: number) => ipcRenderer.invoke('grid-strategy:delete', id),
  previewStrategy: (strategy: CreateStrategyInput) => ipcRenderer.invoke('grid-strategy:preview', strategy),
  applyStrategyToStock: (strategyId: number, stockCode: string) => ipcRenderer.invoke('grid-strategy:apply', strategyId, stockCode),
  getStockStrategy: (stockCode: string) => ipcRenderer.invoke('grid-strategy:get-stock-strategy', stockCode),
  deactivateStockStrategy: (stockCode: string) => ipcRenderer.invoke('grid-strategy:deactivate', stockCode),
  isStrategyInUse: (strategyId: number) => ipcRenderer.invoke('grid-strategy:check-usage', strategyId),
  getStrategyUsageInfo: (strategyId: number) => ipcRenderer.invoke('grid-strategy:get-usage-info', strategyId),
};

// 资金管理 API
const fundManagementAPI: FundManagementAPI = {
  getTransferRecords: (limit: number, offset: number, types?: string[]) =>
    ipcRenderer.invoke('get-transfer-records', limit, offset, types),
  addTransferRecord: (record: TransferRecordInput) =>
    ipcRenderer.invoke('add-transfer-record', record),
  updateTransferRecord: (id: number, data: TransferRecordUpdate) =>
    ipcRenderer.invoke('update-transfer-record', id, data),
  deleteTransferRecord: (id: number) =>
    ipcRenderer.invoke('delete-transfer-record', id),
  getProfitStatistics: (startDate: string, endDate: string) =>
    ipcRenderer.invoke('get-profit-statistics', startDate, endDate),
  getHoldingsMarketValue: (date: string) =>
    ipcRenderer.invoke('get-holdings-market-value', date),
  getTradeStatsInRange: (startDate: string, endDate: string) =>
    ipcRenderer.invoke('get-trade-stats-in-range', startDate, endDate),
  getAccountBalance: () =>
    ipcRenderer.invoke('get-account-balance'),
  getOpeningBalance: (date: string) =>
    ipcRenderer.invoke('get-opening-balance', date),
  getAnnualProfitData: () =>
    ipcRenderer.invoke('get-annual-profit-data'),
  getMonthlyProfitData: () =>
    ipcRenderer.invoke('get-monthly-profit-data'),
  getFundOverview: () =>
    ipcRenderer.invoke('fund:getFundOverview'),
  getMonthlyFundData: () =>
    ipcRenderer.invoke('fund:getMonthlyFundData'),
};

// K线数据 API
const klineAPI: KlineAPI = {
  downloadKline: (input: KlineDownloadInput) =>
    ipcRenderer.invoke('kline:download', input),
  getKlineData: (stockCode: string, period: KlinePeriod, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('kline:get-data', stockCode, period, startDate, endDate),
  getChartData: (stockCode: string, adjustType: '' | 'qfq', period: KlinePeriod) =>
    ipcRenderer.invoke('kline:get-chart-data', stockCode, adjustType, period),
  getTradeRecords: (stockCode: string) =>
    ipcRenderer.invoke('kline:get-trade-records', stockCode),
  onKlineUpdated: (callback: (payload: { stockCode: string; adjustTypes: ('' | 'qfq')[]; periods: KlinePeriod[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { stockCode: string; adjustTypes: ('' | 'qfq')[]; periods: KlinePeriod[] }) => callback(payload);
    ipcRenderer.on('kline:updated', handler);
    return () => ipcRenderer.removeListener('kline:updated', handler);
  },
  downloadKlineBatch: (input: KlineBatchDownloadInput) =>
    ipcRenderer.invoke('kline:download-batch', input),
  onBatchDownloadProgress: (callback: (payload: KlineBatchProgressPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: KlineBatchProgressPayload) => callback(payload);
    ipcRenderer.on('kline:batch-progress', handler);
    return () => ipcRenderer.removeListener('kline:batch-progress', handler);
  },
};

// 暴露所有 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', windowAPI);
contextBridge.exposeInMainWorld('configAPI', configAPI);
contextBridge.exposeInMainWorld('stockWatcherAPI', stockWatcherAPI);
contextBridge.exposeInMainWorld('positionApi', positionAPI);
contextBridge.exposeInMainWorld('gridAPI', gridAPI);
contextBridge.exposeInMainWorld('logApi', logAPI);
contextBridge.exposeInMainWorld('backupApi', backupAPI);
contextBridge.exposeInMainWorld('historicalTradeAPI', historicalTradeAPI);
contextBridge.exposeInMainWorld('gridStrategyAPI', gridStrategyAPI);
contextBridge.exposeInMainWorld('fundManagementAPI', fundManagementAPI);
contextBridge.exposeInMainWorld('klineAPI', klineAPI);
