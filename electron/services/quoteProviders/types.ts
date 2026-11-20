import type { QuoteProviderId, QuoteSnapshot } from '../../../shared/types';

/** 适配器构造出的 HTTP 请求描述，由价格服务负责实际发送 */
export interface QuoteRequest {
  url: string;
  headers?: Record<string, string>;
}

/**
 * 行情数据源适配器契约。
 *
 * 约定：`parse` 必须返回与入参 `codes` **等长**的数组，响应中缺失或无效的代码
 * 由适配器自己补 `success: false`，调用方不再二次补齐。
 */
export interface QuoteProvider {
  readonly id: QuoteProviderId;
  /** 只读端点，与 `API_PROVIDERS` 元数据一致 */
  readonly endpoint: string;
  buildRequest(codes: string[]): QuoteRequest;
  decode(buffer: ArrayBuffer): string;
  parse(text: string, codes: string[]): QuoteSnapshot[];
}

/** 数据源请求/解析整体失败（网络、非 2xx、响应结构不可识别） */
export class QuoteProviderError extends Error {
  constructor(
    public readonly providerId: QuoteProviderId,
    message: string
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'QuoteProviderError';
  }
}

/** 新浪与腾讯返回 GBK，必须显式解码，禁止依赖运行时按 UTF-8 猜测 */
export function decodeGbk(buffer: ArrayBuffer): string {
  return new TextDecoder('gbk').decode(buffer);
}

export function decodeUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(buffer);
}

/**
 * 把数据源返回的价格字段转为数字。
 * 停牌/未开盘时数据源可能给 `"-"`、空串或 `0`，统一按「无有效价格」处理。
 */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '-') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** 构造一条失败快照，保证返回数组与请求代码对齐 */
export function failedSnapshot(code: string, error: string, name = ''): QuoteSnapshot {
  return {
    code,
    name,
    price: 0,
    openPrice: 0,
    prevClosePrice: 0,
    highPrice: 0,
    lowPrice: 0,
    success: false,
    error,
  };
}
