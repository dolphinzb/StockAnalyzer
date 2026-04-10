export interface WatchlistStock {
  id: number;
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
  monitorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddStockInput {
  stockCode: string;
  stockName: string;
  buyThreshold: number;
  sellThreshold: number;
}

export interface UpdateStockInput {
  buyThreshold?: number;
  sellThreshold?: number;
  monitorEnabled?: boolean;
}

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

export interface StockWatcherAPI {
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

declare global {
  interface Window {
    stockWatcherAPI: StockWatcherAPI;
    positionApi: PositionAPI;
    gridApi: GridAPI;
    logApi: LogAPI;
  }
}

export interface GridAPI {
  calculatePosition(input: CalculatePositionInput): PositionResult;
  calculateOpen(input: CalculateOpenInput): OpenResult;
}

export interface TradeRecord {
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

export interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;
  holdingPrice: number;
  lastTradeDate: string;
  currentPrice: number | null;
  profitAmount: number | null;
  profitRatio: number | null;
}

export interface AddTradeInput {
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}

export interface UpdateTradeInput {
  id: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}

export interface PositionAPI {
  getPositions(): Promise<Position[]>;
  getTradeRecords(stockCode: string): Promise<TradeRecord[]>;
  addTradeRecord(trade: AddTradeInput): Promise<TradeRecord>;
  updateTradeRecord(trade: UpdateTradeInput): Promise<TradeRecord>;
  deleteTradeRecord(id: number): Promise<boolean>;
  fetchPrices(stockCodes: string[]): Promise<{ stockCode: string; price: number; success: boolean; error?: string }[]>;
}

export interface CalculatePositionInput {
  totalAmount: number;
  currentPrice: number;
  currentHoldingCount: number;
  averageHoldingPrice: number;
}

export interface PositionResult {
  currentPositionAmount: number;
  targetPosition: number;
  targetPositionAmount: number;
  adjustAmount: number;
  deviationPercent: number;
}

export interface CalculateOpenInput {
  totalAmount: number;
  openPrice: number;
}

export interface OpenResult {
  openAmount: number;
  buyCount: number;
}

export interface LogReadResult {
  content: string;
  error: string | null;
}

export interface LogAPI {
  readLog(): Promise<LogReadResult>;
  getLogPath(): Promise<string>;
}
