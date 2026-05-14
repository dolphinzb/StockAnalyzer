/**
 * 窗口 API 类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface WindowAPI {
  platform: 'windows' | 'mac' | 'linux';
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximized: (callback: (isMaximized: boolean) => void) => void;
}

/**
 * 交易时间段配置
 */
export interface TradingConfig {
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
}

/**
 * 轮询配置
 */
export interface PollingConfig {
  interval: number;
}

/**
 * API配置
 */
export interface ApiConfig {
  provider: 'sina' | 'eastmoney' | 'tencent';
  url: string;
}

/**
 * 应用配置
 */
export interface AppConfig {
  trading: TradingConfig;
  polling: PollingConfig;
  api: ApiConfig;
}

/**
 * 配置API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface ConfigAPI {
  getConfig: () => Promise<AppConfig>;
  setConfig: (config: AppConfig) => Promise<boolean>;
  onConfigLoaded: (callback: (config: AppConfig) => void) => void;
}

/**
 * API Provider 选项
 */
export interface ApiProviderOption {
  value: string;
  label: string;
  defaultUrl: string;
}

/**
 * API Provider 常量
 */
export const API_PROVIDERS: ApiProviderOption[] = [
  { value: 'sina', label: '新浪财经API', defaultUrl: 'https://hq.sinajs.cn/list=' },
  { value: 'eastmoney', label: '东方财富API', defaultUrl: 'https://push2.eastmoney.com/api/qt/stock/get' },
  { value: 'tencent', label: '腾讯API', defaultUrl: 'https://web.sqt.gtimg.cn/q=' },
];

/**
 * Electron 版本信息
 */
export interface ElectronVersions {
  node: string;
  chrome: string;
  electron: string;
}

/**
 * 平台类型
 */
export type Platform = 'windows' | 'mac' | 'linux';

/**
 * IPC 通道名称
 */
export const IPC_CHANNELS = {
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_MAXIMIZED: 'window:maximized',
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_LOADED: 'config:loaded',
  INDEX_UPDATE: 'index:update',
} as const;

/**
 * 指数涨跌方向
 */
export type IndexDirection = 'up' | 'down' | 'flat';

/**
 * 指数数据
 */
export interface IndexData {
  /** 指数代码 (sh000001/sz399001) */
  code: string;
  /** 指数名称 (上证指数/深成指数) */
  name: string;
  /** 当前指数值 */
  price: number;
  /** 涨跌值 (可正可负) */
  change: number;
  /** 涨跌幅百分比 (如 1.25 表示 +1.25%) */
  changePercent: number;
  /** 涨跌方向 */
  direction: IndexDirection;
  /** ISO 格式最后更新时间 */
  lastUpdate: string;
}

/**
 * 指数数据状态
 */
export interface IndexDataState {
  /** 指数数组 */
  indices: IndexData[];
  /** 数据状态 */
  status: 'normal' | 'error';
  /** 错误信息 */
  errorMessage: string | null;
  /** 是否正在加载 */
  isLoading: boolean;
}

/**
 * 持仓调整计算输入参数
 */
export interface CalculatePositionInput {
  /** 总资金金额 */
  totalAmount: number;
  /** 当前股价 */
  currentPrice: number;
  /** 当前持仓数量（股） */
  currentHoldingCount: number;
  /** 持仓均价 */
  averageHoldingPrice: number;
}

/**
 * 持仓调整计算结果
 */
export interface PositionResult {
  /** 当前持仓成本金额 */
  currentPositionAmount: number;
  /** 目标持仓数量（股，向下取整到100的整数倍） */
  targetPosition: number;
  /** 目标持仓金额 */
  targetPositionAmount: number;
  /** 调整数量（正数为买入，负数为卖出） */
  adjustAmount: number;
  /** 偏差百分比 */
  deviationPercent: number;
}

/**
 * 开仓计算输入参数
 */
