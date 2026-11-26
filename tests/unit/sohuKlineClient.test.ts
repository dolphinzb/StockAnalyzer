import { describe, expect, it, vi } from 'vitest';
import {
  buildSohuHistoryUrl,
  createSohuKlineClient,
  decodeSohuResponseBody,
  parseSohuHistory,
  previousYmd,
  toSohuCode,
} from '../../electron/services/sohuKlineClient';

function responseBytes(payload: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer;
}

const AMPLE_RESPONSE = [
  {
    status: 0,
    code: 'cn_600519',
    hq: [
      ['2025-01-03', '9', '9', '0.5', '5.88%', '9', '9', '100', '100', '1%', 'ignored'],
      ['2025-01-02', '10', '10', '0', '0%', '10', '10', '100', '100', '1%'],
    ],
  },
];

describe('搜狐 K 线客户端', () => {
  it('转换 sh/sz/bj 前缀为 cn_ 代码', () => {
    expect(toSohuCode('sh600519')).toBe('cn_600519');
    expect(toSohuCode('sz000001')).toBe('cn_000001');
    expect(toSohuCode('bj920819')).toBe('cn_920819');
  });

  it('构造包含周期与排序的 URL', () => {
    const url = buildSohuHistoryUrl('cn_600519', '20250102', '20250103');
    expect(url).toContain('code=cn_600519');
    expect(url).toContain('start=20250102');
    expect(url).toContain('end=20250103');
    expect(url).toContain('period=d');
    expect(url).toContain('order=A');
    expect(url).toContain('stat=0');
    expect(url).toContain('rt=json');
  });

  it('计算上一个自然日', () => {
    expect(previousYmd('20250101')).toBe('20241231');
    expect(previousYmd('20250301')).toBe('20250228');
  });

  it('按 GBK 解码响应体', () => {
    const bytes = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]).buffer as ArrayBuffer;
    expect(decodeSohuResponseBody(bytes)).toBe('你好');
  });

  it('解析字段、百分比、成交额单位并按日期升序去重', () => {
    const bars = parseSohuHistory(JSON.stringify(AMPLE_RESPONSE));
    expect(bars).toHaveLength(2);
    expect(bars[0].date).toBe('2025-01-02');
    expect(bars[0].close).toBe(10);
    expect(bars[0].change).toBe(0);
    expect(bars[0].changePercent).toBe(0);
    expect(bars[0].amount).toBe(1000000);
    expect(bars[0].turnoverRate).toBe(1);
    expect(bars[1].amplitude).not.toBeNull();
  });

  it('状态非 0 时解析失败', () => {
    expect(() => parseSohuHistory(JSON.stringify([{ status: 1, code: 'cn_600519', hq: [] }]))).toThrow();
  });

  it('non-existent 响应视为空数据', () => {
    expect(
      parseSohuHistory(
        JSON.stringify([{ status: 2, msg: 'cn_000003 non-existent', code: 'cn_000003' }])
      )
    ).toEqual([]);
  });

  it('无历史因子时回退全历史并生成本地 qfq', async () => {
    const fetchBytes = vi.fn(async () => responseBytes(AMPLE_RESPONSE));
    const client = createSohuKlineClient({ fetchBytes });

    const bars = await client.getHistoryKline('sh600519', {
      period: 'daily',
      adjust: 'qfq',
      startDate: '20250102',
      endDate: '20250103',
    });

    expect(fetchBytes).toHaveBeenCalledTimes(1);
    expect(String(fetchBytes.mock.calls[0][0])).toContain('start=19900101');
    expect(bars).toHaveLength(2);
    expect(bars[0].close).toBeCloseTo(8.5, 2);
  });

  it('raw/qfq/hfq 三条任务共享同一次 raw 请求', async () => {
    const fetchBytes = vi.fn(async () => responseBytes(AMPLE_RESPONSE));
    const client = createSohuKlineClient({ fetchBytes });

    await Promise.all(
      (['', 'qfq', 'hfq'] as const).map(adjust =>
        client.getHistoryKline('sh600519', {
          period: 'daily',
          adjust,
          startDate: '19900101',
          endDate: '20250103',
        })
      )
    );

    expect(fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('有历史因子时增量只请求起点前一天到终点', async () => {
    const fetchBytes = vi.fn(async () => responseBytes(AMPLE_RESPONSE));
    const readFactors = vi.fn(() => ({
      qfq: new Map([['2025-01-02', 1]]),
      hfq: new Map([['2025-01-02', 1]]),
    }));
    const client = createSohuKlineClient({ fetchBytes, readFactors });

    await client.getHistoryKline('sh600519', {
      period: 'daily',
      adjust: 'hfq',
      startDate: '20250102',
      endDate: '20250103',
    });

    expect(readFactors).toHaveBeenCalledWith('600519');
    expect(String(fetchBytes.mock.calls[0][0])).toContain('start=20250101');
  });

  it('raw 增量只请求传入区间', async () => {
    const fetchBytes = vi.fn(async () => responseBytes(AMPLE_RESPONSE));
    const client = createSohuKlineClient({ fetchBytes });

    await client.getHistoryKline('sh600519', {
      period: 'daily',
      adjust: '',
      startDate: '20250102',
      endDate: '20250103',
    });

    const url = String(fetchBytes.mock.calls[0][0]);
    expect(url).toContain('start=20250102');
    expect(url).toContain('end=20250103');
  });

  it('qfq/hfq 增量优先复用当前进程因子缓存', async () => {
    const fetchBytes = vi.fn(async () => responseBytes(AMPLE_RESPONSE));
    const readFactors = vi.fn(() => null);
    const client = createSohuKlineClient({ fetchBytes, readFactors });

    await client.getHistoryKline('sh600519', {
      period: 'daily',
      adjust: 'qfq',
      startDate: '19900101',
      endDate: '20250103',
    });
    await client.getHistoryKline('sh600519', {
      period: 'daily',
      adjust: 'hfq',
      startDate: '20250102',
      endDate: '20250103',
    });

    expect(readFactors).toHaveBeenCalledTimes(1);
    expect(fetchBytes).toHaveBeenCalledTimes(2);
    expect(String(fetchBytes.mock.calls[1][0])).toContain('start=20250101');
  });
});
