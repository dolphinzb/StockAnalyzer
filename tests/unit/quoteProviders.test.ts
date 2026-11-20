import { describe, expect, it } from 'vitest';
import { API_PROVIDERS, getQuoteEndpoint } from '../../shared/types';
import { getProvider } from '../../electron/services/quoteProviders';
import { toPrefixedCode } from '../../electron/services/quoteProviders/code';
import { toSecid } from '../../electron/services/quoteProviders/eastmoney';
import { QuoteProviderError } from '../../electron/services/quoteProviders/types';

/** 用真实抓包样本构造新浪响应（GBK 解码后已是字符串） */
function sinaLine(code: string, body: string): string {
  return `var hq_str_${code}="${body}";`;
}

/** 腾讯字段以 ~ 分隔，段数不固定，这里构造 88 段以贴近实测 */
function tencentLine(
  code: string,
  name: string,
  price: number,
  prevClose: number,
  open: number,
  high: number,
  low: number
): string {
  const parts = new Array<string>(88).fill('');
  parts[0] = '1';
  parts[1] = name;
  parts[2] = code.slice(2);
  parts[3] = String(price);
  parts[4] = String(prevClose);
  parts[5] = String(open);
  parts[33] = String(high);
  parts[34] = String(low);
  return `v_${code}="${parts.join('~')}";`;
}

function eastmoneyPayload(rows: Array<Record<string, unknown>>): string {
  return JSON.stringify({ rc: 0, data: { total: rows.length, diff: rows } });
}

describe('新浪适配器', () => {
  const provider = getProvider('sina');

  it('解析名称、现价、今开、昨收、最高、最低', () => {
    const text = sinaLine(
      'sh600519',
      '贵州茅台,1450.890,1460.210,1442.110,1459.000,1423.900,1442.100,1442.920'
    );
    const [snapshot] = provider.parse(text, ['sh600519']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.code).toBe('sh600519');
    expect(snapshot.name).toBe('贵州茅台');
    expect(snapshot.price).toBe(1442.11);
    expect(snapshot.openPrice).toBe(1450.89);
    expect(snapshot.prevClosePrice).toBe(1460.21);
    expect(snapshot.highPrice).toBe(1459);
    expect(snapshot.lowPrice).toBe(1423.9);
  });

  it('支持北交所 bj 前缀并保留原始代码', () => {
    const text = sinaLine('bj920799', '艾融软件,23.380,23.820,24.000,24.710,23.150');
    const [snapshot] = provider.parse(text, ['bj920799']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.code).toBe('bj920799');
    expect(snapshot.name).toBe('艾融软件');
  });

  it('响应中缺失的代码补失败项，返回数组与请求等长', () => {
    const text = sinaLine('sh600519', '贵州茅台,1450.890,1460.210,1442.110,1459.000,1423.900');
    const snapshots = provider.parse(text, ['sh600519', 'sz000001']);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[1].code).toBe('sz000001');
    expect(snapshots[1].success).toBe(false);
    expect(snapshots[1].error).toBeTruthy();
  });

  it('空响应体判为该条失败而不抛整批异常', () => {
    const [snapshot] = provider.parse(sinaLine('sh600000', ''), ['sh600000']);

    expect(snapshot.success).toBe(false);
  });

  it('名称缺失时仍按现价判定成功，名称返回空串', () => {
    const text = sinaLine('sh600519', ',1450.890,1460.210,1442.110,1459.000,1423.900');

    const [snapshot] = provider.parse(text, ['sh600519']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.name).toBe('');
    expect(snapshot.price).toBe(1442.11);
  });
});