export interface CalculateOpenInput {
  /** 总资金金额 */
  totalAmount: number;
  /** 开仓股价 */
  openPrice: number;
}

/**
 * 开仓计算结果
 */
export interface OpenResult {
  /** 开仓金额（总资金的50%） */
  openAmount: number;
  /** 建议买入数量（股，向下取整到100的整数倍） */
  buyCount: number;
}

/**
 * 网格交易API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface GridAPI {
  calculatePosition(input: CalculatePositionInput): Promise<PositionResult>;
  calculateOpen(input: CalculateOpenInput): Promise<OpenResult>;
}

/**
 * 交易明细
 * 用于前端展示的交易明细数据
 */
export interface TradeDetail {
  /** 交易日期 */
  tradeDate: string;
  /** 交易类型 */
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  /** 交易价格 */
  tradePrice: number;
  /** 交易数量 */
  tradeCount: number;
  /** 持仓数量 */
  holdingCount: number;
  /** 单笔手续费 */
  fee: number;
}

/**
 * 历史开仓记录
 * 代表一只股票从开仓到清仓的完整交易周期
 */
export interface HistoricalTradeRecord {
  /** 唯一标识符（格式：stockCode_cycleIndex） */
  id: string;
  /** 股票代码 */
  stockCode: string;
  /** 股票名称 */
  stockName: string;
  /** 开仓时间（YYYY-MM-DD） */
  openTime: string;
  /** 清仓时间（YYYY-MM-DD） */
  closeTime: string;
  /** 总买入次数 */
  totalBuyCount: number;
  /** 总卖出次数 */
  totalSellCount: number;
  /** 总交易股数 */
  totalShares: number;
  /** 总买入金额 */
  totalBuyAmount: number;
  /** 总卖出金额 */
  totalSellAmount: number;
  /** 分红金额 */
  totalDividendAmount: number;
  /** 总手续费 */
  totalFees: number;
  /** 总盈利 */
  totalProfit: number;
  /** 盈利比例（百分比） */
  profitRatio: number;
}

/**
 * 历史开仓记录API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface HistoricalTradeAPI {
  /** 获取所有历史开仓记录 */
  getAll(): Promise<HistoricalTradeRecord[]>;
  /** 获取指定交易周期的交易明细 */
  getCycleDetails(cycleId: string): Promise<TradeDetail[]>;
}

/**
 * 新增交易记录的返回结果
 * 包含交易记录和资金明细同步状态
 */
export interface AddTradeResult {
  /** 交易记录 */
  record: any;
  /** 资金明细同步是否成功 */
  fundSyncSuccess: boolean;
  /** 同步失败原因（如果失败） */
  fundSyncError?: string;
}

/**
 * 分页查询交易记录的返回结果
 */
export interface PaginatedTradeRecords {
  records: any[];
  total: number;
  hasMore: boolean;
}

/**
 * 持仓API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface PositionAPI {
  getPositions(): Promise<any[]>;
  getTradeRecords(stockCode: string, page?: number, pageSize?: number): Promise<PaginatedTradeRecords>;
  addTradeRecord(trade: any): Promise<AddTradeResult>;
  updateTradeRecord(trade: any): Promise<any>;
  deleteTradeRecord(id: number): Promise<boolean>;
  fetchPrices(stockCodes: string[]): Promise<any[]>;
  getStockName(stockCode: string): Promise<any>;
}

/**
 * 日志API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface LogAPI {
  readLog(): Promise<{ content: string; error: string | null }>;
  getLogPath(): Promise<string>;
}

/**
 * 备份 API 类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface BackupAPI {
  manualBackup(): Promise<{ success: boolean; error?: string | null }>;
}

/**
 * 股票观察者API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface StockWatcherAPI {
  getWatchlist(): Promise<any[]>;
  addStock(stock: any): Promise<any>;
  updateStock(id: number, updates: any): Promise<any>;
  deleteStock(id: number): Promise<void>;
  refreshPrices(): Promise<void>;
  getLastRefreshTime(): Promise<string | null>;
  onPriceUpdate(callback: (prices: any[]) => void): () => void;
  onAlert(callback: (alert: any) => void): () => void;
  onRefreshTimeUpdate(callback: (time: string) => void): () => void;
  onIndexUpdate(callback: (data: { indices: IndexData[]; status: 'normal' | 'error'; errorMessage?: string | null; timestamp: string }) => void): () => void;
}

/**
 * 策略类型
 */
