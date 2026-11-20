import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SqliteDatabase, type DatabaseLike as Database } from '../../electron/sqliteEngine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// sql.js 首次加载 wasm 较慢，放宽超时
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

import { runMigrations } from '../../electron/migrations';
import {
  backupTo,
  closeDatabase,
  execute,
  getDb,
  initDatabase,
  queryRows,
  queryValue,
  transaction
} from '../../electron/database';

let tempHome = '';
let database: Database;

beforeEach(async () => {
  tempHome = mkdtempSync(join(tmpdir(), 'stockanalyzer-primitives-'));
  mockState.home = tempHome;

  database = new SqliteDatabase(':memory:');
  runMigrations(database, { isNewDatabase: true });
});

afterEach(() => {
  database.close();
  closeDatabase();
  rmSync(tempHome, { recursive: true, force: true });
});

describe('queryRows / queryValue（读路径）', () => {
  it('返回按 SELECT 列顺序排列的行数组', () => {
    execute(
      `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
       VALUES ('000001', '平安银行', 10, 20, 0, 'now', 'now', 0)`,
      [],
      database
    );

    const rows = queryRows(
      'SELECT stock_code, stock_name, sort_order FROM watchlist_stocks ORDER BY sort_order',
      [],
      database
    );

    expect(rows).toEqual([['000001', '平安银行', 0]]);
  });

  it('无结果时返回空数组', () => {
    expect(queryRows('SELECT stock_code FROM watchlist_stocks', [], database)).toEqual([]);
  });

  it('queryValue 返回首行首列，无结果时为 null', () => {
    execute(
      `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
       VALUES ('600519', '贵州茅台', 10, 20, 0, 'now', 'now', 0)`,
      [],
      database
    );

    expect(queryValue<number>('SELECT COUNT(*) FROM watchlist_stocks', [], database)).toBe(1);
    expect(queryValue<number>('SELECT COUNT(*) FROM watchlist_stocks WHERE stock_code = ?', ['999999'], database)).toBe(0);
    expect(queryValue<number>('SELECT id FROM watchlist_stocks WHERE stock_code = ?', ['999999'], database)).toBeNull();
  });

  it('绑定参数按占位符顺序生效', () => {
    execute(
      `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      ['510050', '上证50ETF', 1, 2, 'now', 'now', 0],
      database
    );

    expect(queryValue<string>('SELECT stock_name FROM watchlist_stocks WHERE stock_code = ?', ['510050'], database))
      .toBe('上证50ETF');
  });
});

describe('execute（写路径）', () => {
  it('返回受影响行数', () => {
    const insertSql = `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`;

    expect(execute(insertSql, ['000001', '平安银行', 10, 20, 'now', 'now', 0], database)).toBe(1);
    expect(execute('UPDATE watchlist_stocks SET buy_threshold = ? WHERE stock_code = ?', [11, '000001'], database)).toBe(1);
    expect(execute('DELETE FROM watchlist_stocks WHERE stock_code = ?', ['000001'], database)).toBe(1);
    expect(execute('DELETE FROM watchlist_stocks WHERE stock_code = ?', ['000001'], database)).toBe(0);
  });
});

describe('transaction（事务）', () => {
  it('成功时提交全部写入', () => {
    transaction(() => {
      execute(
        `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
         VALUES ('000001', '平安银行', 1, 2, 0, 'now', 'now', 0)`,
        [],
        database
      );
      execute(
        `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
         VALUES ('600519', '贵州茅台', 1, 2, 0, 'now', 'now', 1)`,
        [],
        database
      );
    }, database);

    expect(queryValue<number>('SELECT COUNT(*) FROM watchlist_stocks', [], database)).toBe(2);
  });

  it('抛错时整体回滚并向上抛出', () => {
    expect(() =>
      transaction(() => {
        execute(
          `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
           VALUES ('000001', '平安银行', 1, 2, 0, 'now', 'now', 0)`,
          [],
          database
        );
        throw new Error('BOOM');
      }, database)
    ).toThrow('BOOM');

    expect(queryValue<number>('SELECT COUNT(*) FROM watchlist_stocks', [], database)).toBe(0);
  });

  it('返回事务体的结果', () => {
    expect(transaction(() => 42, database)).toBe(42);
  });

  it('拒绝嵌套事务', () => {
    expect(() =>
      transaction(() => {
        transaction(() => undefined, database);
      }, database)
    ).toThrow('NESTED_TRANSACTION');
  });
});

describe('backupTo（一致性备份）', () => {
  it('生成的备份可被重新加载且包含已提交数据', async () => {
    await initDatabase();
    const live = getDb();
    execute(
      `INSERT INTO watchlist_stocks (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
       VALUES ('000001', '平安银行', 1, 2, 0, 'now', 'now', 0)`,
      [],
      live
    );

    const backupPath = join(tempHome, 'backup.db');
    await backupTo(backupPath);

    expect(existsSync(backupPath)).toBe(true);

    const restored = new SqliteDatabase(backupPath);
    const result = restored.exec("SELECT stock_code FROM watchlist_stocks WHERE stock_code = '000001'");
    expect(result[0].values).toEqual([['000001']]);
    restored.close();
  });
});
