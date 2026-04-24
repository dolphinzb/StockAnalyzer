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
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClosePrice: number;
  priceChange: number;
  priceChangePercent: number;
  timestamp: string;
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

export interface LogReadResult {
  content: string;
  error: string | null;
}

// 从 shared 重新导出共享类型，供渲染进程使用
export type {
  CalculateOpenInput,
  CalculatePositionInput,
  GridAPI,
  HistoricalTradeAPI,
  HistoricalTradeRecord,
  IndexData,
  IndexDataState,
  IndexDirection,
  LogAPI,
  OpenResult,
  PositionAPI,
  PositionResult,
  StockWatcherAPI,
  TradeDetail
} from '../shared/types';

