import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
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
  getDb,
  saveDatabase,
  type AddStockInput,
  type AddTradeInput,
  type UpdateStockInput,
  type UpdateTradeInput,
  type Position
} from './database';
import {
  calculateOpen,
  calculatePosition
} from './services/gridService';
import {
  startBackupScheduler,
  stopBackupScheduler
} from './services/backupService';
import {
  getAllHistoricalTrades,
  getCycleDetails
} from './services/historicalTradeService';
import {
  fetchStockName,
  fetchStockPrices,
  getLastRefreshTime,
  manualRefresh,
  startScheduler,
  stopScheduler
} from './services/priceFetcher';
import { FundService } from './services/fundService';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';

log.info('Application starting...');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let currentConfig: AppConfig | null = null;
let isQuitting = false;
let fundService: FundService | null = null;

function createTray(): void {
  const iconPath = isDev
    ? join(__dirname, '../../icon.png')
    : join(process.resourcesPath || '', 'icon.png');

  log.info('Loading tray icon from:', iconPath);

  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      throw new Error('Icon is empty');
    }
  } catch (error) {
    log.warn('Failed to load tray icon:', error);
    return;
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('StockAnalyzer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  log.info('System tray created');
}

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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      log.info('Window hidden to tray');
    }
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
  mainWindow?.hide();
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
  isQuitting = true;
  app.quit();
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

ipcMain.handle('position:get-records', (_event, stockCode: string, page?: number, pageSize?: number) => {
  log.debug('IPC: position:get-records', stockCode, page, pageSize);
  try {
    return getTradeRecords(stockCode, page, pageSize);
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
    const config = loadConfig();
    return await fetchStockPrices(stockCodes, config);
  } catch (error) {
    log.error('IPC position:fetch-prices error:', error);
    throw error;
  }
});

ipcMain.handle('stock:get-name', async (_event, stockCode: string) => {
  log.info('IPC: stock:get-name', stockCode);
  try {
    return await fetchStockName(stockCode);
  } catch (error) {
    log.error('IPC stock:get-name error:', error);
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

// ==================== 资金管理 IPC Handlers ====================

/**
 * 获取分页的转账记录列表
 */
ipcMain.handle('get-transfer-records', async (_event, limit: number, offset: number) => {
  log.debug('IPC: get-transfer-records', { limit, offset });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getTransferRecords(limit, offset);
  } catch (error) {
    log.error('IPC get-transfer-records error:', error);
    throw error;
  }
});

/**
 * 新增转账记录
 */
ipcMain.handle('add-transfer-record', async (_event, record: { transferDate: string; amount: number; type: string }) => {
  log.debug('IPC: add-transfer-record', record);
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    const id = await fundService.addTransferRecord(record);
    saveDatabase(); // 保存数据库
    return { id };
  } catch (error) {
    log.error('IPC add-transfer-record error:', error);
    throw error;
  }
});

/**
 * 更新转账记录
 */
ipcMain.handle('update-transfer-record', async (_event, id: number, data: { transferDate?: string; amount?: number; type?: string }) => {
  log.debug('IPC: update-transfer-record', { id, data });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    const success = await fundService.updateTransferRecord(id, data);
    saveDatabase(); // 保存数据库
    return { success };
  } catch (error) {
    log.error('IPC update-transfer-record error:', error);
    throw error;
  }
});

/**
 * 删除转账记录
 */
ipcMain.handle('delete-transfer-record', async (_event, id: number) => {
  log.debug('IPC: delete-transfer-record', { id });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    const success = await fundService.deleteTransferRecord(id);
    saveDatabase(); // 保存数据库
    return { success };
  } catch (error) {
    log.error('IPC delete-transfer-record error:', error);
    throw error;
  }
});

/**
 * 获取指定时间段的盈利统计
 */
ipcMain.handle('get-profit-statistics', async (_event, startDate: string, endDate: string) => {
  log.debug('IPC: get-profit-statistics', { startDate, endDate });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getTransferStatsInRange(startDate, endDate);
  } catch (error) {
    log.error('IPC get-profit-statistics error:', error);
    throw error;
  }
});



