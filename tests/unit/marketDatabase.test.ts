import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({ home: '' }));

vi.mock('electron', () => ({
  app: {
    getPath: () => mockState.home,
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

import {
  closeMarketDatabase,
  exportMarketSnapshot,
  getMarketDatabasePath,
  getMarketMeta,
  initMarketDatabase,
  openMarketDatabase,
  queryMarketRows,
  queryMarketValue,
  setMarketMeta,
} from '../../electron/marketDatabase';
import { replaceTradingCalendar, saveSecurities } from '../../electron/services/marketRepository';

let tempHome = '';

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'stockanalyzer-market-'));
  mockState.home = tempHome;
  vi.resetModules();
});

afterEach(() => {
  closeMarketDatabase();
  vi.resetModules();
  rmSync(tempHome, { recursive: true, force: true });
});

describe('行情库初始化', () => {
  it('新库创建全部表，user_version = 1，且不生成迁移前整库备份', async () => {
    await initMarketDatabase();

    const dbPath = getMarketDatabasePath();
    expect(existsSync(dbPath)).toBe(true);

    const db = openMarketDatabase(':memory:', false);
    // 结构断言在独立内存库上做，避免影响全局连接
    db.close();

    const tables = queryMarketRows(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).map(row => String(row[0]));

    expect(tables).toEqual([
      'adjust_factors',
      'data_quality_issues',
      'kline_daily_raw',
      'kline_monthly_raw',
      'kline_weekly_raw',
      'meta',
      'securities',
      'sync_state',
      'trading_calendar',
    ]);

    const version = queryMarketValue<number>('PRAGMA user_version');
    expect(Number(version)).toBe(1);

    // 行情库不做迁移前整库备份
    const backups = readdirSync(join(tempHome, '.stockanalyzer')).filter(name =>
      name.startsWith('market_data.db.bak-')
    );
    expect(backups).toHaveLength(0);
  });

  it('WAL 与 journal_size_limit 已配置', async () => {
    await initMarketDatabase();

    const journalMode = queryMarketRows('PRAGMA journal_mode').map(row => String(row[0]));
    expect(journalMode[0].toLowerCase()).toBe('wal');

    const journalSizeLimit = queryMarketValue<number>('PRAGMA journal_size_limit');
    expect(Number(journalSizeLimit)).toBe(64 * 1024 * 1024);
  });

  it('二次初始化不重复迁移', async () => {
    await initMarketDatabase();
    closeMarketDatabase();
    await initMarketDatabase();

    expect(Number(queryMarketValue<number>('PRAGMA user_version'))).toBe(1);
  });
});

describe('轻量快照导出', () => {
  it('导出 meta / securities / sync_state / adjust_factors，并只保留最近 5 份', () => {
    const dbPath = join(tempHome, '.stockanalyzer', 'market_data.db');
    const db = openMarketDatabase(':memory:', true);

    saveSecurities(
      db,
      [
        {
          code: '600519',
          exchange: 'SH',
          name: '贵州茅台',
          listDate: '2001-08-27',
          delistDate: null,
          isActive: true,
          codeSource: 'manual',
          fetchedAt: 1,
        },
      ],
      1
    );
    replaceTradingCalendar(db, ['2026-11-24'], 'test', 1);
    setMarketMeta({ sync_control_state: 'completed' }, db);

    const first = exportMarketSnapshot(db, dbPath);
    const snapshot = JSON.parse(readFileSync(first, 'utf-8')) as Record<string, unknown>;
    expect(Object.keys(snapshot)).toEqual(
      expect.arrayContaining(['meta', 'securities', 'syncState', 'adjustFactors'])
    );
    expect(getMarketMeta('last_snapshot_at', db)).not.toBeNull();

    // 轻量模式（同步结束时的自动快照）不导出全量因子行，只保留因子行数
    const lightFile = exportMarketSnapshot(db, dbPath, { includeFactorRows: false });
    const light = JSON.parse(readFileSync(lightFile, 'utf-8')) as {
      adjustFactors: unknown[];
      adjustFactorRows: number;
    };
    expect(light.adjustFactors).toEqual([]);
    expect(light.adjustFactorRows).toBe(0);

    for (let index = 0; index < 6; index += 1) {
      exportMarketSnapshot(db, dbPath);
    }

    const files = readdirSync(join(tempHome, '.stockanalyzer', 'market-snapshots')).filter(name =>
      name.endsWith('.json')
    );
    expect(files).toHaveLength(5);

    db.close();
  });
});
