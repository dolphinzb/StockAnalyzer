import { getQuoteEndpoint } from '../../../shared/types';
import type { QuoteSnapshot } from '../../../shared/types';
import {
  decodeGbk,
  failedSnapshot,
  toNumber,
  type QuoteProvider,
  type QuoteRequest,
} from './types';

const TENCENT_ENDPOINT = getQuoteEndpoint('tencent');

/**
 * 腾讯字段以 `~` 分隔，段数在不同标的不固定（实测 87~88 段）：
 * 1=名称, 3=现价, 4=昨收, 5=今开, 33=最高, 34=最低（33/34 已与东财 f15/f16 交叉验证一致）
 */
const FIELD = {
  name: 1,
  price: 3,
  prevClose: 4,
  open: 5,
  high: 33,
  low: 34,
} as const;

export const tencentProvider: QuoteProvider = {
  id: 'tencent',
  endpoint: TENCENT_ENDPOINT,

  buildRequest(codes: string[]): QuoteRequest {
    return {
      url: `${TENCENT_ENDPOINT}${codes.join(',')}`,
    };
  },

  decode: decodeGbk,

  parse(text: string, codes: string[]): QuoteSnapshot[] {
    const rawByCode = new Map<string, string>();
    const pattern = /v_(\w+)="([^"]*)"/g;
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

      const parts = raw.split('~');
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