export type StrategyType = 'equal_amount' | 'equal_ratio';

/**
 * 预设类别
 */
export type PresetCategory = 'half_position' | 'conservative' | 'balanced' | 'aggressive';

/**
 * 策略状态
 */
export type ApplicationStatus = 'active' | 'inactive';

/**
 * 网格策略实体
 */
export interface GridStrategy {
  id: number;
  name: string;
  strategy_type: StrategyType;
  base_price: number;  // 仅用于用户自定义策略，预设模板中为示例值
  grid_spacing: number;  // 等量：固定金额或百分比；等比：百分比(0.01-0.20)
  spacing_type?: 'fixed' | 'percentage';  // 间距类型：固定金额或百分比（仅等量网格使用）
  shares_per_grid: number;
  grid_levels: number;
  is_preset: boolean;
  preset_category?: PresetCategory;
  created_at: string;
  updated_at: string;
}

/**
 * 策略应用记录
 */
export interface StrategyApplication {
  id: number;
  strategy_id: number;
  stock_code: string;
  applied_at: string;
  status: ApplicationStatus;
}

/**
 * 网格层级数据
 */
export interface GridLevel {
  level: number;
  trigger_price: number;
  buy_shares: number;
  cost: number;
  cumulative_shares: number;
  cumulative_cost: number;
}

/**
 * 策略预览数据
 */
export interface StrategyPreview {
  strategy: GridStrategy;
  grids: GridLevel[];
  total_funds_required: number;
  max_shares: number;
}

/**
 * 创建/更新策略输入
 */
export interface CreateStrategyInput {
  name: string;
  strategy_type: StrategyType;
  base_price: number;
  grid_spacing: number;
  spacing_type?: 'fixed' | 'percentage';  // 间距类型，默认 fixed
  shares_per_grid: number;
  grid_levels: number;
}

export interface UpdateStrategyInput extends Partial<CreateStrategyInput> {
  id: number;
}

/**
 * 网格策略API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface GridStrategyAPI {
  getAllStrategies(): Promise<GridStrategy[]>;
  getPresetStrategies(): Promise<GridStrategy[]>;
  createStrategy(input: CreateStrategyInput): Promise<GridStrategy>;
  updateStrategy(input: UpdateStrategyInput): Promise<GridStrategy>;
  deleteStrategy(id: number): Promise<void>;
  previewStrategy(strategy: CreateStrategyInput): Promise<StrategyPreview>;
  applyStrategyToStock(strategyId: number, stockCode: string): Promise<StrategyApplication>;
  getStockStrategy(stockCode: string): Promise<GridStrategy | null>;
  deactivateStockStrategy(stockCode: string): Promise<void>;
  isStrategyInUse(strategyId: number): Promise<boolean>;
  getStrategyUsageInfo(strategyId: number): Promise<Array<{ stock_code: string; applied_at: string }>>;
}

/**
 * 资金明细记录
 * 用于资金管理的资金明细实体（原转账记录升级为资金明细）
 */
export interface TransferRecord {
  /** 唯一标识符 */
  id: number;
  /** 日期 (YYYY-MM-DD) */
  transferDate: string;
  /** 金额（正数） */
  amount: number;
  /** 资金类型：IN(转入)、OUT(转出)、DIVIDEND(股息)、DIVIDEND_TAX(股息扣税)、STOCK_BUY(股票买入)、STOCK_SELL(股票卖出)、INTEREST(利息) */
  type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST';
  /** 账户余额（自动计算或手动设置） */
  accountBalance: number;
  /** 创建时间 (ISO 8601) */
  createdAt?: string;
  /** 更新时间 (ISO 8601) */
  updatedAt?: string;
}

