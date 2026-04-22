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
  calculatePosition(input: CalculatePositionInput): PositionResult;
  calculateOpen(input: CalculateOpenInput): OpenResult;
}

declare global {
  interface Window {
    electronAPI: WindowAPI;
    configAPI: ConfigAPI;
    gridAPI: GridAPI;
  }
}
