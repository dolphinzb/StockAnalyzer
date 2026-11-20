import { getQuoteEndpoint } from '../../../shared/types';
import type { QuoteSnapshot } from '../../../shared/types';
import {
  decodeGbk,
  failedSnapshot,
  toNumber,
  type QuoteProvider,
  type QuoteRequest,
} from './types';

/** 新浪行情字段：0=名称, 1=今开, 2=昨收, 3=现价, 4=最高, 5=最低 */
const FIELD = {
  name: 0,
  open: 1,
  prevClose: 2,
  price: 3,
  high: 4,
  low: 5,
} as const;

const SINA_ENDPOINT = getQuoteEndpoint('sina');
/** 新浪要求携带财经站 Referer，否则返回 403 */
const SINA_HEADERS = { Referer: 'http://finance.sina.com.cn' };

export const sinaProvider: QuoteProvider = {
  id: 'sina',
  endpoint: SINA_ENDPOINT,

  buildRequest(codes: string[]): QuoteRequest {
    return {
      url: `${SINA_ENDPOINT}${codes.join(',')}`,
      headers: SINA_HEADERS,
    };
  },

  decode: decodeGbk,

  parse(text: string, codes: string[]): QuoteSnapshot[] {
    const rawByCode = new Map<string, string>();
    const pattern = /hq_str_(\w+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      rawByCode.set(match[1], match[2]);
    }

    return codes.map((code) => {
      const raw = rawByCode.get(code);
      if (raw === undefined) {
        return failedSnapshot(code, '数据源未返回该代码');
      }
      if (!raw) {
        return failedSnapshot(code, '数据源返回空数据');
      }

      const parts = raw.split(',');
      if (parts.length <= FIELD.low) {
        return failedSnapshot(code, '字段数量不足');
      }

      const name = parts[FIELD.name] ?? '';
      const price = toNumber(parts[FIELD.price]);
      // 名称缺失不影响价格有效性：success 只以现价为准，名称原样返回（可能为空串）
      if (price === null || price <= 0) {
        return failedSnapshot(code, '价格为空或无效', name);
      }

      return {
        code,
        name,
        price,
        openPrice: toNumber(parts[FIELD.open]) ?? 0,
        prevClosePrice: toNumber(parts[FIELD.prevClose]) ?? 0,
        highPrice: toNumber(parts[FIELD.high]) ?? 0,
        lowPrice: toNumber(parts[FIELD.low]) ?? 0,
        success: true,
      };
    });
  },
};