/**
 * 盈亏统计
 * 指定时间段内的盈亏计算结果
 * 盈亏公式：盈亏金额=(期末账户余额+期末持仓市值)-(期初账户余额+期初持仓市值)+(转出金额-转入金额)
 */
export interface ProfitStatistics {
  /** 开始日期 (YYYY-MM-DD) - 期初 */
  startDate: string;
  /** 结束日期 (YYYY-MM-DD) - 期末 */
  endDate: string;
  /** 期初账户余额（来自transfer_records表截止期初日期最近记录的account_balance） */
  openingAccountBalance: number;
  /** 期末账户余额（来自transfer_records表截止期末日期最近记录的account_balance） */
  closingAccountBalance: number;
  /** 期初持仓市值（来自kline_data各持股收盘价×持仓数量之和） */
  openingHoldingsValue: number;
  /** 期末持仓市值（来自kline_data各持股收盘价×持仓数量之和） */
  closingHoldingsValue: number;
  /** 转入总金额（来自transfer_records表IN类型amount之和） */
  totalIn: number;
  /** 转出总金额（来自transfer_records表OUT类型amount之和） */
  totalOut: number;
  /** 盈亏金额 = (closingAccountBalance+closingHoldingsValue)-(openingAccountBalance+openingHoldingsValue)+(totalOut-totalIn) */
  profit: number;
}

/**
 * 年度盈亏数据
 * 用于年度盈亏柱状图展示
 */
export interface AnnualProfitData {
  /** 年份 (YYYY) */
  year: number;
  /** 年初账户余额 */
  openingAccountBalance: number;
  /** 年末账户余额 */
  closingAccountBalance: number;
  /** 年初持仓市值 */
  openingHoldingsValue: number;
  /** 年末持仓市值 */
  closingHoldingsValue: number;
  /** 年度转入总额 */
  totalIn: number;
  /** 年度转出总额 */
  totalOut: number;
  /** 年度盈亏金额 */
  profit: number;
}

/**
 * 月度盈亏数据
 * 用于月度盈亏柱状图展示
 */
export interface MonthlyProfitData {
  /** 月份 (YYYY-MM) */
  month: string;
  /** 月初账户余额 */
  openingAccountBalance: number;
  /** 月末账户余额 */
  closingAccountBalance: number;
  /** 月初持仓市值 */
  openingHoldingsValue: number;
  /** 月末持仓市值 */
  closingHoldingsValue: number;
  /** 月度转入总额 */
  totalIn: number;
  /** 月度转出总额 */
  totalOut: number;
  /** 月度盈亏金额 */
  profit: number;
}

/**
 * 资金明细记录输入（新增时使用）
 */
export interface TransferRecordInput {
  transferDate: string;
  amount: number;
  type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST';
}

/**
 * 资金明细记录更新（修改时使用）
 */
export interface TransferRecordUpdate {
  transferDate?: string;
  amount?: number;
  type?: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST';
  accountBalance?: number; // 允许手动修改账户余额
}

/**
 * 资金概览数据
 * 包含当前账户余额、持仓市值和总资产
 */
export interface FundOverview {
  /** 当前账户余额（元） */
  currentAccountBalance: number;
  /** 当前持仓总市值（元） */
  currentHoldingsMarketValue: number;
  /** 总资产（账户余额 + 持仓市值，元） */
  totalAssets: number;
}

/**
 * 月度资金数据
 * 记录某个月末的账户余额、持仓市值和总资产
 */