describe('东方财富适配器', () => {
  const provider = getProvider('eastmoney');

  it('按 f12 + f13 反查，乱序响应不串位', () => {
    const text = eastmoneyPayload([
      { f12: '920799', f13: 0, f14: '艾融软件', f2: 24, f15: 24.71, f16: 23.15, f17: 23.38, f18: 23.82 },
      { f12: '600519', f13: 1, f14: '贵州茅台', f2: 1442.11, f15: 1459, f16: 1423.9, f17: 1450.89, f18: 1460.21 },
    ]);

    const snapshots = provider.parse(text, ['sh600519', 'bj920799']);

    expect(snapshots.map((s) => s.code)).toEqual(['sh600519', 'bj920799']);
    expect(snapshots[0].name).toBe('贵州茅台');
    expect(snapshots[0].price).toBe(1442.11);
    expect(snapshots[0].prevClosePrice).toBe(1460.21);
    expect(snapshots[1].name).toBe('艾融软件');
    expect(snapshots[1].success).toBe(true);
  });

  it('北交所代码经 secid 映射后仍以请求原始代码返回，不被 f13=0 改写成 sz', () => {
    expect(toSecid('bj920799')).toBe('0.920799');
    expect(toSecid('sz000001')).toBe('0.000001');
    expect(toSecid('sh600519')).toBe('1.600519');

    const text = eastmoneyPayload([
      { f12: '920799', f13: 0, f14: '艾融软件', f2: 24, f15: 24.71, f16: 23.15, f17: 23.38, f18: 23.82 },
    ]);
    const [snapshot] = provider.parse(text, ['bj920799']);

    expect(snapshot.code).toBe('bj920799');
  });

  it('响应条目少于请求代码时缺失项补失败', () => {
    const text = eastmoneyPayload([
      { f12: '600519', f13: 1, f14: '贵州茅台', f2: 1442.11, f15: 1459, f16: 1423.9, f17: 1450.89, f18: 1460.21 },
    ]);

    const snapshots = provider.parse(text, ['sh600519', 'sh601318']);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].success).toBe(true);
    expect(snapshots[1].success).toBe(false);
  });

  it('停牌或已切换标的（f2 为 0 / "-"）只判该条失败', () => {
    const text = eastmoneyPayload([
      { f12: '830799', f13: 0, f14: '艾融软件(已切换)', f2: 0, f15: 0, f16: 0, f17: 0, f18: 34.28 },
      { f12: '600519', f13: 1, f14: '贵州茅台', f2: 1442.11, f15: 1459, f16: 1423.9, f17: 1450.89, f18: 1460.21 },
    ]);

    const snapshots = provider.parse(text, ['bj830799', 'sh600519']);

    expect(snapshots[0].success).toBe(false);
    // 现价无效但名称仍可用：供名称查询等场景复用
    expect(snapshots[0].name).toBe('艾融软件(已切换)');
    expect(snapshots[1].success).toBe(true);
  });

  it('名称缺失时仍按现价判定成功，名称返回空串', () => {
    const text = eastmoneyPayload([
      { f12: '600519', f13: 1, f2: 1442.11, f15: 1459, f16: 1423.9, f17: 1450.89, f18: 1460.21 },
    ]);

    const [snapshot] = provider.parse(text, ['sh600519']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.name).toBe('');
    expect(snapshot.price).toBe(1442.11);
  });

  it('data 为 null 时全部补失败而非抛异常', () => {
    const snapshots = provider.parse(JSON.stringify({ rc: 0, data: null }), ['sh600519']);

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].success).toBe(false);
  });

  it('非 JSON 响应抛出数据源错误', () => {
    expect(() => provider.parse('<html>error</html>', ['sh600519'])).toThrow(QuoteProviderError);
  });
});

