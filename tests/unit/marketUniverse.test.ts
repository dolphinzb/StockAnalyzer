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

import {
  getMarketMeta,
  openMarketDatabase,
  queryMarketRows,
  type MarketDatabase,
} from '../../electron/marketDatabase';
import {
  inferExchange,
  isAShareCode,
  parseBseRows,
  parseSdkCodes,
  parseSseRows,
  parseSzseRows,
  stripHtml,
  syncTradingCalendar,
} from '../../electron/services/marketUniverseService';
import {
  listTradingCalendar,
  mergeSecurityBatches,
  saveSecurities,
  type MarketSecurityBatch,
  type MarketSecurityRow,
} from '../../electron/services/marketRepository';
import { latestTradingDay, nextTradingDay } from '../../electron/services/marketSyncPolicy';

let db: MarketDatabase;

beforeEach(() => {
  db = openMarketDatabase(':memory:', true);
});

afterEach(() => {
  db.close();
});

describe('代码识别与 B 股排除', () => {
  it('沪深北 A 股代码映射到正确交易所', () => {
    expect(inferExchange('600519')).toBe('SH');
    expect(inferExchange('688981')).toBe('SH');
    expect(inferExchange('000001')).toBe('SZ');
    expect(inferExchange('002594')).toBe('SZ');
    expect(inferExchange('300750')).toBe('SZ');
    expect(inferExchange('920000')).toBe('BJ');
    expect(inferExchange('430047')).toBe('BJ');
    expect(inferExchange('873169')).toBe('BJ');
  });

  it('B 股、基金与非法代码被排除', () => {
    expect(inferExchange('900901')).toBeNull();
    expect(inferExchange('200011')).toBeNull();
    expect(isAShareCode('510050')).toBe(false);
    expect(isAShareCode('159915')).toBe(false);
    expect(isAShareCode('60051')).toBe(false);
  });
});

describe('交易所名录字段映射', () => {
  it('上交所：A_STOCK_CODE / COMPANY_ABBR / LIST_DATE', () => {
    const rows = parseSseRows(
      [{ A_STOCK_CODE: '600519', COMPANY_ABBR: '贵州茅台', LIST_DATE: '2001-08-27' }],
      false
    );
    expect(rows).toEqual([
      {
        code: '600519',
        exchange: 'SH',
        name: '贵州茅台',
        listDate: '2001-08-27',
        delistDate: null,
        isActive: true,
        codeSource: 'sse_name',
      },
    ]);
  });

  it('深交所：agdm / agjc（剥离 HTML）/ agssrq', () => {
    const rows = parseSzseRows(
      [
        {
          agdm: '000001',
          agjc: '<a href="/x">平安银行</a>',
          agssrq: '1991-04-03',
        },
      ],
      false
    );
    expect(rows[0].code).toBe('000001');
    expect(rows[0].exchange).toBe('SZ');
    expect(rows[0].name).toBe('平安银行');
    expect(rows[0].listDate).toBe('1991-04-03');
    expect(rows[0].codeSource).toBe('szse_name');
  });

  it('深交所退市：zqdm / zqjc / ssrq / zzrq', () => {
    const rows = parseSzseRows(
      [{ zqdm: '000003', zqjc: 'PT金田A', ssrq: '1991-07-03', zzrq: '2002-06-14' }],
      true
    );
    expect(rows[0].isActive).toBe(false);
    expect(rows[0].delistDate).toBe('2002-06-14');
    expect(rows[0].codeSource).toBe('szse_delist');
  });

  it('北交所：中文键名映射', () => {
    const rows = parseBseRows(
      [{ 证券代码: '920000', 证券简称: '安徽凤凰', 上市日期: '2020-07-27' }],
      false
    );
    expect(rows[0].exchange).toBe('BJ');
    expect(rows[0].name).toBe('安徽凤凰');
    expect(rows[0].listDate).toBe('2020-07-27');
    expect(rows[0].codeSource).toBe('bse_name');
  });

  it('HTML 剥离与空白压缩', () => {
    expect(stripHtml('<a href="#">  贵州 &nbsp;茅台 </a>')).toBe('贵州 茅台');
  });

  it('SDK 代码列表识别带前缀与纯数字', () => {
    const rows = parseSdkCodes(['sh600519', 'sz000001', 'bj920000', '900901']);
    expect(rows.map(row => row.code)).toEqual(['600519', '000001', '920000']);
    expect(rows.every(row => row.codeSource === 'sdk_active')).toBe(true);
  });
});

