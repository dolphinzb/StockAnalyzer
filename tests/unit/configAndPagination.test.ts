import { readFileSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteDatabase, type DatabaseLike as Database } from '../../electron/sqliteEngine';
import { getQuoteEndpoint, type AppConfig } from '../../shared/types';

vi.mock('electron', () => ({
  app: { getPath: () => '', getAppPath: () => '' },
  BrowserWindow: { getAllWindows: () => [] },
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
  DEFAULT_CONFIG,
  getTradeRecords,
  mergeWithDefaultConfig,
  normalizeApiConfig,
  saveConfig,
} from '../../electron/database';

let database: Database;

function insertTrade(id: number, date: string, price: number): void {
  database.run(
    `INSERT INTO trade_record
     (id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price)
     VALUES (?, ?, ?, ?, 'BUY', ?, 100, 100, ?)`,
    [id, '000001', '测试股票', date, price, price]
  );
}

function countRows(table: string): number {
  const result = database.exec(`SELECT COUNT(*) FROM ${table}`);
  return Number(result[0].values[0][0]);
}

beforeEach(async () => {
  database = new SqliteDatabase(':memory:');
  runMigrations(database, { isNewDatabase: true });
});

afterEach(() => {
  database.close();
});

describe('配置加载与默认值合并', () => {
  it('完整配置原样保留', () => {
    expect(mergeWithDefaultConfig(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });

  it('缺字段、类型错误与非法枚举都回落到默认值', () => {
    const merged = mergeWithDefaultConfig({
      trading: { morningStart: '9:30' },
      polling: { interval: 'fast' },
      api: { provider: 'unknown', url: '' },
    });
    expect(merged.trading.morningStart).toBe(DEFAULT_CONFIG.trading.morningStart);
    expect(merged.polling.interval).toBe(DEFAULT_CONFIG.polling.interval);
    expect(merged.api.provider).toBe(DEFAULT_CONFIG.api.provider);
    expect(merged.api.url).toBe(DEFAULT_CONFIG.api.url);
  });

  it('非对象或 null 坏值返回完整默认配置', () => {
    expect(mergeWithDefaultConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(mergeWithDefaultConfig('broken')).toEqual(DEFAULT_CONFIG);
    expect(mergeWithDefaultConfig({})).toEqual(DEFAULT_CONFIG);
  });

  it('东财旧单只端点被归一化为批量端点', () => {
    const merged = mergeWithDefaultConfig({
      api: { provider: 'eastmoney', url: 'https://push2.eastmoney.com/api/qt/stock/get' },
    });

    expect(merged.api.provider).toBe('eastmoney');
    expect(merged.api.url).toBe('https://push2.eastmoney.com/api/qt/ulist.np/get');
  });

  it('配置中的自定义地址被 provider 端点覆盖', () => {
    const merged = mergeWithDefaultConfig({
      api: { provider: 'tencent', url: 'https://custom.example.com/quote' },
    });

    expect(merged.api.url).toBe('https://web.sqt.gtimg.cn/q=');
  });

  it('normalizeApiConfig 按 provider 派生端点，非法值回退新浪', () => {
    expect(normalizeApiConfig('eastmoney')).toEqual({
      provider: 'eastmoney',
      url: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
    });
    expect(normalizeApiConfig('tencent').url).toBe('https://web.sqt.gtimg.cn/q=');
    expect(normalizeApiConfig('binance')).toEqual({
      provider: 'sina',
      url: getQuoteEndpoint('sina'),
    });
    expect(normalizeApiConfig(undefined)).toEqual({
      provider: 'sina',
      url: getQuoteEndpoint('sina'),
    });
  });

  it('SQL 初始化脚本中的新浪端点与共享元数据一致', () => {
    const sql = readFileSync(new URL('../../sql/migrations/001_init.sql', import.meta.url), 'utf8');
    const sinaEndpoint = getQuoteEndpoint('sina');

    expect(DEFAULT_CONFIG.api.url).toBe(sinaEndpoint);
    expect(sql).toContain(`"url":"${sinaEndpoint}"`);
  });

  it('saveConfig 落盘前按 provider 覆写自定义或空 api.url', () => {
    const submit = (url: string): AppConfig => ({
      ...DEFAULT_CONFIG,
      api: { provider: 'tencent', url },
    });
    const readStored = (): AppConfig => {
      const result = database.exec("SELECT value FROM config WHERE key = 'app_config'");
      return JSON.parse(String(result[0].values[0][0])) as AppConfig;
    };

    // 自定义地址不生效
    expect(saveConfig(submit('https://custom.example.com/quote'), database)).toBe(true);
    expect(readStored().api).toEqual({ provider: 'tencent', url: getQuoteEndpoint('tencent') });

    // 空地址同样被 provider 端点覆盖
    expect(saveConfig(submit(''), database)).toBe(true);
    expect(readStored().api).toEqual({ provider: 'tencent', url: getQuoteEndpoint('tencent') });
  });
});

describe('交易记录分页参数安全', () => {
  beforeEach(() => {
    for (let i = 1; i <= 5; i += 1) {
      insertTrade(i, `2026-01-0${i}`, 10 + i);
    }
  });

  it('正常分页使用占位符并返回对应页', () => {
    const first = getTradeRecords('000001', 1, 2, database);
    expect(first.total).toBe(5);
    expect(first.records).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const second = getTradeRecords('000001', 2, 2, database);
    expect(second.records).toHaveLength(2);
    expect(second.records[0].id).not.toBe(first.records[0].id);
  });

  it('负数 pageSize 回落到默认 20，且不报 SQL 错误', () => {
    const result = getTradeRecords('000001', 1, -1, database);
    expect(result.records).toHaveLength(5);
    expect(result.hasMore).toBe(false);
  });

  it('超大 pageSize 被限制到 100，不产生超大结果集', () => {
    const result = getTradeRecords('000001', 1, 100000, database);
    expect(result.records).toHaveLength(5);
  });

  it('注入型字符串分页参数不破坏 SQL，表结构保持完整', () => {
    const result = getTradeRecords('000001', 1, '2; DROP TABLE trade_record' as never, database);
    expect(result.records).toHaveLength(5);
    expect(countRows('trade_record')).toBe(5);
  });
});