/**
 * 获取当前持仓总市值
 */
ipcMain.handle('get-current-holdings-total', async () => {
  log.debug('IPC: get-current-holdings-total');
  try {
    const positions = getPositions();
    
    if (positions.length === 0) {
      return 0;
    }
    
    // 获取所有持仓股票的代码（添加市场前缀）
    const stockCodesWithPrefix = positions.map(p => {
      // 如果股票代码已经包含前缀，直接使用；否则根据代码规则添加
      if (p.stockCode.startsWith('sh') || p.stockCode.startsWith('sz')) {
        return p.stockCode;
      }
      // 60/68开头是上海，00/30开头是深圳
      if (p.stockCode.startsWith('60') || p.stockCode.startsWith('68')) {
        return `sh${p.stockCode}`;
      } else if (p.stockCode.startsWith('00') || p.stockCode.startsWith('30')) {
        return `sz${p.stockCode}`;
      }
      return p.stockCode; // 其他情况保持原样
    });
    
    // 从价格服务获取实时价格（需要config参数）
    const config = currentConfig || loadConfig();
    const priceResults = await fetchStockPrices(stockCodesWithPrefix, config);
    
    // 创建股票代码到价格的映射（使用不带前缀的代码作为key，与持仓数据匹配）
    const priceMap = new Map<string, number>();
    priceResults.forEach(result => {
      if (result.success && result.price) {
        // 去除前缀，使用纯数字代码作为key
        const codeWithoutPrefix = result.stockCode.replace(/^(sh|sz)/, '');
        priceMap.set(codeWithoutPrefix, result.price);
      }
    });
    
    // 计算总市值 = Σ(持仓数量 × 当前价格)
    const totalValue = positions.reduce((sum, position) => {
      const currentPrice = priceMap.get(position.stockCode);
      if (position.holdingCount > 0 && currentPrice) {
        return sum + (position.holdingCount * currentPrice);
      }
      return sum;
    }, 0);
    
    return totalValue;
  } catch (error) {
    log.error('IPC get-current-holdings-total error:', error);
    throw error;
  }
});

ipcMain.handle('grid:calculatePosition', (_event, input) => {
  log.debug('IPC: grid:calculatePosition', input);
  return calculatePosition(input);
});

ipcMain.handle('grid:calculateOpen', (_event, input) => {
  log.debug('IPC: grid:calculateOpen', input);
  return calculateOpen(input);
});

/**
 * 获取所有历史开仓记录
 */
ipcMain.handle('historicalTrade:getAll', () => {
  log.debug('IPC: historicalTrade:getAll');
  try {
    return getAllHistoricalTrades();
  } catch (error) {
    log.error('IPC historicalTrade:getAll error:', error);
    throw error;
  }
});

/**
 * 获取指定交易周期的交易明细
 */
ipcMain.handle('historicalTrade:getCycleDetails', (_event, cycleId: string) => {
  log.debug('IPC: historicalTrade:getCycleDetails', cycleId);
  try {
    return getCycleDetails(cycleId);
  } catch (error) {
    log.error('IPC historicalTrade:getCycleDetails error:', error);
    throw error;
  }
});

/**
 * 手动触发数据库备份
 */
ipcMain.handle('backup:manual', async () => {
  log.debug('IPC: backup:manual');
  try {
    const { performBackup } = await import('./services/backupService');
    await performBackup();
    return { success: true, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('IPC backup:manual error:', errorMessage);
    return { success: false, error: errorMessage };
  }
});

app.whenReady().then(async () => {
  log.info('App ready');
  app.applicationMenu = null;
  await initDatabase();
  fundService = new FundService(getDb());
  currentConfig = loadConfig();
  log.info('Config loaded on startup');
  createWindow();
  createTray();
  isQuitting = false;
  startScheduler(getEnabledStocks);
  startBackupScheduler(); // 启动数据库备份调度器

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
  isQuitting = true;
  stopScheduler();
  stopBackupScheduler(); // 停止数据库备份调度器
  closeDatabase();
});