describe('证券池合并优先级', () => {
  const empty = new Map<string, MarketSecurityRow>();

  function batch(
    codeSource: MarketSecurityBatch['codeSource'],
    rows: MarketSecurityBatch['rows']
  ): MarketSecurityBatch {
    return { codeSource, rows };
  }

  it('manual > 退市清单 > 交易所名录 > sdk', () => {
    const merged = mergeSecurityBatches(
      empty,
      [
        batch('sdk_active', [
          { code: '600519', exchange: 'SH', name: '600519', listDate: null, delistDate: null, isActive: true },
        ]),
        batch('sse_name', [
          { code: '600519', exchange: 'SH', name: '贵州茅台', listDate: '2001-08-27', delistDate: null, isActive: true },
        ]),
        batch('manual', [
          { code: '600519', exchange: 'SH', name: '手工名称', listDate: null, delistDate: null, isActive: true },
        ]),
      ],
      100
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('手工名称');
    // 低优先级来源不能清空已有日期
    expect(merged[0].listDate).toBe('2001-08-27');
    expect(merged[0].codeSource).toBe('manual');
  });

  it('退市来源不覆盖更高优先级的人工记录', () => {
    const existing = new Map<string, MarketSecurityRow>([
      [
        '600001',
        {
          code: '600001',
          exchange: 'SH',
          name: '邯郸钢铁',
          listDate: '1998-01-22',
          delistDate: '2009-12-29',
          isActive: false,
          codeSource: 'manual',
        },
      ],
    ]);

    const merged = mergeSecurityBatches(
      existing,
      [
        batch('sse_delist', [
          { code: '600001', exchange: 'SH', name: '旧简称', listDate: null, delistDate: null, isActive: false },
        ]),
      ],
      200
    );

    expect(merged[0].name).toBe('邯郸钢铁');
    expect(merged[0].delistDate).toBe('2009-12-29');
  });

  it('在市名录与退市清单合并后同时存在', () => {
    const merged = mergeSecurityBatches(
      empty,
      [
        batch('sse_name', [
          { code: '600519', exchange: 'SH', name: '贵州茅台', listDate: '2001-08-27', delistDate: null, isActive: true },
        ]),
        batch('sse_delist', [
          { code: '600001', exchange: 'SH', name: '邯郸钢铁', listDate: null, delistDate: null, isActive: false },
        ]),
      ],
      300
    );

    expect(merged).toHaveLength(2);
    const delisted = merged.find(row => row.code === '600001');
    expect(delisted?.isActive).toBe(false);
    expect(delisted?.codeSource).toBe('sse_delist');
  });

  it('保存后按交易所与在市状态可查', () => {
    const merged = mergeSecurityBatches(
      empty,
      [
        batch('sse_name', [
          { code: '600519', exchange: 'SH', name: '贵州茅台', listDate: '2001-08-27', delistDate: null, isActive: true },
        ]),
      ],
      400
    );
    saveSecurities(db, merged, 400);

    const rows = queryMarketRows("SELECT code, is_active FROM securities WHERE exchange = 'SH'", [], db);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0][1])).toBe(1);
  });
});

describe('交易日历', () => {
  it('整表替换：新增日期出现、删除日期消失', async () => {
    const deps = {
      fetchText: async () => '',
      sdk: {
        getHistoryKline: async () => [],
        getAShareCodeList: async () => [],
        getTradingCalendar: async () => ['2026-11-20', '2026-11-23', '2026-11-24'],
      },
      now: () => 1000,
    };

    await syncTradingCalendar(db, deps);
    expect(listTradingCalendar(db)).toEqual(['2026-11-20', '2026-11-23', '2026-11-24']);
    expect(getMarketMeta('calendar_source', db)).toBe('sse_szse_bj_calendar');

    const second = {
      ...deps,
      sdk: {
        ...deps.sdk,
        getTradingCalendar: async () => ['2026-11-24', '2026-11-25'],
      },
    };
    await syncTradingCalendar(db, second);
    expect(listTradingCalendar(db)).toEqual(['2026-11-24', '2026-11-25']);
  });

  it('未来已公布交易日入库，但最新交易日只取不晚于今天', async () => {
    const deps = {
      fetchText: async () => '',
      sdk: {
        getHistoryKline: async () => [],
        getAShareCodeList: async () => [],
        getTradingCalendar: async () => ['2026-11-24', '2026-12-31'],
      },
      now: () => 1000,
    };
    await syncTradingCalendar(db, deps);

    const calendar = listTradingCalendar(db);
    expect(calendar).toContain('2026-12-31');
    expect(latestTradingDay(calendar, '2026-11-25')).toBe('2026-11-24');
    expect(nextTradingDay(calendar, '2026-11-24')).toBe('2026-12-31');
  });

  it('空日历拒绝整表替换，避免清空已有数据', async () => {
    await syncTradingCalendar(db, {
      fetchText: async () => '',
      sdk: {
        getHistoryKline: async () => [],
        getAShareCodeList: async () => [],
        getTradingCalendar: async () => ['2026-11-24'],
      },
    });

    await expect(
      syncTradingCalendar(db, {
        fetchText: async () => '',
        sdk: {
          getHistoryKline: async () => [],
          getAShareCodeList: async () => [],
          getTradingCalendar: async () => [],
        },
      })
    ).rejects.toThrow(/交易日历为空/);

    expect(listTradingCalendar(db)).toEqual(['2026-11-24']);
  });
});