export interface MonthlyFundData {
  /** 月份标识 (YYYY-MM) */
  month: string;
  /** 月末账户余额（元） */
  endOfMonthAccountBalance: number;
  /** 月末持仓总市值（元） */
  endOfMonthHoldingsMarketValue: number;
  /** 月末总资产（元） */
  endOfMonthTotalAssets: number;
}

/**
 * 饼图数据项
 * 用于饼图展示的数据结构
 */
export interface PieChartDataItem {
  /** 数据标签（如"账户余额"、"持仓市值"） */
  label: string;
  /** 数值（元） */
  value: number;
  /** 颜色（CSS颜色值） */
  color: string;
  /** 占比（百分比数值，如 45.5 表示 45.5%） */
  percentage: number;
}

/**
 * 资金管理API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface FundManagementAPI {
  /** 获取分页的转账记录列表 */
  getTransferRecords(limit: number, offset: number): Promise<TransferRecord[]>;
  /** 新增转账记录 */
  addTransferRecord(record: TransferRecordInput): Promise<{ id: number }>;
  /** 更新转账记录 */
  updateTransferRecord(id: number, data: TransferRecordUpdate): Promise<{ success: boolean }>;
  /** 删除转账记录 */
  deleteTransferRecord(id: number): Promise<{ success: boolean }>;
  /** 获取指定时间段的盈亏统计（包含期初/期末账户余额、持仓市值、转入/转出金额） */
  getProfitStatistics(startDate: string, endDate: string): Promise<ProfitStatistics>;
  /** 获取指定日期的持仓市值（使用kline_data收盘价计算） */
  getHoldingsMarketValue(date: string): Promise<HoldingsMarketValueResult>;
  /** 获取指定时间段内的资金转入转出统计（来自transfer_records表IN/OUT类型） */
  getTradeStatsInRange(startDate: string, endDate: string): Promise<TradeStatsResult>;
  /** 获取账户余额（从资金明细最后一条记录获取） */
  getAccountBalance(): Promise<number>;
  /** 获取指定日期之前的期初余额 */
  getOpeningBalance(date: string): Promise<number>;
  /** 获取年度盈亏数据（从2024年开始到当前年份） */
  getAnnualProfitData(): Promise<AnnualProfitData[]>;
  /** 获取月度盈亏数据（过去24个月） */
  getMonthlyProfitData(): Promise<MonthlyProfitData[]>;
  /** 获取当前资金概览（账户余额 + 持仓市值 + 总资产） */
  getFundOverview(): Promise<FundOverview>;
  /** 获取过去60个月的月度资金数据（月末账户余额 + 月末持仓市值 + 月末总资产） */
  getMonthlyFundData(): Promise<MonthlyFundData[]>;
}

/**
 * 持仓市值计算结果
 * 指定日期的持仓市值明细
 */
export interface HoldingsMarketValueResult {
  /** 持仓总市值（元） */
  marketValue: number;
  /** 各持股明细 */
  details: Array<{
    /** 股票代码 */
    stockCode: string;
    /** 股票名称 */
    stockName: string;
    /** 收盘价 */
    closePrice: number;
    /** 持仓数量 */
    holdingCount: number;
    /** 个股市值 */
    marketValue: number;
  }>;
  /** 无K线数据的股票代码列表 */
  missingKlineStocks: string[];
}

/**
 * 交易统计结果
 * 指定时间段内的交易统计数据
 */
export interface TradeStatsResult {
  /** 转入总额（BUY类型交易总金额，含手续费） */
  totalIn: number;
  /** 转出总额（SELL类型交易总金额，扣除手续费和印花税） */
  totalOut: number;
}

/**
 * 交易记录
 * 代表一笔股票交易记录（买入/卖出/分红）
 */
export interface TradeRecord {
  /** 唯一标识符 */
  id: number;
  /** 股票代码 */
  stockCode: string;
  /** 股票名称 */
  stockName: string;
  /** 交易日期 (YYYY-MM-DD) */
  tradeDate: string;
  /** 交易类型 */
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  /** 交易价格 */
  tradePrice: number;
  /** 交易数量 */
  tradeCount: number;
  /** 持仓数量 */
  holdingCount: number;
  /** 持仓均价 */
  holdingPrice: number;
}

