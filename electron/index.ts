import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron';
import log from 'electron-log';
import fs from 'fs';
import { join } from 'path';
import type {
  AppConfig,
  KlineBatchDownloadInput,
  KlineBatchDownloadSummary,
  KlineDownloadInput,
  KlinePeriod,
  MarketKlineBar,
  MarketKlineQuery,
  SecuritiesDirectoryPage,
  SecuritiesDirectoryQuery,
} from '../shared/types';
import { IPC_CHANNELS } from '../shared/types';
import {
  addStock,
  closeDatabase,
  addTradeRecord as dbAddTradeRecord,
  getChartData as dbGetChartData,
  getKlineData as dbGetKlineData,
  deleteStock,
  deleteTradeRecord,
  getDb,
  getPositions,
  getTradeRecords,
  getTradeRecordsByStockCode,
  getWatchlist,
  reorderWatchlist,
  getDatabasePath,
  initDatabase,
  loadConfig,
  runInTransaction,
  saveConfig,
  updateStock,
  updateTradeRecord,
  type AddStockInput,
  type AddTradeInput,
  type UpdateStockInput,
  type UpdateTradeInput
} from './database';
import { closeMarketDatabase, getMarketDb, initMarketDatabase } from './marketDatabase';
import {
  getMarketSyncService,
  recoverInterruptedMarketSync,
  stopMarketDataSync
} from './services/marketDataSyncService';
import { readMarketKline, searchSecurities } from './services/marketRepository';
import {
  setBackupFailureNotifier,
  startBackupScheduler,
  stopBackupScheduler
} from './services/backupService';
import { FundService } from './services/fundService';
import {
  calculateOpen,
  calculatePosition
} from './services/gridService';
import {
  getAllHistoricalTrades,
  getCycleDetails
} from './services/historicalTradeService';
import {
  downloadBatch,
  downloadKline,
  runStartupCatchUp,
  startKlineDownloadScheduler,
  stopKlineDownloadScheduler,
  validateDownloadInput
} from './services/klineDownloadService';
import {
  fetchStockName,
  fetchStockPrices,
  getLastRefreshTime,
  manualRefresh,
  startScheduler,
  stopScheduler
} from './services/priceFetcher';
import {
  cleanupExpiredLogs,
  formatLogDate,
  getLogDir,
  getLogFilePath,
  isValidLogDate,
  listLogDates,
  migrateLegacyLogs
} from './services/logService';
import {
  SCHEMAS,
  validatedHandle,
  type IpcHandler,
  type IpcLogger,
  type IpcRegister,
  type Validator,
} from './ipcValidation';

/** 把 ipcMain.handle 适配成可注入的注册函数，使校验模块保持不依赖 electron */
const registerIpc: IpcRegister = (channel, listener) => {
  ipcMain.handle(channel, listener as Parameters<typeof ipcMain.handle>[1]);
};

const ipcLogger: IpcLogger = {
  warn: (message, meta) => log.warn(message, meta),
};

/** 带运行时入参校验的 handler 注册入口 */
function handleValidated(
  channel: string,
  schema: readonly Validator[],
  handler: IpcHandler
): void {
  validatedHandle(registerIpc, channel, schema, handler, ipcLogger);
}

// ==================== 日志：按自然日分文件 ====================

/** 日志目录（<userData>/logs） */
const LOG_DIR = getLogDir();

// 存量日志迁移必须早于 electron-log 的首次写入：否则默认的 main.log
// 会被重新创建，迁移结果被破坏。迁移函数本身不写日志，结果在配置完成后输出。
const legacyMigration = migrateLegacyLogs(LOG_DIR);

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
// 关闭按大小轮转：改由按自然日分文件管理，不再产生 main.old.log
log.transports.file.maxSize = 0;

/** 缓存当天日期与路径，避免每条日志都重复计算日期 */
let cachedLogDate = '';
let cachedLogPath = '';

