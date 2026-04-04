import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig } from '../shared/types';

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

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('configAPI', configAPI);
