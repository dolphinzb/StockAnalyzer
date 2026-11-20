import { getQuoteEndpoint } from '../../../shared/types';
import type { QuoteSnapshot } from '../../../shared/types';
import {
  decodeUtf8,
  failedSnapshot,
  QuoteProviderError,
  toNumber,
  type QuoteProvider,
  type QuoteRequest,
} from './types';

const EASTMONEY_ENDPOINT = getQuoteEndpoint('eastmoney');
/** f2=现价, f4=涨跌额, f12=代码, f13=市场, f14=名称, f15=最高, f16=最低, f17=今开, f18=昨收 */
const FIELDS = 'f2,f4,f12,f13,f14,f15,f16,f17,f18';

interface EastmoneyRow {
  f2?: number | string;
  f4?: number | string;
  f12?: string;
  f13?: number | string;
  f14?: string;
  f15?: number | string;
  f16?: number | string;
  f17?: number | string;
  f18?: number | string;
}

interface EastmoneyPayload {
  data?: {
    diff?: unknown;
  } | null;
}

/**
 * 内部代码 → 东财 secid。
 * 沪市市场为 1，深市与北交所均为 0（北交所 920xxx 实测 f13 也是 0）。
 */
export function toSecid(code: string): string {
  if (code.startsWith('sh')) {
    return `1.${code.slice(2)}`;
  }
  return `0.${code.slice(2)}`;
}

export const eastmoneyProvider: QuoteProvider = {
  id: 'eastmoney',
  endpoint: EASTMONEY_ENDPOINT,

  buildRequest(codes: string[]): QuoteRequest {
    const secids = codes.map(toSecid).join(',');
    return {
      url: `${EASTMONEY_ENDPOINT}?fltt=2&fields=${FIELDS}&secids=${secids}`,
    };
  },

  decode: decodeUtf8,

  parse(text: string, codes: string[]): QuoteSnapshot[] {
    let payload: EastmoneyPayload;
    try {
      payload = JSON.parse(text) as EastmoneyPayload;
    } catch {
      throw new QuoteProviderError('eastmoney', '响应不是合法 JSON');
    }

    const diff = payload?.data?.diff;
    if (!Array.isArray(diff)) {
      // data 为 null 时通常表示所有代码都无效，按逐条失败返回而不是抛整批异常
      return codes.map((code) => failedSnapshot(code, '数据源未返回该代码'));
    }

    // 顺序不保证，必须按「市场.代码」建立索引，禁止按数组下标与请求代码对位
    const rowBySecid = new Map<string, EastmoneyRow>();
    for (const item of diff) {
      if (!item || typeof item !== 'object') continue;
      const row = item as EastmoneyRow;
      const stockCode = typeof row.f12 === 'string' ? row.f12 : '';
      if (!stockCode) continue;
      rowBySecid.set(`${String(row.f13 ?? '')}.${stockCode}`, row);
    }

    return codes.map((code) => {
      const row = rowBySecid.get(toSecid(code));
      if (!row) {
        return failedSnapshot(code, '数据源未返回该代码');
      }

      const name = typeof row.f14 === 'string' ? row.f14 : '';
      const price = toNumber(row.f2);
      // 名称缺失不影响价格有效性：success 只以现价为准，名称原样返回（可能为空串）
      if (price === null || price <= 0) {
        return failedSnapshot(code, '价格为空或无效', name);
      }

      return {
        code,
        name,
        price,
        openPrice: toNumber(row.f17) ?? 0,
        prevClosePrice: toNumber(row.f18) ?? 0,
        highPrice: toNumber(row.f15) ?? 0,
        lowPrice: toNumber(row.f16) ?? 0,
        success: true,
      };
    });
  },
};
