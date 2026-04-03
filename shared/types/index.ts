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
} as const;

declare global {
  interface Window {
    electronAPI: WindowAPI;
  }
}