log.transports.file.resolvePathFn = (_variables, message) => {
  // 日期优先取自消息自身时间：跨零点写入时仍归入消息产生的那一天
  const date = message?.date instanceof Date ? message.date : new Date();
  const dateStr = formatLogDate(date);
  if (dateStr !== cachedLogDate) {
    cachedLogDate = dateStr;
    cachedLogPath = getLogFilePath(LOG_DIR, dateStr);
  }
  return cachedLogPath;
};

log.info('Application starting...');

for (const item of legacyMigration.renamed) {
  log.info(`存量日志已迁移: ${item.from} -> ${item.to}`);
}
for (const item of legacyMigration.skipped) {
  log.warn(`存量日志未迁移（目标已存在）: ${item.from} -> ${item.to}`);
}

/** 上次执行清理的日期，避免每分钟重复扫描目录 */
let lastCleanupDate = '';
let logCleanupTimer: NodeJS.Timeout | null = null;

/**
 * 日期变化时清理超期日志
 * 启动时执行一次，之后由定时器在跨天时触发，覆盖长时间运行不重启的场景
 */
function cleanupLogsIfNeeded(): void {
  const today = new Date();
  const todayStr = formatLogDate(today);
  if (todayStr === lastCleanupDate) {
    return;
  }

  lastCleanupDate = todayStr;
  const deleted = cleanupExpiredLogs(LOG_DIR, today);
  if (deleted.length > 0) {
    log.info(`清理超期日志 ${deleted.length} 个: ${deleted.join(', ')}`);
  }
}

/**
 * 启动日志清理定时器
 */
function startLogCleanupTimer(): void {
  if (logCleanupTimer) {
    return;
  }
  cleanupLogsIfNeeded();
  logCleanupTimer = setInterval(cleanupLogsIfNeeded, 60 * 1000);
}

/**
 * 停止日志清理定时器
 */
function stopLogCleanupTimer(): void {
  if (logCleanupTimer) {
    clearInterval(logCleanupTimer);
    logCleanupTimer = null;
  }
}

startLogCleanupTimer();

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isWindowReady = false;
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

/** dev 模式 Vite 地址 */
const DEV_SERVER_URL = 'http://localhost:15173';
/** dev 模式等待 Vite 就绪的最大重试次数与间隔 */
const DEV_SERVER_MAX_RETRIES = 30;
const DEV_SERVER_RETRY_DELAY_MS = 1000;

/**
 * dev 模式下等待 Vite 就绪后再加载页面。
 * `npm run dev` 并行启动 Vite 与 Electron，Electron 可能先于 Vite 监听到端口；
 * 只调用一次 loadURL 会永久停留在空白页，这里失败后按秒重试。
 */
