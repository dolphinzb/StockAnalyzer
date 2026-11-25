/**
 * 证券池与交易日历同步
 *
 * 证券池来源（design D6 / D11）：
 * - 在市：上交所 `commonQuery.do`、深交所 `/api/report/ShowReport/data` JSON 分页、北交所 `nqxxCnzq.do` POST 分页
 * - 退市：上交所 `COMPANY_STATUS=3`、深交所 `CATALOGID=1793_ssgs / TABKEY=tab2`、北交所人工/静态兜底
 * - `stock-sdk` 全量代码列表作为交叉校验与兜底（code_source = sdk_active）
 *
 * 名称/上市日期兜底：SDK 批量行情名称 → 东财 F10 `LISTING_DATE`（禁止从 K 线推断）
 */

import log from 'electron-log';
import type { MarketDatabase } from '../marketDatabase';
import { setMarketMeta } from '../marketDatabase';
import {
  countSecurities,
  listSecurities,
  mergeSecurityBatches,
  replaceTradingCalendar,
  saveSecurities,
  type MarketCodeSource,
  type MarketExchange,
  type MarketSecurityBatch,
  type MarketSecurityInput,
  type MarketSecurityRow,
} from './marketRepository';
import { BSE_DELISTED_FALLBACK, MANUAL_SECURITIES } from './marketManualOverrides';
import type { MarketSdkLike } from './marketSdkClient';

/** HTTP 请求描述 */
export interface MarketHttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
}

/** 发起请求并返回响应文本（由调用方包限速与重试） */
export type MarketHttpFetch = (request: MarketHttpRequest) => Promise<string>;

/** 证券池同步依赖 */
export interface UniverseDeps {
  fetchText: MarketHttpFetch;
  sdk: MarketSdkLike;
  now?: () => number;
}

/** 解析后的证券记录（尚未带 code_source / fetched_at） */
export interface ParsedSecurity {
  code: string;
  exchange: MarketExchange;
  name: string;
  listDate: string | null;
  delistDate: string | null;
  isActive: boolean;
  codeSource: MarketCodeSource;
}

/** 上交所公开接口 Referer（缺少时会被拒绝） */
const SSE_HEADERS: Record<string, string> = {
  Referer: 'https://www.sse.com.cn/',
  'User-Agent': 'Mozilla/5.0',
};

/** 深交所公开接口 Referer */
const SZSE_HEADERS: Record<string, string> = {
  Referer: 'https://www.szse.cn/market/product/stock/list/index.html',
  'User-Agent': 'Mozilla/5.0',
};

/** 北交所公开接口请求头 */
const BSE_HEADERS: Record<string, string> = {
  Referer: 'https://www.bse.cn/nqxx_list.html',
  'User-Agent': 'Mozilla/5.0',
  'Content-Type': 'application/x-www-form-urlencoded',
};

/** 上交所名录 sqlId */
const SSE_SQL_ID = 'COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L';
/** 上交所名录分页上限（防御性上限，避免异常 total 造成死循环） */
const SSE_MAX_PAGES = 40;
/** 上交所单页条数 */
const SSE_PAGE_SIZE = 500;
/** 深交所名录分页上限 */
const SZSE_MAX_PAGES = 400;
/** 北交所名录分页上限 */
const BSE_MAX_PAGES = 100;
/** 交易日历来源标识 */
export const CALENDAR_SOURCE = 'sse_szse_bj_calendar';
/** 东财 F10 单次同步最多兜底的股票数（避免一次同步发出上千请求） */
const F10_FALLBACK_LIMIT = 200;

/**
 * 从 JSONP 文本中剥离回调包装
 */
export function unwrapJsonp(text: string): string {
  const trimmed = text.trim();
  const matched = /^[A-Za-z_$][\w$]*\s*\(([\s\S]*)\)\s*;?$/.exec(trimmed);
  return matched ? matched[1] : trimmed;
}

/**
 * 解析 JSON（兼容 JSONP 包装）
 * @throws 内容不是合法 JSON 时抛错
 */
