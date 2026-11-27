import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
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

import { openMarketDatabase, type MarketDatabase } from '../../electron/marketDatabase';
import { saveSecurities, searchSecurities, type MarketSecurityInput } from '../../electron/services/marketRepository';

let db: MarketDatabase;

function security(
  code: string,
  exchange: MarketSecurityInput['exchange'],
  name: string,
  isActive = true,
  delistDate: string | null = null
): MarketSecurityInput {
  return {
    code,
    exchange,
    name,
    listDate: '2000-01-01',
    delistDate,
    isActive,
    codeSource: 'sse_name',
    fetchedAt: 1000,
  };
}

beforeEach(() => {
  db = openMarketDatabase(':memory:', true);
  saveSecurities(db, [
    security('000001', 'SZ', '平安银行'),
    security('000002', 'SZ', '万科A'),
    security('600000', 'SH', '浦发银行'),
    security('600519', 'SH', '贵州茅台'),
    security('920000', 'BJ', '北交所测试'),
    security('600001', 'SH', '已退市测试', false, '2020-01-01'),
  ]);
});

afterEach(() => {
  db.close();
});

describe('证券名录分页查询', () => {
  it('默认查询第一页在市证券，按代码升序，total 为在市总数', () => {
    const result = searchSecurities(db);

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.total).toBe(5);
    expect(result.items.map((item) => item.code)).toEqual([
      '000001',
      '000002',
      '600000',
      '600519',
      '920000',
    ]);
    expect(result.items[0]).not.toHaveProperty('close');
  });

  it('连续分页不重复不遗漏', () => {
    const first = searchSecurities(db, { page: 1, pageSize: 2 });
    const second = searchSecurities(db, { page: 2, pageSize: 2 });
    const third = searchSecurities(db, { page: 3, pageSize: 2 });

    expect(first.total).toBe(5);
    expect([...first.items, ...second.items, ...third.items].map((item) => item.code)).toEqual([
      '000001',
      '000002',
      '600000',
      '600519',
      '920000',
    ]);
  });

  it('页码超出总页数时返回空列表但保留 total', () => {
    const result = searchSecurities(db, { page: 99, pageSize: 10 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(5);
  });

  it('按代码片段匹配', () => {
    const result = searchSecurities(db, { keyword: '6005' });

    expect(result.items.map((item) => item.code)).toEqual(['600519']);
    expect(result.total).toBe(1);
  });

  it('按名称片段匹配', () => {
    const result = searchSecurities(db, { keyword: '银行' });

    expect(result.items.map((item) => item.code)).toEqual(['000001', '600000']);
    expect(result.total).toBe(2);
  });

  it('纯空白关键字不过滤', () => {
    const result = searchSecurities(db, { keyword: '   ' });

    expect(result.total).toBe(5);
    expect(result.items).toHaveLength(5);
  });

  it('无匹配关键字返回空列表与零总数', () => {
    const result = searchSecurities(db, { keyword: '不存在' });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('交易所与在市状态组合筛选', () => {
    const szActive = searchSecurities(db, { exchange: 'SZ', status: 'active' });
    expect(szActive.items.map((item) => item.code)).toEqual(['000001', '000002']);
    expect(szActive.items.every((item) => item.isActive)).toBe(true);

    const all = searchSecurities(db, { status: 'all' });
    expect(all.total).toBe(6);
    expect(all.items.find((item) => item.code === '600001')).toMatchObject({
      isActive: false,
      delistDate: '2020-01-01',
    });
  });

  it('多个筛选条件组合无结果', () => {
    const result = searchSecurities(db, {
      exchange: 'BJ',
      status: 'active',
      keyword: '不存在',
    });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('total 与筛选条件一致', () => {
    const result = searchSecurities(db, { exchange: 'SH', status: 'all', pageSize: 1 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
  });
});
