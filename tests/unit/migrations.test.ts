import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import initSqlJs, { type Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron-log', () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import {
  getPendingMigrations,
  getUserVersion,
  listMigrations,
  runMigrations,
  setUserVersion,
} from '../../electron/migrations';

let database: Database;
let tempDirs: string[] = [];

/**
 * 构造临时迁移目录
 * @param files 文件名 → SQL 内容
 * @returns 目录绝对路径
 */
function makeMigrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'stockanalyzer-migrations-'));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql, 'utf-8');
  }
  return dir;
}

/**
 * 读取库中全部业务表名
 */
function tableNames(db: Database): string[] {
  const result = db.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return result.length > 0 ? result[0].values.map(row => String(row[0])) : [];
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  database = new SQL.Database();
  tempDirs = [];
});

afterEach(() => {
  database.close();
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('迁移执行器', () => {
  it('新库执行全部迁移并把 user_version 置为最新版本', () => {
    const result = runMigrations(database, { isNewDatabase: true });

    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(1);
    expect(result.applied.map(migration => migration.version)).toEqual([1]);
    expect(result.baselineApplied).toBe(false);
    expect(getUserVersion(database)).toBe(1);
    expect(tableNames(database)).toEqual([
      'config',
      'kline_daily',
      'kline_monthly',
      'kline_weekly',
      'trade_record',
      'transfer_records',
      'watchlist_stocks',
    ]);
  });

  it('新库建库后写入默认配置', () => {
    runMigrations(database, { isNewDatabase: true });

    const result = database.exec("SELECT value FROM config WHERE key = 'app_config'");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].values.length).toBe(1);
  });

  it('存量库无版本记录时只做基线标记，不执行首版迁移', () => {
    // 先造一个「当前结构 + 有数据」的库，再把版本记录抹掉，模拟引入迁移框架前的存量库
    runMigrations(database, { isNewDatabase: true });
    database.run(
      `INSERT INTO watchlist_stocks
       (stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at, sort_order)
       VALUES ('600519', '贵州茅台', 10, 20, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0)`
    );
    setUserVersion(database, 0);
    const tablesBefore = tableNames(database);

    const result = runMigrations(database, { isNewDatabase: false });

    expect(result.baselineApplied).toBe(true);
    expect(result.applied).toEqual([]);
    expect(result.fromVersion).toBe(1);
    expect(getUserVersion(database)).toBe(1);
    expect(tableNames(database)).toEqual(tablesBefore);

    const rows = database.exec('SELECT COUNT(*) FROM watchlist_stocks');
    expect(Number(rows[0].values[0][0])).toBe(1);
  });

  it('空库按新库处理，执行首版迁移', () => {
    const result = runMigrations(database, { isNewDatabase: false });

    expect(result.applied.map(migration => migration.version)).toEqual([1]);
    expect(result.baselineApplied).toBe(false);
    expect(getUserVersion(database)).toBe(1);
  });

  it('已是最新版本时不产生任何变更', () => {
    runMigrations(database, { isNewDatabase: true });

    const result = runMigrations(database, { isNewDatabase: false });

    expect(result.applied).toEqual([]);
    expect(result.baselineApplied).toBe(false);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(1);
  });

  it('基线场景下没有待执行迁移', () => {
    runMigrations(database, { isNewDatabase: true });
    setUserVersion(database, 0);

    expect(getPendingMigrations(database, { isNewDatabase: false })).toEqual([]);
  });

  it('按版本号升序执行跨版本迁移', () => {
    const dir = makeMigrationsDir({
      '001_first.sql': 'CREATE TABLE t1 (id INTEGER PRIMARY KEY);',
      '002_second.sql': 'CREATE TABLE t2 (id INTEGER PRIMARY KEY);',
    });

    const result = runMigrations(database, { isNewDatabase: true, dir });

    expect(result.applied.map(migration => migration.version)).toEqual([1, 2]);
    expect(getUserVersion(database)).toBe(2);
    expect(tableNames(database)).toEqual(['t1', 't2']);
  });

  it('迁移失败时整体回滚，不留下半成品', () => {
    const dir = makeMigrationsDir({
      '001_first.sql': 'CREATE TABLE t1 (id INTEGER PRIMARY KEY);',
      '002_broken.sql':
        'CREATE TABLE t2 (id INTEGER PRIMARY KEY); INSERT INTO t_missing VALUES (1);',
    });

    expect(() => runMigrations(database, { isNewDatabase: true, dir })).toThrow();

    expect(getUserVersion(database)).toBe(0);
    expect(tableNames(database)).toEqual([]);
  });

  it('迁移文件名不合规时报错', () => {
    const dir = makeMigrationsDir({ 'init.sql': 'CREATE TABLE t1 (id INTEGER PRIMARY KEY);' });

    expect(() => listMigrations(dir)).toThrow(/命名不合规/);
  });

  it('迁移版本号重复时报错', () => {
    const dir = makeMigrationsDir({
      '001_a.sql': 'CREATE TABLE t1 (id INTEGER PRIMARY KEY);',
      '001_b.sql': 'CREATE TABLE t2 (id INTEGER PRIMARY KEY);',
    });

    expect(() => listMigrations(dir)).toThrow(/版本号重复/);
  });

  it('迁移目录不存在时报错', () => {
    expect(() => listMigrations(join(tmpdir(), 'stockanalyzer-migrations-not-exist'))).toThrow(
      /迁移目录不可读/
    );
  });
});