export function parseJsonPayload(text: string): unknown {
  return JSON.parse(unwrapJsonp(text));
}

/** 剥离 HTML 标签并压缩空白（深交所 `agjc` 含链接） */
export function stripHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 归一化日期为 `YYYY-MM-DD`
 * @returns 无法识别时返回 null（不编造日期）
 */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  if (text === '') {
    return null;
  }
  const digits = text.replace(/[^\d]/g, '');
  if (digits.length !== 8) {
    return null;
  }
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    return null;
  }
  return iso;
}

/**
 * 6 位代码 → 交易所
 * @returns 非沪深北 A 股普通股代码时返回 null（排除 900/200 等 B 股）
 */
export function inferExchange(code: string): MarketExchange | null {
  if (!/^\d{6}$/.test(code)) {
    return null;
  }
  if (/^6\d{5}$/.test(code)) {
    return 'SH';
  }
  if (/^(000|001|002|003|300|301)\d{3}$/.test(code)) {
    return 'SZ';
  }
  if (/^(43|83|87|92)\d{4}$/.test(code)) {
    return 'BJ';
  }
  return null;
}

/**
 * 是否为沪深北 A 股普通股代码（排除 B 股、基金、指数）
 */
export function isAShareCode(code: string): boolean {
  return inferExchange(code) !== null;
}

/** 从对象中按候选键取值 */
function pick(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return null;
}

/** 把任意行数组转换为对象数组（过滤非对象） */
function toRecordRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null
  );
}

/**
 * 解析上交所名录行
 * 字段：`A_STOCK_CODE / COMPANY_ABBR / LIST_DATE`，退市清单额外读取 `DELIST_DATE / DELIST_DATE_STRING`
 */
export function parseSseRows(rows: unknown, isDelisted: boolean): ParsedSecurity[] {
  const result: ParsedSecurity[] = [];
  for (const row of toRecordRows(rows)) {
    const rawCode = pick(row, ['A_STOCK_CODE', 'SECURITY_CODE', 'STOCK_CODE']);
    const code = rawCode === null ? '' : String(rawCode).trim();
    const exchange = inferExchange(code);
    if (!exchange) {
      continue;
    }
    const name = stripHtml(pick(row, ['COMPANY_ABBR', 'SECURITY_ABBR', 'COMPANY_NAME']));
    result.push({
      code,
      exchange,
      name: name !== '' ? name : code,
      listDate: normalizeDate(pick(row, ['LIST_DATE', 'LISTING_DATE'])),
      delistDate: isDelisted ? normalizeDate(pick(row, ['DELIST_DATE', 'DELIST_DATE_STRING'])) : null,
      isActive: !isDelisted,
      codeSource: isDelisted ? 'sse_delist' : 'sse_name',
    });
  }
  return result;
}

/**
 * 解析深交所名录行
 * 在市：`agdm / agjc / agssrq`；退市：`zqdm / zqjc / ssrq / zzrq`
 */
export function parseSzseRows(rows: unknown, isDelisted: boolean): ParsedSecurity[] {
  const result: ParsedSecurity[] = [];
  for (const row of toRecordRows(rows)) {
    const rawCode = pick(row, isDelisted ? ['zqdm', 'agdm'] : ['agdm', 'zqdm']);
    const code = rawCode === null ? '' : String(rawCode).trim();
    const exchange = inferExchange(code);
    if (!exchange) {
      continue;
    }
    const name = stripHtml(pick(row, isDelisted ? ['zqjc', 'agjc'] : ['agjc', 'zqjc']));
    result.push({
      code,
      exchange,
      name: name !== '' ? name : code,
      listDate: normalizeDate(pick(row, isDelisted ? ['ssrq', 'agssrq'] : ['agssrq', 'ssrq'])),
      delistDate: isDelisted ? normalizeDate(pick(row, ['zzrq'])) : null,
      isActive: !isDelisted,
      codeSource: isDelisted ? 'szse_delist' : 'szse_name',
    });
  }
  return result;
}

