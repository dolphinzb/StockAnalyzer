import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 首次加载 sql.js wasm + 落盘，全量并行跑测试时耗时可能超过默认 5s
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

const mockState = vi.hoisted(() => ({ home: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockState.home,
    getAppPath: () => '',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import { runMigrations, setUserVersion } from '../../electron/migrations';

let tempHome = '';

/**
 * 读取数据库文件的 user_version
 */
async function readUserVersion(filePath: string): Promise<number> {
  const SQL = await initSqlJs();
  const database = new SQL.Database(readFileSync(filePath));
  const result = database.exec('PRAGMA user_version');
  const version = result.length > 0 ? Number(result[0].values[0][0]) : -1;
  database.close();
  return version;
}

/**
 * 在临时 home 下构造「当前结构但无版本记录」的存量库
 */
async function createLegacyFile(): Promise<string> {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  runMigrations(database, { isNewDatabase: true });
  setUserVersion(database, 0);

  const dbDir = join(tempHome, '.stockanalyzer');
  mkdirSync(dbDir, { recursive: true });
  const filePath = join(dbDir, 'stockanalyzer.db');
  writeFileSync(filePath, Buffer.from(database.export()));
  database.close();
  return filePath;
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'stockanalyzer-init-'));
  mockState.home = tempHome;
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  rmSync(tempHome, { recursive: true, force: true });
});

describe('数据库初始化', () => {
  it('库文件不存在时按 V1 结构自建，可正常读写', async () => {
    const { addStock, getWatchlist, initDatabase } = await import('../../electron/database');

    await initDatabase();

    expect(getWatchlist()).toEqual([]);

    const filePath = join(tempHome, '.stockanalyzer', 'stockanalyzer.db');
    expect(existsSync(filePath)).toBe(true);
    expect(await readUserVersion(filePath)).toBe(1);

    addStock({ stockCode: '600519', stockName: '贵州茅台', buyThreshold: 10, sellThreshold: 20 });
    expect(getWatchlist()).toHaveLength(1);
  });

  it('存量库首次启动写入基线版本并生成迁移备份', async () => {
    const filePath = await createLegacyFile();
    const { initDatabase } = await import('../../electron/database');

    await initDatabase();

    expect(await readUserVersion(filePath)).toBe(1);

    const backups = readdirSync(join(tempHome, '.stockanalyzer')).filter(name =>
      name.startsWith('stockanalyzer.db.bak-')
    );
    expect(backups).toHaveLength(1);
  });

  it('已是最新版本时二次启动不重复落盘', async () => {
    const { initDatabase } = await import('../../electron/database');
    await initDatabase();

    const filePath = join(tempHome, '.stockanalyzer', 'stockanalyzer.db');
    const firstBuffer = readFileSync(filePath);

    vi.resetModules();
    const second = await import('../../electron/database');
    await second.initDatabase();

    expect(readFileSync(filePath).equals(firstBuffer)).toBe(true);
  });
});
