import { app, BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import { join } from 'path';
import type { AppConfig } from '../shared/types';
import {
  addStock,
  closeDatabase,
  addTradeRecord as dbAddTradeRecord,
  deleteStock,
  deleteTradeRecord,
  getEnabledStocks,
  getPositions,
  getTradeRecords,
  getWatchlist,
  initDatabase,
  loadConfig,
  saveConfig,
  updateStock,
  updateTradeRecord,
  type AddStockInput,
  type AddTradeInput,
  type UpdateStockInput,
  type UpdateTradeInput
} from './database';
import {
  fetchStockPrices,
  getLastRefreshTime,
  manualRefresh,
  startScheduler,
  stopScheduler
} from './services/priceFetcher';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

log.info('Application starting...');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let currentConfig: AppConfig | null = null;

function createWindow(): void {
  log.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.on('ready-to-show', () => {
    log.info('Window ready to show');
    mainWindow?.show();
    if (currentConfig) {
      mainWindow?.webContents.send('config:loaded', currentConfig);
      log.info('Config sent to renderer');
    }
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  log.info(`Window created. Dev mode: ${isDev}`);
}

ipcMain.on('window:minimize', () => {
  log.debug('IPC: window:minimize');
  mainWindow?.minimize();
});

ipcMain.on('window:maximize', () => {
  log.debug('IPC: window:maximize');
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window:close', () => {
  log.debug('IPC: window:close');
  mainWindow?.close();
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('config:get', () => {
  log.debug('IPC: config:get');
  return currentConfig;
});

ipcMain.handle('config:set', (_event, config: AppConfig) => {
  log.info('IPC: config:set', JSON.stringify(config));
  const success = saveConfig(config);
  log.info('Save config result:', success);
  console.log('[Electron Main] config:set success:', success);
  if (success) {
    currentConfig = config;
  }
  return success;
});

ipcMain.handle('watchlist:get', () => {
  log.debug('IPC: watchlist:get');
  try {
    return getWatchlist();
  } catch (error) {
    log.error('IPC watchlist:get error:', error);
    throw error;
  }
});

ipcMain.handle('watchlist:add', (_event, input: AddStockInput) => {
  log.info('IPC: watchlist:add', JSON.stringify(input));
  try {
    if (input.sellThreshold <= input.buyThreshold) {
      throw new Error('INVALID_THRESHOLD: 卖出阈值必须高于买入阈值');
    }
    return addStock(input);
  } catch (error) {
    log.error('IPC watchlist:add error:', error);
    throw error;
  }
});

ipcMain.handle('watchlist:update', (_event, id: number, updates: UpdateStockInput) => {
  log.info('IPC: watchlist:update', id, JSON.stringify(updates));
  try {
    if (updates.buyThreshold !== undefined && updates.sellThreshold !== undefined) {
      if (updates.sellThreshold <= updates.buyThreshold) {
        throw new Error('INVALID_THRESHOLD: 卖出阈值必须高于买入阈值');
      }
    }
    const result = updateStock(id, updates);
    if (!result) {
      throw new Error('STOCK_NOT_FOUND');
    }
    return result;
  } catch (error) {
    log.error('IPC watchlist:update error:', error);
    throw error;
  }
});

ipcMain.handle('watchlist:delete', (_event, id: number) => {
  log.info('IPC: watchlist:delete', id);
  try {
    const success = deleteStock(id);
    if (!success) {
      throw new Error('STOCK_NOT_FOUND');
    }
  } catch (error) {
    log.error('IPC watchlist:delete error:', error);
    throw error;
  }
});

ipcMain.handle('prices:refresh', async () => {
  log.info('IPC: prices:refresh');
  try {
    const stocks = getEnabledStocks();
    await manualRefresh(stocks);
  } catch (error) {
    log.error('IPC prices:refresh error:', error);
    throw error;
  }
});

ipcMain.handle('prices:last-time', () => {
  log.debug('IPC: prices:last-time');
  return getLastRefreshTime();
});

ipcMain.handle('position:get-list', () => {
  log.debug('IPC: position:get-list');
  try {
    return getPositions();
  } catch (error) {
    log.error('IPC position:get-list error:', error);
    throw error;
  }
});

ipcMain.handle('position:get-records', (_event, stockCode: string) => {
  log.debug('IPC: position:get-records', stockCode);
  try {
    return getTradeRecords(stockCode);
  } catch (error) {
    log.error('IPC position:get-records error:', error);
    throw error;
  }
});

ipcMain.handle('position:add-record', (_event, input: AddTradeInput) => {
  log.info('IPC: position:add-record', JSON.stringify(input));
  try {
    return dbAddTradeRecord(input);
  } catch (error) {
    log.error('IPC position:add-record error:', error);
    throw error;
  }
});

ipcMain.handle('position:update-record', (_event, input: UpdateTradeInput) => {
  log.info('IPC: position:update-record', JSON.stringify(input));
  try {
    return updateTradeRecord(input);
  } catch (error) {
    log.error('IPC position:update-record error:', error);
    throw error;
  }
});

ipcMain.handle('position:delete-record', (_event, id: number) => {
  log.info('IPC: position:delete-record', id);
  try {
    deleteTradeRecord(id);
    return true;
  } catch (error) {
    log.error('IPC position:delete-record error:', error);
    throw error;
  }
});

ipcMain.handle('position:fetch-prices', async (_event, stockCodes: string[]) => {
  log.info('IPC: position:fetch-prices', stockCodes);
  try {
    return await fetchStockPrices(stockCodes);
  } catch (error) {
    log.error('IPC position:fetch-prices error:', error);
    throw error;
  }
});

ipcMain.handle('log:read', async () => {
  log.debug('IPC: log:read');
  const logPath = join(app.getPath('userData'), 'logs', 'main.log');
  try {
    const content = await fs.promises.readFile(logPath, 'utf-8');
    return { content, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('IPC log:read error:', errorMessage);
    if (errorMessage.includes('ENOENT')) {
      return { content: '', error: 'LOG_FILE_NOT_FOUND' };
    }
    if (errorMessage.includes('EACCES')) {
      return { content: '', error: 'LOG_FILE_PERMISSION_DENIED' };
    }
    return { content: '', error: errorMessage };
  }
});

ipcMain.handle('log:getPath', () => {
  log.debug('IPC: log:getPath');
  return join(app.getPath('userData'), 'logs', 'main.log');
});

app.whenReady().then(async () => {
  log.info('App ready');
  app.applicationMenu = null;
  await initDatabase();
  currentConfig = loadConfig();
  log.info('Config loaded on startup');
  createWindow();
  startScheduler(getEnabledStocks);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  log.info('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  log.info('Application quitting...');
  stopScheduler();
  closeDatabase();
});