/**
 * K线数据记录
 * 代表一只股票某一天的日K线数据
 */
export interface KlineData {
  /** 唯一标识符 */
  id: number;
  /** 股票代码（纯数字，与自选股表一致） */
  stockCode: string;
  /** 交易日期 (YYYY-MM-DD) */
  tradeDate: string;
  /** 复权类型：'' 不复权 | 'qfq' 前复权 */
  adjustType: '' | 'qfq';
  /** 开盘价 */
  open: number | null;
  /** 收盘价 */
  close: number | null;
  /** 最高价 */
  high: number | null;
  /** 最低价 */
  low: number | null;
  /** 成交量 */
  volume: number | null;
  /** 成交额 */
  amount: number | null;
  /** 振幅(%) */
  amplitude: number | null;
  /** 涨跌幅(%) */
  changePercent: number | null;
  /** 涨跌额 */
  changeAmount: number | null;
  /** 换手率(%) */
  turnoverRate: number | null;
  /** 创建时间 (ISO 8601) */
  createdAt: string;
  /** 更新时间 (ISO 8601) */
  updatedAt: string;
}

/**
 * K线数据下载结果
 * 代表一次K线数据下载操作的返回结果（支持双复权类型）
 */
export interface KlineDownloadResult {
  /** 是否成功（至少一种复权类型成功即为true） */
  success: boolean;
  /** 不复权数据条数 */
  unadjustedCount?: number;
  /** 前复权数据条数 */
  adjustedCount?: number;
  /** 不复权失败原因 */
  unadjustedError?: string;
  /** 前复权失败原因 */
  adjustedError?: string;
  /** 兼容旧版：总数据条数（已废弃，使用unadjustedCount + adjustedCount） */
  count?: number;
  /** 兼容旧版：失败原因（已废弃，使用unadjustedError/adjustedError） */
  error?: string;
}

/**
 * K线数据下载输入参数
 * 手动下载K线数据时的请求参数
 */
export interface KlineDownloadInput {
  /** 股票代码（纯数字，如 '000001'） */
  stockCode: string;
  /** 开始日期 (YYYYMMDD) */
  startDate: string;
  /** 结束日期 (YYYYMMDD) */
  endDate: string;
  /** 复权类型数组（可选，默认 ['', 'qfq']，与stock-sdk的adjust参数一致） */
  adjustTypes?: ('' | 'qfq')[];
}

/**
 * K线数据API类型 - 通过 preload contextBridge 暴露给渲染进程
 */
export interface KlineAPI {
  /** 下载指定股票的K线数据 */
  downloadKline(input: KlineDownloadInput): Promise<KlineDownloadResult>;
  /** 获取指定股票的K线数据 */
  getKlineData(stockCode: string, startDate?: string, endDate?: string): Promise<KlineData[]>;
  /** 获取K线图展示数据（从数据库读取，支持前复权/不复权切换） */
  getChartData(stockCode: string, adjustType: '' | 'qfq'): Promise<KlineData[]>;
  /** 获取交易记录数据（复用已有TradeRecord实体，查询全部历史记录） */
  getTradeRecords(stockCode: string): Promise<TradeRecord[]>;
}

declare global {
  interface Window {
    electronAPI: WindowAPI;
    configAPI: ConfigAPI;
    gridAPI: GridAPI;
    historicalTradeAPI: HistoricalTradeAPI;
    positionApi: PositionAPI;
    logApi: LogAPI;
    stockWatcherAPI: StockWatcherAPI;
    gridStrategyAPI: GridStrategyAPI;
    fundManagementAPI: FundManagementAPI;
    klineAPI: KlineAPI;
  }
}