function loadDevServer(window: BrowserWindow, attempt = 1): void {
  window.loadURL(DEV_SERVER_URL).catch((error) => {
    if (window.isDestroyed()) {
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`Dev server load failed (attempt ${attempt}/${DEV_SERVER_MAX_RETRIES}): ${message}`);
    if (attempt >= DEV_SERVER_MAX_RETRIES) {
      log.error(`Dev server unreachable after ${DEV_SERVER_MAX_RETRIES} attempts: ${DEV_SERVER_URL}`);
      return;
    }
    setTimeout(() => {
      if (!window.isDestroyed()) {
        loadDevServer(window, attempt + 1);
      }
    }, DEV_SERVER_RETRY_DELAY_MS);
  });
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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    log.error(`Window failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
  });

  mainWindow.on('ready-to-show', () => {
    log.info('Window ready to show');
    isWindowReady = true;
    mainWindow?.show();
    mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_READY);
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
    mainWindow.loadURL('http://localhost:15173');
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

ipcMain.handle(IPC_CHANNELS.WINDOW_IS_READY, () => isWindowReady);

ipcMain.handle('config:get', () => {
  log.debug('IPC: config:get');
  return currentConfig;
});

handleValidated('config:set', SCHEMAS.configSet, (_event, config: AppConfig) => {
  log.info('IPC: config:set', JSON.stringify(config));
  const success = saveConfig(config);
  log.info('Save config result:', success);
  console.log('[Electron Main] config:set success:', success);
  if (success) {
    // 重新读取以拿到归一化后的配置（api.url 由 provider 派生），避免 config:get 返回旧地址
    currentConfig = loadConfig();
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

handleValidated('watchlist:add', SCHEMAS.watchlistAdd, (_event, input: AddStockInput) => {
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

ipcMain.handle('watchlist:reorder', (_event, orderedIds: number[]) => {
  log.info('IPC: watchlist:reorder', orderedIds);
  try {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new Error('INVALID_ORDER: 顺序列表不能为空');
    }
    if (orderedIds.some(id => !Number.isInteger(id) || id <= 0)) {
      throw new Error('INVALID_ORDER: 顺序列表包含非法 id');
    }
    const orderedSet = new Set(orderedIds);
    if (orderedSet.size !== orderedIds.length) {
      throw new Error('INVALID_ORDER: 顺序列表存在重复 id');
    }
    // 集合必须与当前库中自选股完全一致，防止期间新增/删除导致顺序错位
    const currentIds = getWatchlist().map(stock => stock.id);
    const sameSet =
      currentIds.length === orderedSet.size && currentIds.every(id => orderedSet.has(id));
    if (!sameSet) {
      throw new Error('WATCHLIST_CHANGED: 自选股列表已变化，请刷新后重试');
    }
    return reorderWatchlist(orderedIds);
  } catch (error) {
    log.error('IPC watchlist:reorder error:', error);
    throw error;
  }
});

ipcMain.handle('prices:refresh', async () => {
  log.info('IPC: prices:refresh');
  try {
    const stocks = getWatchlist();
    return await manualRefresh(stocks);
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

handleValidated('position:get-records', SCHEMAS.positionGetRecords, (_event, stockCode: string, page?: number, pageSize?: number) => {
  log.debug('IPC: position:get-records', stockCode, page, pageSize);
  try {
    return getTradeRecords(stockCode, page, pageSize);
  } catch (error) {
    log.error('IPC position:get-records error:', error);
    throw error;
  }
});

handleValidated('position:add-record', SCHEMAS.positionAddRecord, async (_event, input: AddTradeInput) => {
  log.info('IPC: position:add-record', JSON.stringify(input));
  try {
    // 交易记录 + 资金明细 + 余额重算在同一事务内完成，事务内不落盘
    const result = await runInTransaction(async () => {
      const added = dbAddTradeRecord(input);
      if (!fundService) {
        throw new Error('fundService未初始化');
      }

      const tradeRecordId = added.record.id;

      if (input.tradeType === 'BUY') {
        const { calcStockBuyAmount } = await import('./services/tradeService');
        const buyAmount = calcStockBuyAmount(input.tradePrice, input.tradeCount, input.stockCode);
        await fundService.addTransferRecord({
          transferDate: input.tradeDate,
          amount: buyAmount,
          type: 'STOCK_BUY',
          tradeRecordId,
        });
      } else if (input.tradeType === 'SELL') {
        const { calcStockSellAmount, calcDividendTax, getNextDay } = await import('./services/tradeService');
        const sellAmount = calcStockSellAmount(input.tradePrice, input.tradeCount, input.stockCode);
        await fundService.addTransferRecord({
          transferDate: input.tradeDate,
          amount: sellAmount,
          type: 'STOCK_SELL',
          tradeRecordId,
        });

        // 计算FIFO股息税，如果金额>0则创建DIVIDEND_TAX记录
        const { getTradeRecordsByStockCode } = await import('./database');
        let allTrades = getTradeRecordsByStockCode(input.stockCode);
        allTrades = allTrades.filter(trade => trade.id !== tradeRecordId);
        const dividendTax = calcDividendTax(input.stockCode, input.tradeDate, input.tradeCount, allTrades);
        if (dividendTax > 0) {
          await fundService.addTransferRecord({
            transferDate: getNextDay(input.tradeDate),
            amount: dividendTax,
            type: 'DIVIDEND_TAX',
            tradeRecordId,
          });
        }
      } else if (input.tradeType === 'DIVIDEND') {
        const dividendAmount = input.tradePrice * added.record.holdingCount;
        if (dividendAmount > 0) {
          await fundService.addTransferRecord({
            transferDate: input.tradeDate,
            amount: dividendAmount,
            type: 'DIVIDEND',
            tradeRecordId,
          });
        }
      }
      return added;
    });
    return result;
  } catch (error) {
    log.error('IPC position:add-record error:', error);
    const reason = error instanceof Error ? error.message : '未知错误';
    throw new Error(`保存失败，未产生任何变更，请重试：${reason}`);
  }
});

handleValidated('position:update-record', SCHEMAS.positionUpdateRecord, async (_event, input: UpdateTradeInput) => {
  log.info('IPC: position:update-record', JSON.stringify(input));
  try {
    // 编辑会重放持仓快照链、同步关联明细金额并重算余额链，全部在同一事务内
    const result = await runInTransaction(() => updateTradeRecord(input));
    return result;
  } catch (error) {
    log.error('IPC position:update-record error:', error);
    throw error;
  }
});

handleValidated('position:delete-record', SCHEMAS.positionDeleteRecord, async (_event, id: number) => {
  log.info('IPC: position:delete-record', id);
  try {
    await runInTransaction(() => {
      deleteTradeRecord(id);
    });
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

ipcMain.handle('log:read', async (_event, date?: string) => {
  log.debug('IPC: log:read', date);
  // 不传日期时读取当天
  const targetDate = date ?? formatLogDate(new Date());
  // 先校验再拼路径，避免入参被当作路径片段使用
  if (!isValidLogDate(targetDate)) {
    return { content: '', error: 'INVALID_LOG_DATE' };
  }

  const logPath = getLogFilePath(LOG_DIR, targetDate);
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

ipcMain.handle('log:list', () => {
  log.debug('IPC: log:list');
  try {
    return listLogDates(LOG_DIR);
  } catch (error) {
    // 目录不可读时返回空列表，不影响日志页渲染
    log.error('IPC log:list error:', error instanceof Error ? error.message : String(error));
    return [];
  }
});

ipcMain.handle('log:getPath', () => {
  log.debug('IPC: log:getPath');
  return getLogFilePath(LOG_DIR, formatLogDate(new Date()));
});

// 版本与运行环境信息（无入参只读通道，不需要 IPC 入参校验）
ipcMain.handle('app:info', () => {
  log.debug('IPC: app:info');
  return {
    version: app.getVersion(),
    // 仅表示「是否未打包」，与下方 isDev（含 NODE_ENV）语义不同，勿混用
    isDev: !app.isPackaged,
    dbPath: getDatabasePath(),
    // 目录路径：log:getPath 返回的是当天日志文件，这里必须用日志目录
    logDir: getLogDir(),
  };
});

// 打开数据库文件所在目录（路径固定由主进程推导，不接受外部传入路径）
ipcMain.handle('app:open-db-directory', async () => {
  log.debug('IPC: app:open-db-directory');
  try {
    const dbDir = join(getDatabasePath(), '..');
    // 首次运行或目录被清理时先确保存在再打开
    fs.mkdirSync(dbDir, { recursive: true });
    const openError = await shell.openPath(dbDir);
    if (openError) {
      log.error('IPC app:open-db-directory error:', openError);
      return { success: false, error: openError };
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC app:open-db-directory error:', message);
    return { success: false, error: message };
  }
});

ipcMain.handle('log:open-directory', async () => {
  log.debug('IPC: log:open-directory');
  try {
    // 当天还没有日志时目录也可能不存在，先确保存在再打开
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC log:open-directory mkdir error:', message);
    return { success: false, error: message };
  }

  const openError = await shell.openPath(LOG_DIR);
  if (openError) {
    log.error('IPC log:open-directory error:', openError);
    return { success: false, error: openError };
  }

  return { success: true };
});

// ==================== 资金管理 IPC Handlers ====================

/**
 * 获取分页的转账记录列表
 */
handleValidated('get-transfer-records', SCHEMAS.getTransferRecords, async (_event, limit: number, offset: number, types?: string[]) => {
  log.debug('IPC: get-transfer-records', { limit, offset, types });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getTransferRecords(limit, offset, types);
  } catch (error) {
    log.error('IPC get-transfer-records error:', error);
    throw error;
  }
});

/**
 * 新增转账记录
 */
handleValidated('add-transfer-record', SCHEMAS.addTransferRecord, async (_event, record: { transferDate: string; amount: number; type: string; tradeRecordId?: number | null }) => {
  log.debug('IPC: add-transfer-record', record);
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    const id = await fundService.addTransferRecord(record);
    return { id };
  } catch (error) {
    log.error('IPC add-transfer-record error:', error);
    throw error;
  }
});

/**
 * 更新转账记录
 */
handleValidated('update-transfer-record', SCHEMAS.updateTransferRecord, async (_event, id: number, data: { transferDate?: string; amount?: number; type?: string; accountBalance?: number | string | null }) => {
  log.debug('IPC: update-transfer-record', { id, data });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    const success = await fundService.updateTransferRecord(id, data);
    return { success };
  } catch (error) {
    log.error('IPC update-transfer-record error:', error);
    throw error;
  }
});

/**
 * 删除转账记录
 */
handleValidated('delete-transfer-record', SCHEMAS.deleteTransferRecord, async (_event, id: number) => {
  log.debug('IPC: delete-transfer-record', { id });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    const success = await fundService.deleteTransferRecord(id);
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
    return await fundService.getProfitStatistics(startDate, endDate);
  } catch (error) {
    log.error('IPC get-profit-statistics error:', error);
    throw error;
  }
});

/**
 * 获取指定日期的持仓市值（使用kline_daily收盘价计算）
 */
ipcMain.handle('get-holdings-market-value', async (_event, date: string) => {
  log.debug('IPC: get-holdings-market-value', date);
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getHoldingsMarketValue(date);
  } catch (error) {
    log.error('IPC get-holdings-market-value error:', error);
    throw error;
  }
});

/**
 * 获取指定时间段内的交易统计（来自trade_record表）
 */
ipcMain.handle('get-trade-stats-in-range', async (_event, startDate: string, endDate: string) => {
  log.debug('IPC: get-trade-stats-in-range', { startDate, endDate });
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getTradeStatsInRange(startDate, endDate);
  } catch (error) {
    log.error('IPC get-trade-stats-in-range error:', error);
    throw error;
  }
});

/**
 * 获取年度盈亏数据（从2024年开始到当前年份）
 */
ipcMain.handle('get-annual-profit-data', async () => {
  log.debug('IPC: get-annual-profit-data');
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getAnnualProfitData();
  } catch (error) {
    log.error('IPC get-annual-profit-data error:', error);
    throw error;
  }
});

/**
 * 获取月度盈亏数据（过去24个月）
 */
ipcMain.handle('get-monthly-profit-data', async () => {
  log.debug('IPC: get-monthly-profit-data');
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getMonthlyProfitData();
  } catch (error) {
    log.error('IPC get-monthly-profit-data error:', error);
    throw error;
  }
});



/**
 * 获取期初余额
 */
ipcMain.handle('get-opening-balance', async (_event, date: string) => {
  log.debug('IPC: get-opening-balance', date);
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getOpeningBalance(date);
  } catch (error) {
    log.error('IPC get-opening-balance error:', error);
    throw error;
  }
});

/**
 * 获取当前资金概览（账户余额 + 持仓市值 + 总资产）
 */
ipcMain.handle('fund:getFundOverview', async () => {
  log.debug('IPC: fund:getFundOverview');
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getFundOverview();
  } catch (error) {
    log.error('IPC fund:getFundOverview error:', error);
    throw error;
  }
});

/**
 * 获取过去60个月的月度资金数据
 */
ipcMain.handle('fund:getMonthlyFundData', async () => {
  log.debug('IPC: fund:getMonthlyFundData');
  try {
    if (!fundService) {
      throw new Error('FundService not initialized');
    }
    return await fundService.getMonthlyFundData();
  } catch (error) {
    log.error('IPC fund:getMonthlyFundData error:', error);
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
    // 原样透传备份结果，不再无条件假定成功
    return await performBackup();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('IPC backup:manual error:', errorMessage);
    return { success: false, error: errorMessage };
  }
});

/** 合法的K线周期集合（白名单校验，防止表名注入与静默查空表） */
const VALID_KLINE_PERIODS = new Set<string>(['d', 'w', 'm']);

/**
 * 校验并归一化K线周期入参
 * @param period 原始入参
 * @param required 是否必填（true 时缺省直接报错；false 时缺省返回 'd' 日线）
 * @returns 归一化后的周期
 * @throws INVALID_PERIOD 周期缺失或非法
 */
function assertKlinePeriod(period: unknown, required = false): KlinePeriod {
  if (period === undefined || period === null || period === '') {
    if (required) {
      throw new Error('INVALID_PERIOD: 缺少K线周期参数');
    }
    return 'd';
  }
  if (typeof period !== 'string' || !VALID_KLINE_PERIODS.has(period)) {
    throw new Error(`INVALID_PERIOD: 不支持的K线周期 ${String(period)}`);
  }
  return period as KlinePeriod;
}

/** 周期数组归一化的固定顺序：日线 → 周线 → 月线（与界面展示顺序一致） */
const KLINE_PERIOD_ORDER: KlinePeriod[] = ['d', 'w', 'm'];

/**
 * 校验并归一化K线周期数组入参
 * - 缺省 → 按日线处理
 * - 空数组、非数组、含白名单外元素 → INVALID_PERIOD（空数组视为「未选择周期」，不静默兜底）
 * - 合法输入按 日线 → 周线 → 月线 去重排序，执行顺序与勾选顺序无关
 * @param periods 原始入参
 * @returns 归一化后的周期数组
 * @throws INVALID_PERIOD 周期缺失或非法
 */
function assertKlinePeriods(periods: unknown): KlinePeriod[] {
  if (periods === undefined || periods === null) {
    return ['d'];
  }
  if (!Array.isArray(periods)) {
    throw new Error(`INVALID_PERIOD: 周期参数必须为数组，收到 ${String(periods)}`);
  }
  if (periods.length === 0) {
    throw new Error('INVALID_PERIOD: 请至少选择一个K线周期');
  }

  for (const period of periods) {
    if (typeof period !== 'string' || !VALID_KLINE_PERIODS.has(period)) {
      throw new Error(`INVALID_PERIOD: 不支持的K线周期 ${String(period)}`);
    }
  }

  const unique = new Set(periods as string[]);
  return KLINE_PERIOD_ORDER.filter(period => unique.has(period));
}

/**
 * 下载K线数据（T116-T117：接收adjustTypes参数）
 */
ipcMain.handle('kline:download', async (_event, input: KlineDownloadInput) => {
  log.info('IPC: kline:download', JSON.stringify(input));
  try {
    validateDownloadInput(input.stockCode, input.startDate, input.endDate);
    // T116a：验证adjustTypes不能为空数组
    if (input.adjustTypes && input.adjustTypes.length === 0) {
      throw new Error('请至少选择一种复权类型');
    }
    // 周期缺省按日线处理；空数组与非法值直接拒绝
    const periods = assertKlinePeriods(input.periods);
    return await downloadKline(input.stockCode, input.startDate, input.endDate, input.adjustTypes, periods);
  } catch (error) {
    log.error('IPC kline:download error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误',
    };
  }
});

/**
 * 批量下载多只股票的K线数据（主进程串行执行，逐只推送进度）
 */
handleValidated('kline:download-batch', SCHEMAS.klineDownloadBatch, async (_event, input: KlineBatchDownloadInput) => {
  log.info('IPC: kline:download-batch', JSON.stringify({
    stockCodes: input.stockCodes,
    startDate: input.startDate,
    endDate: input.endDate,
    adjustTypes: input.adjustTypes,
    periods: input.periods,
  }));

  try {
    // 批量下载的股票均来自自选股，从数据库补齐名称用于进度展示
    const nameMap = new Map(getWatchlist().map(stock => [stock.stockCode, stock.stockName]));
    const stocks = input.stockCodes.map(stockCode => ({
      stockCode,
      stockName: nameMap.get(stockCode) ?? '',
    }));

    // 周期数组缺省按日线；空数组与非法值在入口拒绝（按 日→周→月 归一化）
    const periods = assertKlinePeriods(input.periods);

    return await downloadBatch(
      stocks,
      input.startDate,
      input.endDate,
      input.adjustTypes ?? ['', 'qfq'],
      periods,
      {
        retry: true,
        onProgress: payload => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kline:batch-progress', payload);
          }
        },
      }
    );
  } catch (error) {
    log.error('IPC kline:download-batch error:', error);
    const rawMessage = error instanceof Error ? error.message : '未知错误';
    // 互斥错误转换为用户可读提示，其余错误原样返回（含参数校验前缀）
    const errorMessage = rawMessage.startsWith('BATCH_DOWNLOAD_IN_PROGRESS')
      ? '已有批量下载任务正在进行中，请稍后再试'
      : rawMessage;
    const failedSummary: KlineBatchDownloadSummary = {
      success: false,
      total: 0,
      successCount: 0,
      failedCount: 0,
      results: [],
      error: errorMessage,
    };
    return failedSummary;
  }
});

// ==================== 行情库（market_data.db）IPC Handlers ====================

/**
 * 行情库不可用时的状态兜底：页面能渲染错误，而不是收到未处理的异常
 */
function emptyMarketSyncStatus(error: string): import('../shared/types').MarketSyncStatus {
  return {
    state: 'failed',
    mode: null,
    total: 0,
    pending: 0,
    running: 0,
    success: 0,
    failed: 0,
    earliestMissingDate: null,
    latestTradeDate: null,
    incrementalTaskCount: 0,
    currentTaskKey: null,
    currentStockCode: null,
    currentStockName: null,
    lastError: error,
    updatedAt: new Date().toISOString(),
    failedTasks: [],
  };
}

handleValidated('market:sync:status', SCHEMAS.marketSyncStatus, () => {
  log.debug('IPC: market:sync:status');
  try {
    return getMarketSyncService().getStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC market:sync:status error:', message);
    return emptyMarketSyncStatus(message);
  }
});

handleValidated('market:sync:start', SCHEMAS.marketSyncStart, async () => {
  log.info('IPC: market:sync:start');
  try {
    return await getMarketSyncService().start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC market:sync:start error:', message);
    return { success: false, error: message };
  }
});

handleValidated('market:sync:refresh-universe', SCHEMAS.marketSyncRefreshUniverse, async () => {
  log.info('IPC: market:sync:refresh-universe');
  try {
    return await getMarketSyncService().refreshUniverse();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC market:sync:refresh-universe error:', message);
    return { success: false, error: message };
  }
});

handleValidated('market:sync:incremental', SCHEMAS.marketSyncIncremental, async () => {
  log.info('IPC: market:sync:incremental');
  try {
    return await getMarketSyncService().incremental();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC market:sync:incremental error:', message);
    return { success: false, error: message };
  }
});

handleValidated('market:sync:retry-failed', SCHEMAS.marketSyncRetryFailed, async () => {
  log.info('IPC: market:sync:retry-failed');
  try {
    return await getMarketSyncService().retryFailed();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('IPC market:sync:retry-failed error:', message);
    return { success: false, error: message };
  }
});

handleValidated(
  'market:securities:list',
  SCHEMAS.marketSecuritiesList,
  (_event, query: SecuritiesDirectoryQuery): SecuritiesDirectoryPage => {
    log.debug('IPC: market:securities:list');
    try {
      return searchSecurities(getMarketDb(), query);
    } catch (error) {
      log.error('IPC market:securities:list error:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
);

/** 全市场 K 线只读查询（market_data.db），非法参数由 handleValidated 拒绝 */
handleValidated(
  'market:kline:query',
  SCHEMAS.marketKlineQuery,
  (_event, query: MarketKlineQuery): MarketKlineBar[] => {
    log.debug('IPC: market:kline:query', query.stockCode, query.period, query.adjust);
    try {
      return readMarketKline(getMarketDb(), query);
    } catch (error) {
      log.error('IPC market:kline:query error:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
);

/**
 * 获取K线数据
 */
ipcMain.handle('kline:get-data', async (_event, stockCode: string, period: KlinePeriod, startDate?: string, endDate?: string) => {
  log.debug('IPC: kline:get-data', stockCode, period, startDate, endDate);
  try {
    const normalizedPeriod = assertKlinePeriod(period);
    return dbGetKlineData(stockCode, normalizedPeriod, startDate, endDate);
  } catch (error) {
    log.error('IPC kline:get-data error:', error);
    throw error;
  }
});

/**
 * 获取K线图展示数据（支持周期与前复权/不复权）
 * 周期为必填参数：缺省不兜底为日线，避免静默查错表
 */
ipcMain.handle('kline:get-chart-data', async (_event, stockCode: string, adjustType: '' | 'qfq', period?: KlinePeriod) => {
  log.info('IPC: kline:get-chart-data', stockCode, adjustType, period);
  try {
    const normalizedPeriod = assertKlinePeriod(period, true);
    return dbGetChartData(stockCode, adjustType, normalizedPeriod);
  } catch (error) {
    log.error('IPC kline:get-chart-data error:', error);
    throw error;
  }
});

/**
 * 获取交易记录数据（K线图标注用，查询全部历史记录）
 * 复用 getTradeRecordsByStockCode 函数，返回全部交易记录（非分页）
 */
handleValidated('kline:get-trade-records', SCHEMAS.klineGetTradeRecords, async (_event, stockCode: string) => {
  log.debug('IPC: kline:get-trade-records', stockCode);
  try {
    return getTradeRecordsByStockCode(stockCode);
  } catch (error) {
    log.error('IPC kline:get-trade-records error:', error);
    throw error;
  }
});

/**
 * 展示启动失败提示并退出应用
 * 初始化失败后若继续运行，用户只会看到每个页面报错，且进程无窗口驻留
 * @param stage 失败阶段描述
 * @param error 原始错误
 */
function handleStartupFailure(stage: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  log.error(`${stage}失败，应用退出:`, error);

  let dbPath = '';
  try {
    dbPath = getDatabasePath();
  } catch (pathError) {
    log.warn('获取数据库路径失败:', pathError);
  }

  dialog.showErrorBox(
    'StockAnalyzer 启动失败',
    [
      `${stage}失败：${message}`,
      ...(dbPath ? [`数据库文件：${dbPath}`, '可用同目录下的 stockanalyzer.db.bak-<时间戳> 备份覆盖后重试。'] : []),
    ].join('\n')
  );
  app.quit();
}

app.whenReady().then(async () => {
  log.info('App ready');
  app.applicationMenu = null;

  try {
    await initDatabase();
  } catch (error) {
    // 数据库不可用时不进入后续初始化，避免创建出无法工作的窗口
    handleStartupFailure('数据库初始化', error);
    return;
  }

  // 行情库与业务库双轨：初始化失败只影响行情库页面，不阻断自选股等功能
  try {
    await initMarketDatabase();
    recoverInterruptedMarketSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('行情库初始化失败:', error);
    dialog.showErrorBox(
      '行情库初始化失败',
      `全市场行情库（market_data.db）不可用，自选股等功能不受影响。\n${message}`
    );
  }

  fundService = new FundService(getDb());
  currentConfig = loadConfig();
  log.info('Config loaded on startup');
  createWindow();
  createTray();
  isQuitting = false;
  startScheduler(getWatchlist);
  // 自动备份失败时给出用户可见提示，不再只写日志
  setBackupFailureNotifier((reason) => {
    try {
      new Notification({ title: '数据库备份失败', body: reason }).show();
    } catch (notifyError) {
      log.error('备份失败通知发送失败:', notifyError);
    }
  });
  startBackupScheduler(); // 启动数据库备份调度器
  startKlineDownloadScheduler(); // 启动K线数据自动下载调度器
  // 已过每日计划时刻（15:10）时补跑当日未完成的 K 线；不阻塞窗口显示
  void runStartupCatchUp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch(error => {
  handleStartupFailure('应用启动', error);
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
  stopKlineDownloadScheduler(); // 停止K线数据自动下载调度器
  stopLogCleanupTimer(); // 停止日志清理定时器
  stopMarketDataSync(); // 停止行情库同步调度
  closeDatabase();
  closeMarketDatabase();
});
