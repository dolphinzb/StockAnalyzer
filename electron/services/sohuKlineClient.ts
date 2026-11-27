/**
 * 搜狐历史 K 线适配层
 *
 * 只实现 MarketSdkLike.getHistoryKline 的原始日线能力。
 * 搜狐响应为 GBK 编码 JSON，日期默认倒序；这里统一归一化为升序 MarketKlineItem[]。
 *
 * 复权（qfq/hfq）不在此层生成：同步服务用同一份原始日线在本地推导因子后直接落库，
 * 因此本适配器收到复权请求时显式报错，避免再次出现「为复权类型重复下载全历史」。
 */

import type { MarketKlineItem } from './marketSdkClient';

export const SOHU_HISTORY_URL = 'https://q.stock.sohu.com/hisHq';
export const SOHU_EARLIEST_START_DATE = '19900101';

const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 256;

export interface SohuKlineClientOptions {
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  maxCacheEntries?: number;
  cacheTtlMs?: number;
}

interface CachedRequest {
  promise: Promise<MarketKlineItem[]>;
  createdAt: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function localYmd(date: Date = new Date()): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

export function previousYmd(ymd: string): string {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

/** sh600519 / sz000001 / bj920819 → cn_600519 / cn_000001 / cn_920819 */
export function toSohuCode(symbol: string): string {
  const code = symbol.replace(/^(sh|sz|bj)/i, '');
  if (!/^\d{6}$/.test(code)) {
    throw new Error(`INVALID_SYMBOL: 不支持的搜狐证券代码 ${symbol}`);
  }
  return `cn_${code}`;
}

export function buildSohuHistoryUrl(sohuCode: string, startDate: string, endDate: string): string {
  const params = new URLSearchParams({
    code: sohuCode,
    start: startDate,
    end: endDate,
    period: 'd',
    order: 'A',
    stat: '0',
    rt: 'json',
  });
  return `${SOHU_HISTORY_URL}?${params.toString()}`;
}

export function decodeSohuResponseBody(buffer: ArrayBuffer): string {
  return new TextDecoder('gbk').decode(buffer);
}

function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(String(raw).trim());
  return Number.isFinite(value) ? value : null;
}

function parsePercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return parseNumber(String(raw).trim().replace(/%$/, ''));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeAmplitude(bars: readonly MarketKlineItem[]): MarketKlineItem[] {
  return bars.map((bar, index) => {
    if (index === 0 || !Number.isFinite(bar.high) || !Number.isFinite(bar.low)) {
      return { ...bar, amplitude: null };
    }
    const previousClose = bars[index - 1].close;
    if (!Number.isFinite(previousClose) || (previousClose as number) <= 0) {
      return { ...bar, amplitude: null };
    }
    return {
      ...bar,
      amplitude: round2((((bar.high as number) - (bar.low as number)) / (previousClose as number)) * 100),
    };
  });
}

/** 解析搜狐响应并按日期升序去重；第 11 字段忽略。 */
export function parseSohuHistory(text: string): MarketKlineItem[] {
  const payload = JSON.parse(text) as Array<{
    status?: number;
    code?: string;
    msg?: string;
    hq?: unknown[];
  }>;
  if (!Array.isArray(payload)) {
    throw new Error('搜狐历史数据响应不是数组');
  }
  if (payload.length === 0) {
    throw new Error('搜狐历史数据响应为空');
  }

  const byDate = new Map<string, MarketKlineItem>();
  for (const entry of payload) {
    if (entry.status === 2 && /non-existent/i.test(String(entry.msg ?? ''))) {
      continue;
    }
    if (entry.status !== 0) {
      throw new Error(`搜狐返回异常状态 ${String(entry.status)}: ${entry.code ?? ''}`);
    }
    if (!Array.isArray(entry.hq)) continue;
    for (const row of entry.hq) {
      if (!Array.isArray(row) || row.length < 10) continue;
      const rawDate = String(row[0] ?? '').replace(/-/g, '');
      if (!/^\d{8}$/.test(rawDate)) continue;
      const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
      const amountWan = parseNumber(row[8]);
      byDate.set(date, {
        date,
        open: parseNumber(row[1]),
        close: parseNumber(row[2]),
        high: parseNumber(row[6]),
        low: parseNumber(row[5]),
        volume: parseNumber(row[7]),
        amount: amountWan === null ? null : Math.round(amountWan * 10000 * 100) / 100,
        amplitude: null,
        changePercent: parsePercent(row[4]),
        change: parseNumber(row[3]),
        turnoverRate: parsePercent(row[9]),
      });
    }
  }

  const sorted = Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date));
  return computeAmplitude(sorted);
}

async function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.arrayBuffer();
}

function withContext(label: string, error: unknown): Error {
  const wrapped = new Error(`${label} 失败`) as Error & { cause?: unknown };
  wrapped.cause = error;
  return wrapped;
}

/**
 * 创建仅提供原始日线的搜狐客户端。
 *
 * 请求缓存按 `symbol|startDate|endDate` 去重，用于同一证券的重试与并发去重；
 * 复权序列由同步服务在本地推导，因此不缓存任何因子。
 */
export function createSohuKlineClient(options: SohuKlineClientOptions = {}): Pick<
  import('./marketSdkClient').MarketSdkLike,
  'getHistoryKline'
> {
  const fetchBytes = options.fetchBytes ?? defaultFetchBytes;
  const maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const requestCache = new Map<string, CachedRequest>();

  async function fetchRaw(symbol: string, startDate: string, endDate: string): Promise<MarketKlineItem[]> {
    const key = `${symbol}|${startDate}|${endDate}`;
    const cached = requestCache.get(key);
    if (cached && Date.now() - cached.createdAt <= cacheTtlMs) {
      return cached.promise;
    }
    if (cached) requestCache.delete(key);

    const label = `sohu getHistoryKline ${symbol} ${startDate}~${endDate}`;
    const promise = (async () => {
      const sohuCode = toSohuCode(symbol);
      const url = buildSohuHistoryUrl(sohuCode, startDate, endDate);
      try {
        const buffer = await fetchBytes(url);
        return parseSohuHistory(decodeSohuResponseBody(buffer));
      } catch (error) {
        throw withContext(`${label} ${url}`, error);
      }
    })().catch(error => {
      requestCache.delete(key);
      throw error;
    });

    requestCache.set(key, { promise, createdAt: Date.now() });
    if (requestCache.size > maxCacheEntries) {
      const oldest = requestCache.keys().next().value;
      if (oldest) requestCache.delete(oldest);
    }
    return promise;
  }

  return {
    async getHistoryKline(symbol, itemOptions) {
      if (itemOptions.period !== 'daily') {
        throw new Error(`SOHU_UNSUPPORTED_PERIOD: ${itemOptions.period}`);
      }
      if (itemOptions.adjust !== '') {
        throw new Error(
          `SOHU_UNSUPPORTED_ADJUST: 搜狐适配器只提供原始日线，复权序列请在同步服务内由原始日线推导（${symbol} ${itemOptions.adjust}）`
        );
      }

      const startDate = itemOptions.startDate ?? SOHU_EARLIEST_START_DATE;
      const endDate = itemOptions.endDate ?? localYmd();
      const label = `sohu getHistoryKline ${symbol} ${startDate}~${endDate}`;

      try {
        return await fetchRaw(symbol, startDate, endDate);
      } catch (error) {
        if (error instanceof Error && error.message.includes('sohu getHistoryKline')) throw error;
        throw withContext(label, error);
      }
    },
  };
}
