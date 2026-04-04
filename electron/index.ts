import { app, BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';
import { join } from 'path';
import type { AppConfig } from '../shared/types';
import { closeDatabase, initDatabase, loadConfig, saveConfig } from './database';

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

app.whenReady().then(async () => {
  log.info('App ready');
  app.applicationMenu = null;
  await initDatabase();
  currentConfig = loadConfig();
  log.info('Config loaded on startup');
  createWindow();

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
  closeDatabase();
});
