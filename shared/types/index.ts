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
  { value: 'sina', label: '新浪采集API', defaultUrl: 'https://hq.sinajs.cn/list=' },
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
} as const;

declare global {
  interface Window {
    electronAPI: WindowAPI;
    configAPI: ConfigAPI;
  }
}