/**
 * 解析北交所名录行（中文键名与拼音键名都兼容）
 */
export function parseBseRows(rows: unknown, isDelisted: boolean): ParsedSecurity[] {
  const result: ParsedSecurity[] = [];
  for (const row of toRecordRows(rows)) {
    const rawCode = pick(row, ['证券代码', 'xxzqdm', 'zqdm']);
    const code = rawCode === null ? '' : String(rawCode).trim();
    const exchange = inferExchange(code);
    if (!exchange) {
      continue;
    }
    const name = stripHtml(pick(row, ['证券简称', 'xxzqjc', 'zqjc']));
    result.push({
      code,
      exchange,
      name: name !== '' ? name : code,
      listDate: normalizeDate(pick(row, ['上市日期', 'xxssrq', 'ssrq'])),
      delistDate: null,
      isActive: !isDelisted,
      codeSource: isDelisted ? 'manual' : 'bse_name',
    });
  }
  return result;
}

/**
 * 解析 SDK 全量代码列表（支持带 `sh/sz/bj` 前缀与纯数字）
 */
export function parseSdkCodes(codes: unknown): ParsedSecurity[] {
  if (!Array.isArray(codes)) {
    return [];
  }
  const result: ParsedSecurity[] = [];
  for (const raw of codes) {
    const text = String(raw ?? '').trim().toLowerCase();
    const pure = text.replace(/^(sh|sz|bj)/, '');
    const exchange = inferExchange(pure);
    if (!exchange) {
      continue;
    }
    result.push({
      code: pure,
      exchange,
      name: pure,
      listDate: null,
      delistDate: null,
      isActive: true,
      codeSource: 'sdk_active',
    });
  }
  return result;
}

/** 上交所单页请求 URL */
function sseUrl(options: { isDelisted: boolean; pageNo: number; stockType: string }): string {
  const params = new URLSearchParams({
    sqlId: SSE_SQL_ID,
    STOCK_TYPE: options.stockType,
    COMPANY_STATUS: options.isDelisted ? '3' : '2,4,5,7,8',
    REG_PROVINCE: '',
    CSRC_CODE: '',
    STOCK_CODE: '',
    COMPANY_ABBR: '',
    'pageHelp.pageSize': String(SSE_PAGE_SIZE),
    'pageHelp.pageNo': String(options.pageNo),
    'pageHelp.beginPage': String(options.pageNo),
    'pageHelp.cacheSize': '1',
    'pageHelp.endPage': String(options.pageNo),
  });
  return `https://query.sse.com.cn/sseQuery/commonQuery.do?${params.toString()}`;
}

/**
 * 拉取上交所名录（主板 + 科创板分别请求）
 */
export async function fetchSseSecurities(deps: UniverseDeps, isDelisted: boolean): Promise<ParsedSecurity[]> {
  const collected: ParsedSecurity[] = [];
  for (const stockType of ['1', '8']) {
    for (let pageNo = 1; pageNo <= SSE_MAX_PAGES; pageNo += 1) {
      const text = await deps.fetchText({
        url: sseUrl({ isDelisted, pageNo, stockType }),
        headers: SSE_HEADERS,
      });
      const payload = parseJsonPayload(text) as {
        result?: unknown;
        pageHelp?: { data?: unknown; total?: number; pageCount?: number };
      };
      const rows = payload.result ?? payload.pageHelp?.data;
      const parsed = parseSseRows(rows, isDelisted);
      collected.push(...parsed);

      const total = Number(payload.pageHelp?.total ?? 0);
      const pageCount = Number(payload.pageHelp?.pageCount ?? 0);
      const hasMore = pageCount > pageNo || collected.length < total;
      if (parsed.length === 0 || !hasMore) {
        break;
      }
    }
  }
  return collected;
}

/**
 * 拉取深交所名录
 * @param isDelisted true 时使用 `CATALOGID=1793_ssgs / TABKEY=tab2`（终止上市）
 */
