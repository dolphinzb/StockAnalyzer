import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// initDatabase 内部会重新加载 sql.js wasm，全量并行跑测试时耗时可能超过默认 5s 超时
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

// 用可变的临时 home 目录隔离主进程依赖，使按真实文件路径走 initDatabase
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

import { runMigrations } from '../../electron/migrations';

let tempHome = '';

/**
 * 在临时 home 下构造 V1 结构的数据库文件
 * 数据顺序（sort_order 升序）：监控中 → 未监控较新 → 未监控较早
 */
async function createDatabase(): Promise<void> {
  const SQL = await initSqlJs();
  const database = new SQL.Database();
  runMigrations(database, { isNewDatabase: true });

  const insert = `INSERT INTO watchlist_stocks
    (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
    VALUES (?, ?, 10, 20, ?, '2026-01-01T00:00:00.000Z', ?, ?)`;
  database.run(insert, ['600519', '监控中', 1, '2026-01-01T00:00:00.000Z', 0]);
  database.run(insert, ['000858', '未监控较新', 0, '2026-01-03T00:00:00.000Z', 1]);
  database.run(insert, ['000001', '未监控较早', 0, '2026-01-02T00:00:00.000Z', 2]);

  const dbDir = join(tempHome, '.stockanalyzer');
  mkdirSync(dbDir, { recursive: true });
  writeFileSync(join(dbDir, 'stockanalyzer.db'), Buffer.from(database.export()));
  database.close();
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'stockanalyzer-sort-'));
  mockState.home = tempHome;
});

afterEach(() => {
  vi.resetModules();
  rmSync(tempHome, { recursive: true, force: true });
});

describe('自选股顺序字段与持久化', () => {
  it('按 sort_order 升序返回', async () => {
    await createDatabase();
    vi.resetModules();
    const { getWatchlist, initDatabase } = await import('../../electron/database');

    await initDatabase();

    const stocks = getWatchlist();
    expect(stocks.map(stock => stock.stockCode)).toEqual(['600519', '000858', '000001']);
    expect(stocks.map(stock => stock.sortOrder)).toEqual([0, 1, 2]);
  });

  it('重排后重启仍保留自定义顺序', async () => {
    await createDatabase();
    vi.resetModules();
    const first = await import('../../electron/database');
    await first.initDatabase();

    const ids = first.getWatchlist().map(stock => stock.id);
    first.reorderWatchlist([...ids].reverse());
    first.closeDatabase();

    vi.resetModules();
    const second = await import('../../electron/database');
    await second.initDatabase();

    expect(second.getWatchlist().map(stock => stock.stockCode)).toEqual([
      '000001',
      '000858',
      '600519',
    ]);
  });

  it('重排后按 sort_order 升序返回，且不改写 updated_at', async () => {
    await createDatabase();
    vi.resetModules();
    const { getWatchlist, initDatabase, reorderWatchlist } = await import(
      '../../electron/database'
    );
    await initDatabase();

    const before = getWatchlist();
    const reordered = reorderWatchlist([
      before[2].id,
      before[0].id,
      before[1].id,
    ]);

    expect(reordered.map(stock => stock.stockCode)).toEqual(['000001', '600519', '000858']);
    expect(reordered.map(stock => stock.sortOrder)).toEqual([0, 1, 2]);
    // 重排不改写 updated_at，顺序与入参一致
    expect(reordered.map(stock => stock.updatedAt)).toEqual([
      before[2].updatedAt,
      before[0].updatedAt,
      before[1].updatedAt,
    ]);
  });

  it('新增股票追加到末尾', async () => {
    await createDatabase();
    vi.resetModules();
    const { addStock, getWatchlist, initDatabase } = await import('../../electron/database');
    await initDatabase();

    addStock({ stockCode: '300750', stockName: '宁德时代', buyThreshold: 10, sellThreshold: 20 });

    const stocks = getWatchlist();
    const added = stocks[stocks.length - 1];
    expect(added.stockCode).toBe('300750');
    expect(added.sortOrder).toBe(3);
  });

  it('删除中间股票后其余相对顺序不变', async () => {
    await createDatabase();
    vi.resetModules();
    const { deleteStock, getWatchlist, initDatabase } = await import('../../electron/database');
    await initDatabase();

    const before = getWatchlist();
    deleteStock(before[1].id);

    const after = getWatchlist();
    expect(after.map(stock => stock.stockCode)).toEqual(['600519', '000001']);
    expect(after.map(stock => stock.sortOrder)).toEqual([0, 2]);
  });
});