describe('腾讯适配器', () => {
  const provider = getProvider('tencent');

  it('按索引 33/34 解析最高最低，段数不固定也能解析', () => {
    const text = tencentLine('sh600519', '贵州茅台', 1442.97, 1460.21, 1450.89, 1459, 1423.9);
    const [snapshot] = provider.parse(text, ['sh600519']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.name).toBe('贵州茅台');
    expect(snapshot.price).toBe(1442.97);
    expect(snapshot.openPrice).toBe(1450.89);
    expect(snapshot.prevClosePrice).toBe(1460.21);
    expect(snapshot.highPrice).toBe(1459);
    expect(snapshot.lowPrice).toBe(1423.9);
  });

  it('支持北交所 bj 前缀', () => {
    const text = tencentLine('bj920799', '艾融软件', 24, 23.82, 23.38, 24.71, 23.15);
    const [snapshot] = provider.parse(text, ['bj920799']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.code).toBe('bj920799');
  });

  it('字段不足时保留可用价格并把缺失字段填 0', () => {
    const text = 'v_sh600519="1~贵州茅台~600519~1442.97~1460.21~1450.89";';
    const [snapshot] = provider.parse(text, ['sh600519']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.price).toBe(1442.97);
    expect(snapshot.highPrice).toBe(0);
    expect(snapshot.lowPrice).toBe(0);
  });

  it('名称缺失时仍按现价判定成功，名称返回空串', () => {
    const text = tencentLine('sh600519', '', 1442.97, 1460.21, 1450.89, 1459, 1423.9);

    const [snapshot] = provider.parse(text, ['sh600519']);

    expect(snapshot.success).toBe(true);
    expect(snapshot.name).toBe('');
    expect(snapshot.price).toBe(1442.97);
  });
});

describe('代码前缀归一化', () => {
  it('920xxx 归北交所，900xxx 归沪市 B 股', () => {
    expect(toPrefixedCode('920799')).toBe('bj920799');
    expect(toPrefixedCode('900901')).toBe('sh900901');
    expect(toPrefixedCode('830799')).toBe('bj830799');
    expect(toPrefixedCode('600519')).toBe('sh600519');
    expect(toPrefixedCode('000001')).toBe('sz000001');
  });

  it('已带前缀的代码原样返回', () => {
    expect(toPrefixedCode('bj920799')).toBe('bj920799');
    expect(toPrefixedCode('sh600519')).toBe('sh600519');
    expect(toPrefixedCode('sz399001')).toBe('sz399001');
  });
});

describe('三家适配器输出同构', () => {
  it('同一只股票由三家解析后字段集合与语义一致', () => {
    const expectedFields = [
      'code',
      'highPrice',
      'lowPrice',
      'name',
      'openPrice',
      'prevClosePrice',
      'price',
      'success',
    ];

    const snapshots = [
      getProvider('sina').parse(
        sinaLine('sh600519', '贵州茅台,1450.890,1460.210,1442.110,1459.000,1423.900'),
        ['sh600519']
      )[0],
      getProvider('eastmoney').parse(
        eastmoneyPayload([
          { f12: '600519', f13: 1, f14: '贵州茅台', f2: 1442.11, f15: 1459, f16: 1423.9, f17: 1450.89, f18: 1460.21 },
        ]),
        ['sh600519']
      )[0],
      getProvider('tencent').parse(
        tencentLine('sh600519', '贵州茅台', 1442.11, 1460.21, 1450.89, 1459, 1423.9),
        ['sh600519']
      )[0],
    ];

    for (const snapshot of snapshots) {
      expect(Object.keys(snapshot).sort()).toEqual(expectedFields);
      expect(snapshot.code).toBe('sh600519');
      expect(snapshot.name).toBe('贵州茅台');
      expect(snapshot.price).toBe(1442.11);
      expect(snapshot.openPrice).toBe(1450.89);
      expect(snapshot.prevClosePrice).toBe(1460.21);
      expect(snapshot.highPrice).toBe(1459);
      expect(snapshot.lowPrice).toBe(1423.9);
      expect(snapshot.success).toBe(true);
    }
  });
});

describe('provider 注册表', () => {
  it('三个 provider 的端点与共享元数据一致', () => {
    for (const option of API_PROVIDERS) {
      expect(getProvider(option.value).endpoint).toBe(option.endpoint);
      expect(getQuoteEndpoint(option.value)).toBe(option.endpoint);
    }
  });

  it('未知 provider 回退新浪', () => {
    expect(getProvider('unknown').id).toBe('sina');
  });
});