export async function fetchSzseSecurities(
  deps: UniverseDeps,
  isDelisted: boolean
): Promise<ParsedSecurity[]> {
  const catalogId = '1793_ssgs';
  const tabKey = isDelisted ? 'tab2' : 'tab1';
  const collected: ParsedSecurity[] = [];

  for (let pageNo = 1; pageNo <= SZSE_MAX_PAGES; pageNo += 1) {
    const params = new URLSearchParams({
      SHOWTYPE: 'JSON',
      CATALOGID: catalogId,
      TABKEY: tabKey,
      PAGENO: String(pageNo),
      random: String(Math.random()),
    });
    const text = await deps.fetchText({
      url: `https://www.szse.cn/api/report/ShowReport/data?${params.toString()}`,
      headers: { ...SZSE_HEADERS },
    });
    const payload = parseJsonPayload(text);
    const blocks = toRecordRows(payload);
    const block = blocks.find(
      item => item.tabkey === tabKey && Array.isArray(item.data) && (item.data as unknown[]).length > 0
    ) ?? blocks.find(item => Array.isArray(item.data) && (item.data as unknown[]).length > 0);

    if (!block) {
      break;
    }
    const parsed = parseSzseRows(block.data, isDelisted);
    collected.push(...parsed);

    const metadata = (block.metadata ?? {}) as { pagecount?: number; pageno?: number };
    const pageCount = Number(metadata.pagecount ?? 1);
    if (parsed.length === 0 || pageNo >= pageCount) {
      break;
    }
  }

  return collected;
}

/**
 * 拉取北交所名录（POST 分页）
 */
export async function fetchBseSecurities(deps: UniverseDeps, isDelisted: boolean): Promise<ParsedSecurity[]> {
  if (isDelisted) {
    // 北交所暂无稳定公开退市清单：使用人工/静态兜底
    return BSE_DELISTED_FALLBACK.map(item => ({
      code: item.code,
      exchange: item.exchange,
      name: item.name,
      listDate: item.listDate ?? null,
      delistDate: item.delistDate ?? null,
      isActive: false,
      codeSource: 'manual' as MarketCodeSource,
    }));
  }

  const collected: ParsedSecurity[] = [];
  for (let page = 0; page < BSE_MAX_PAGES; page += 1) {
    const body = new URLSearchParams({
      page: String(page),
      typejb: 'T',
      sortfield: 'xxzqdm',
      sorttype: 'asc',
      zqdm: '',
    });
    body.append('xxfcbj[]', '2');
    const text = await deps.fetchText({
      url: 'https://www.bse.cn/nqxxController/nqxxCnzq.do',
      method: 'POST',
      headers: BSE_HEADERS,
      body: body.toString(),
    });

    let payload: unknown;
    try {
      payload = parseJsonPayload(text);
    } catch {
      log.warn('北交所名录返回非 JSON，终止分页');
      break;
    }
    const root = payload as { data?: unknown; content?: unknown; page?: { totalPages?: number } };
    const rows =
      (root.data as { content?: unknown } | undefined)?.content ??
      (Array.isArray(root.data) ? root.data : undefined) ??
      root.content;
    const parsed = parseBseRows(rows, false);
    collected.push(...parsed);

    const totalPages = Number(
      (root.data as { page?: { totalPages?: number } } | undefined)?.page?.totalPages ?? 0
    );
    if (parsed.length === 0 || page + 1 >= totalPages) {
      break;
    }
  }
  return collected;
}

/**
 * 用 SDK 批量行情补齐缺失名称（交易所名录未覆盖的代码）
 * @param securities 已合并的证券（就地更新 name）
 */
export async function enrichMissingNames(
  deps: UniverseDeps,
  securities: ParsedSecurity[]
): Promise<void> {
  if (!deps.sdk.getAllQuotesByCodes) {
    return;
  }
  const pending = securities.filter(item => item.name === item.code);
  if (pending.length === 0) {
    return;
  }

  const CHUNK = 60;
  for (let index = 0; index < pending.length; index += CHUNK) {
    const chunk = pending.slice(index, index + CHUNK);
    try {
      const quotes = await deps.sdk.getAllQuotesByCodes(chunk.map(item => item.code));
      const nameMap = new Map(quotes.map(quote => [quote.code.replace(/^(sh|sz|bj)/, ''), quote.name]));
      for (const item of chunk) {
        const name = nameMap.get(item.code);
        if (name && name.trim() !== '') {
          item.name = name.trim();
        }
      }
    } catch (error) {
      log.warn(`SDK 批量名称兜底失败（${chunk[0]?.code ?? ''} 起）: ${String(error)}`);
    }
  }
}

/**
 * 东财 F10 上市日期兜底
 * @returns `YYYY-MM-DD`；无法获取时返回 null
 */
export async function fetchEastmoneyListingDate(
  deps: UniverseDeps,
  code: string
): Promise<string | null> {
  const params = new URLSearchParams({ code, type: 'HSF10' });
  const text = await deps.fetchText({
    url: `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?${params.toString()}`,
    headers: {
      Referer: `https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/Index?type=web&code=${code}`,
      'User-Agent': 'Mozilla/5.0',
    },
  });
  const payload = parseJsonPayload(text) as { jbzl?: Array<Record<string, unknown>> };
  const row = payload.jbzl?.[0];
  return row ? normalizeDate(row.LISTING_DATE) : null;
}

/**
 * 把解析结果转换为仓储批次
 */
function toBatch(
  rows: readonly ParsedSecurity[],
  codeSource: MarketCodeSource
): MarketSecurityBatch {
  return {
    codeSource,
    rows: rows.map(row => ({
      code: row.code,
      exchange: row.exchange,
      name: row.name,
      listDate: row.listDate,
      delistDate: row.delistDate,
      isActive: row.isActive,
    })),
  };
}

/** 证券池同步范围 */
export type UniverseScope = 'active' | 'delisted' | 'all';

/**
 * 同步证券池（在市 + 退市 + SDK 兜底 + 人工覆盖）
 * @param scope 同步范围：`active_codes` 任务只拉在市来源，`delisted_codes` 只拉退市来源
 * @returns 合并后的总数与在市数量
 */
export async function syncSecuritiesUniverse(
  db: MarketDatabase,
  deps: UniverseDeps,
  scope: UniverseScope = 'all'
): Promise<{ total: number; active: number }> {
  const nowMs = deps.now ? deps.now() : Date.now();
  const fetchedAt = Math.floor(nowMs / 1000);
  const batches: MarketSecurityBatch[] = [];
  const failures: string[] = [];

  /** 单个来源失败不阻断其它来源，但全部失败时任务必须失败 */
  const collect = async (
    label: string,
    loader: () => Promise<ParsedSecurity[]>,
    codeSource: MarketCodeSource
  ): Promise<void> => {
    try {
      const rows = await loader();
      if (rows.length === 0) {
        failures.push(`${label}: 空结果`);
        return;
      }
      batches.push(toBatch(rows, codeSource));
      log.info(`证券池来源 ${label}: ${rows.length} 条`);
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      log.warn(`证券池来源 ${label} 失败: ${String(error)}`);
    }
  };

  if (scope !== 'delisted') {
    await collect('上交所在市名录', () => fetchSseSecurities(deps, false), 'sse_name');
    await collect('深交所在市名录', () => fetchSzseSecurities(deps, false), 'szse_name');
    await collect('北交所在市名录', () => fetchBseSecurities(deps, false), 'bse_name');
    await collect(
      'stock-sdk 代码列表',
      async () => parseSdkCodes(await deps.sdk.getAShareCodeList({ simple: true })),
      'sdk_active'
    );
  }

  if (scope !== 'active') {
    await collect('上交所退市清单', () => fetchSseSecurities(deps, true), 'sse_delist');
    await collect('深交所退市清单', () => fetchSzseSecurities(deps, true), 'szse_delist');
    await collect('北交所退市静态兜底', () => fetchBseSecurities(deps, true), 'manual');
  }

  if (MANUAL_SECURITIES.length > 0) {
    batches.push(
      toBatch(
        MANUAL_SECURITIES.map(item => ({
          code: item.code,
          exchange: item.exchange,
          name: item.name,
          listDate: item.listDate ?? null,
          delistDate: item.delistDate ?? null,
          isActive: item.isActive ?? true,
          codeSource: 'manual' as MarketCodeSource,
        })),
        'manual'
      )
    );
  }

  const hasAnySource = batches.some(batch => batch.rows.length > 0);
  if (!hasAnySource) {
    if (scope === 'delisted') {
      // 退市清单本身可能为空（当前无退市证券），北交所只有静态兜底：
      // 空结果不视为失败，避免拖垮整个全量回填
      log.info(`退市清单来源均无数据，跳过本次合并: ${failures.join('; ')}`);
      return { total: countSecurities(db), active: countSecurities(db, true) };
    }
    throw new Error(`证券池同步失败，全部来源不可用: ${failures.join('; ')}`);
  }

  const existing = new Map<string, MarketSecurityRow>(
    listSecurities(db).map(row => [row.code, row])
  );
  const merged = mergeSecurityBatches(existing, batches, fetchedAt);

  // 名称兜底：交易所名录缺失的代码用 SDK 批量行情补齐
  const parsedLike = merged.map(item => ({
    code: item.code,
    exchange: item.exchange,
    name: item.name,
    listDate: item.listDate,
    delistDate: item.delistDate,
    isActive: item.isActive,
    codeSource: item.codeSource,
  }));
  await enrichMissingNames(deps, parsedLike);

  // 上市日期兜底：仅对缺少 list_date 的在市证券，限制单次请求量
  const missingListDate = parsedLike.filter(item => item.isActive && item.listDate === null);
  for (const item of missingListDate.slice(0, F10_FALLBACK_LIMIT)) {
    try {
      const listDate = await fetchEastmoneyListingDate(deps, item.code);
      if (listDate) {
        item.listDate = listDate;
      }
    } catch {
      // 单个代码兜底失败不影响整批
    }
  }
  if (missingListDate.length > F10_FALLBACK_LIMIT) {
    log.info(
      `东财 F10 上市日期兜底本次处理 ${F10_FALLBACK_LIMIT}/${missingListDate.length} 只，其余留待下次同步`
    );
  }

  const finalRows: MarketSecurityInput[] = parsedLike.map(item => ({
    code: item.code,
    exchange: item.exchange,
    name: item.name,
    listDate: item.listDate,
    delistDate: item.delistDate,
    isActive: item.isActive,
    codeSource: item.codeSource,
    fetchedAt,
  }));

  saveSecurities(db, finalRows, fetchedAt);
  setMarketMeta({ securities_synced_at: fetchedAt }, db);

  const total = countSecurities(db);
  const active = countSecurities(db, true);
  log.info(`证券池同步完成: 共 ${total} 只，在市 ${active} 只`);
  return { total, active };
}

/**
 * 同步交易日历（源文件全部交易日整表替换，含未来已公布日期）
 * @returns 写入的交易日数量
 */
export async function syncTradingCalendar(db: MarketDatabase, deps: UniverseDeps): Promise<number> {
  const calendar = await deps.sdk.getTradingCalendar();
  const dates = calendar
    .map(date => normalizeDate(date))
    .filter((date): date is string => date !== null);

  if (dates.length === 0) {
    throw new Error('交易日历为空，拒绝整表替换');
  }

  const nowSec = Math.floor((deps.now ? deps.now() : Date.now()) / 1000);
  const written = replaceTradingCalendar(db, dates, CALENDAR_SOURCE, nowSec);
  log.info(`交易日历同步完成: ${written} 个交易日（含未来已公布日期）`);
  return written;
}
