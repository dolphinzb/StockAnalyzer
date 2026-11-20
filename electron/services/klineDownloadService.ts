/**
 * K线数据下载服务
 * 
 * 功能：
 * - 集成 stock-sdk 获取K线数据
 * - 手动下载指定股票的历史K线数据
 * - 自动下载调度（交易日15:10）
 * - 交易日判断（stock-sdk交易日历 + 周末回退）
 * - 下载失败自动重试1次
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { StockSDK } from 'stock-sdk';
import type {
  DownloadStockInput,
  KlineBatchDownloadSummary,
  KlineBatchProgressPayload,
  KlineBatchStockResult,
  KlineData,
  KlineDownloadResult,
  KlinePeriod
} from '../../shared/types';
import { isFund } from '../../shared/utils/securities';
import {
  getLatestTradeDates,
  getWatchlist,
  saveKlineData,
  getChartData as dbGetChartData,
  type LatestTradeDateEntry
} from '../database';

// StockSDK 模块级单例
const sdk = new StockSDK();

/**
 * 自动增量下载的「从头」起点
 * 早于 A 股首个交易日（1990-12-19），仅用于库内完全无数据时表示「拉取全部历史」。
 * 实际返回条数由数据源按上市日期截断。
 */
export const EARLIEST_START_DATE = '19900101';

/**
 * 调度最小提前量：距目标时刻不足该值时视为「已过」，顺延到下一个调度日
 * 用于消除「定时器提前触发 → 递归调度又排当天一次」的重复执行
 */
export const MIN_LEAD_MS = 2 * 60 * 1000;

/** 每日自动下载的计划时刻（时:分） */
const SCHEDULE_HOUR = 15;
const SCHEDULE_MINUTE = 10;

/**
 * 内部周期标识 → stock-sdk 周期参数 的显式映射
 * 禁止隐式字符串拼接，避免周期与数据源参数不一致
 */
const SDK_PERIODS: Record<KlinePeriod, 'daily' | 'weekly' | 'monthly'> = {
  d: 'daily',
  w: 'weekly',
  m: 'monthly',
};

/** 周期中文名（日志用） */
const PERIOD_LABELS: Record<KlinePeriod, string> = {
  d: '日线',
  w: '周线',
  m: '月线',
};

/** 获取主窗口（用于向渲染进程广播事件，参考 alertService 模式） */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

// 交易日历缓存（当日有效，存储交易日日期字符串数组）
let tradingCalendarCache: string[] | null = null;
let calendarCacheDate: string | null = null;

// 自动下载调度器状态
let downloadTimeout: NodeJS.Timeout | null = null;

/**
 * 判断证券代码是否有效（支持A股和基金）
 * @param stockCode 证券代码（6位数字）
 * @returns 是否为支持的证券类型
 */
function isValidSecurityCode(stockCode: string): boolean {
  // A股：深市主板(0)、创业板(3)、沪市主板(6)
  const isAStock = /^[036]\d{5}$/.test(stockCode);

  // 场内基金（ETF/LOF/货币）：前缀识别（上交所 50/51/52/56/58、深交所 15/16/18），复用共享识别逻辑
  const fund = isFund(stockCode) && /^\d{6}$/.test(stockCode);

  return isAStock || fund;
}

/**
 * 为证券代码添加市场前缀（用于stock-sdk调用）
 * @param stockCode 证券代码（纯数字）
 * @returns 带前缀的代码（如 sh510050、sz159915）
 */
function getStockCodeWithPrefix(stockCode: string): string {
  // 如果已经有前缀，直接返回
  if (stockCode.startsWith('sh') || stockCode.startsWith('sz') || stockCode.startsWith('bj')) {
    return stockCode;
  }

  // 场内基金（ETF/LOF/货币）：上交所 5 开头 → sh，深交所 1 开头 → sz
  // 复用共享 isFund，自动覆盖 50/51/52/56/58（科创板ETF）等全部基金前缀
  if (isFund(stockCode)) {
    return /^[5]/.test(stockCode) ? `sh${stockCode}` : `sz${stockCode}`;
  }

  // A股：沪市 6 开头 → sh，深市 0/3 开头 → sz
  if (/^[6]/.test(stockCode)) {
    return `sh${stockCode}`;
  }

  return `sz${stockCode}`;
}

/**
 * 验证证券代码是否合法（6位数字 + 支持的A股/基金类型）
 * @param stockCode 证券代码
 * @throws 代码无效时抛出错误
 */
export function validateSecurityCode(stockCode: string): void {
  // 验证股票代码为6位数字
  if (!stockCode || !/^\d{6}$/.test(stockCode)) {
    throw new Error('INVALID_STOCK_CODE: 股票代码必须为6位数字');
  }

  // 验证是否为支持的证券类型（A股或基金）
  if (!isValidSecurityCode(stockCode)) {
    throw new Error('INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金');
  }
}

/**
 * 验证日期范围（格式、先后顺序、不得晚于当前日期）
 * 单只下载与批量下载共用，保证校验口径一致
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @throws 日期无效时抛出错误
 */
export function validateDateRange(startDate: string, endDate: string): void {
  // 验证开始日期格式
  if (!startDate || !/^\d{8}$/.test(startDate)) {
    throw new Error('INVALID_DATE_RANGE: 开始日期格式无效，应为YYYYMMDD');
  }

  // 验证结束日期格式
  if (!endDate || !/^\d{8}$/.test(endDate)) {
    throw new Error('INVALID_DATE_RANGE: 结束日期格式无效，应为YYYYMMDD');
  }

  // 验证开始日期不晚于结束日期
  if (startDate > endDate) {
    throw new Error('INVALID_DATE_RANGE: 开始日期不能晚于结束日期');
  }

  // 验证结束日期不晚于当前日期
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (endDate > today) {
    throw new Error('INVALID_DATE_RANGE: 结束日期不能晚于当前日期');
  }
}

/**
 * 验证下载输入参数
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @throws 参数无效时抛出错误
 */
export function validateDownloadInput(stockCode: string, startDate: string, endDate: string): void {
  validateSecurityCode(stockCode);
  validateDateRange(startDate, endDate);
}

/**
 * 下载指定股票的K线数据
 * @param stockCode 股票代码（纯数字）
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @returns 下载结果
 */
/**
 * 下载单种复权类型的K线数据（内部辅助函数）
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustType 复权类型：'' 不复权 | 'qfq' 前复权
 * @returns 下载结果
 */
async function downloadSingleAdjust(
  stockCode: string,
  startDate: string,
  endDate: string,
  adjustType: '' | 'qfq',
  period: KlinePeriod = 'd'
): Promise<{ success: boolean; count?: number; error?: string }> {
  const periodLabel = PERIOD_LABELS[period] ?? '日线';
  const adjustLabel = adjustType === 'qfq' ? '前复权' : '不复权';
  try {
    // 判断证券类型并记录日志
    const securityType = /^(51|15|16|50|52|511)\d{4}$/.test(stockCode) ? '基金' : '股票';
    log.debug(`开始下载${securityType}${periodLabel}${adjustLabel}K线数据: ${stockCode}, ${startDate} ~ ${endDate}`);

    // 为stock-sdk添加市场前缀（基金需要正确的前缀才能获取数据）
    const codeWithPrefix = getStockCodeWithPrefix(stockCode);

    // 调用 stock-sdk 获取K线数据（周期由调用方指定，默认为日线）
    const klines = await sdk.getHistoryKline(codeWithPrefix, {
      period: SDK_PERIODS[period],
      adjust: adjustType,
      startDate,
      endDate,
    });

    // 保存到数据库（使用纯数字代码，按周期写入对应表）
    const count = saveKlineData(stockCode, klines, adjustType, period);

    log.debug(`${securityType}${periodLabel}${adjustLabel}K线数据下载完成: ${stockCode}, 共 ${count} 条`);
    return { success: true, count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    log.error(`${periodLabel}${adjustLabel}K线数据下载失败: ${stockCode}`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 手动下载K线数据（T111-T115：根据用户选择的复权类型下载）
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组（可选，默认 ['', 'qfq']）
 * @param period K线周期（默认日线）
 * @returns 下载结果（包含所选复权类型的统计）
 */
export async function downloadKline(
  stockCode: string,
  startDate: string,
  endDate: string,
  adjustTypes?: ('' | 'qfq')[],
  period: KlinePeriod = 'd'
): Promise<KlineDownloadResult> {
  // T112：如果未指定adjustTypes，默认下载两种类型
  const typesToDownload = adjustTypes && adjustTypes.length > 0 ? adjustTypes : ['', 'qfq'];
  const periodLabel = PERIOD_LABELS[period] ?? '日线';

  log.debug(`开始下载${periodLabel}K线数据: ${stockCode}, ${startDate} ~ ${endDate}, 复权类型: ${typesToDownload.map(t => t === '' ? '不复权' : '前复权').join(', ')}`);

  // T112：遍历adjustTypes数组，依次下载每种复权类型
  let unadjustedCount: number | undefined;
  let adjustedCount: number | undefined;
  let unadjustedError: string | undefined;
  let adjustedError: string | undefined;
  let overallSuccess = false;

  for (const adjustType of typesToDownload) {
    const result = await downloadSingleAdjust(stockCode, startDate, endDate, adjustType as '' | 'qfq', period);
    
    if (adjustType === '') {
      // 不复权
      if (result.success) {
        unadjustedCount = result.count;
        overallSuccess = true;
      } else {
        unadjustedError = result.error;
      }
    } else if (adjustType === 'qfq') {
      // 前复权
      if (result.success) {
        adjustedCount = result.count;
        overallSuccess = true;
      } else {
        adjustedError = result.error;
      }
    }
  }

  // 写入由引擎在事务提交时持久化，无需在此显式落盘

  const result: KlineDownloadResult = {
    success: overallSuccess,
    unadjustedCount,
    adjustedCount,
  };

  // T114：记录失败原因
  if (unadjustedError) {
    result.unadjustedError = unadjustedError;
  }
  if (adjustedError) {
    result.adjustedError = adjustedError;
  }

  // 兼容旧版字段
  result.count = (unadjustedCount || 0) + (adjustedCount || 0);
  if (!overallSuccess) {
    const errors: string[] = [];
    if (unadjustedError) errors.push(`不复权: ${unadjustedError}`);
    if (adjustedError) errors.push(`前复权: ${adjustedError}`);
    result.error = errors.join('; ') || '未知错误';
  }

  // 成功时只留 debug（批量下载时逐只刷屏无意义）；失败用 warn，便于按级别快速定位
  if (overallSuccess) {
    log.debug(`${periodLabel}K线数据下载完成: ${stockCode}, 不复权=${unadjustedCount || 0}条, 前复权=${adjustedCount || 0}条`);
  } else {
    log.warn(`${periodLabel}K线数据下载失败: ${stockCode}, ${result.error}`);
  }

  // 下载成功后广播 kline:updated，通知形态检测等消费方刷新缓存的 K 线数据
  // （覆盖手动下载与自动调度两条路径，二者都经过此函数）
  if (overallSuccess) {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('kline:updated', {
        stockCode,
        adjustTypes: typesToDownload,
        periods: [period],
      });
      log.debug(`已广播 kline:updated 事件: ${stockCode}, 周期: ${period}`);
    }
  }

  return result;
}

/**
 * 按本地时区拼 YYYYMMDD
 * 禁止使用 toISOString()：凌晨 0–8 点它给出的是前一天（UTC），会导致终点算错
 * @param date 目标日期（默认当前时间）
 * @returns YYYYMMDD
 */
export function localDateYmd(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** 交易日历日期（YYYY-MM-DD）转 YYYYMMDD */
function toYmd(date: string): string {
  return date.replace(/-/g, '');
}

/**
 * 读取交易日历（应用层同日复用缓存，SDK 层另有 12h TTL）
 * 异常向上抛出，由调用方决定回退规则
 * @returns 已排序的交易日日期字符串数组（YYYY-MM-DD）
 */
async function getTradingCalendarCached(): Promise<string[]> {
  const cacheKey = new Date().toISOString().slice(0, 10);
  if (calendarCacheDate === cacheKey && tradingCalendarCache !== null) {
    return tradingCalendarCache;
  }

  const calendar = await sdk.getTradingCalendar();
  tradingCalendarCache = calendar;
  calendarCacheDate = cacheKey;
  return calendar;
}

/**
 * 回退规则：排除周六周日，取不晚于今天的最近一日（本地时区）
 * @param today 基准日期（默认当前时间）
 * @returns YYYYMMDD
 */
export function lastWeekdayYmd(today: Date = new Date()): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return localDateYmd(date);
}

/**
 * 判断今天是否为交易日
 * 优先使用 stock-sdk 交易日历，API不可用时回退到周末排除规则
 * @returns 是否为交易日
 */
export async function isTradingDay(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  try {
    // 调用 stock-sdk 获取交易日历（返回交易日日期字符串数组）
    const calendar = await getTradingCalendarCached();
    const isOpen = calendar.includes(today);

    log.debug(`交易日历查询: ${today}, isOpen=${isOpen}`);
    return isOpen;
  } catch (error) {
    // API不可用时回退到周末排除规则
    log.warn(`交易日历API不可用，使用周末排除规则: ${error instanceof Error ? error.message : String(error)}`);
    const day = new Date().getDay();
    return day !== 0 && day !== 6;
  }
}

/**
 * 获取最近交易日：交易日历中不晚于「今天」的最后一天（本地时区口径）
 * 回退（任一情况都记 warn，且不得把过期日历的末条当作终点）：
 * - 日历为空
 * - 接口抛错
 * - 日历最后一条早于今天（年度文件未更新）
 * @param today 基准日期（默认当前时间，测试可注入）
 * @returns YYYYMMDD
 */
export async function getLastTradingDay(today: Date = new Date()): Promise<string> {
  const todayYmd = localDateYmd(today);

  try {
    const calendar = await getTradingCalendarCached();
    if (calendar.length === 0) {
      log.warn('交易日历为空，回退为排除周末规则计算最近交易日');
      return lastWeekdayYmd(today);
    }

    const lastYmd = toYmd(calendar[calendar.length - 1]);
    if (lastYmd < todayYmd) {
      log.warn(`交易日历最后一条 ${lastYmd} 早于今天 ${todayYmd}（日历未更新），回退为排除周末规则`);
      return lastWeekdayYmd(today);
    }

    // 日历含全年未来交易日，从后往前取最后一个 <= 今天
    for (let i = calendar.length - 1; i >= 0; i--) {
      const ymd = toYmd(calendar[i]);
      if (ymd <= todayYmd) {
        return ymd;
      }
    }

    log.warn(`交易日历中未找到不晚于 ${todayYmd} 的交易日，回退为排除周末规则`);
    return lastWeekdayYmd(today);
  } catch (error) {
    log.warn(`交易日历查询失败，回退为排除周末规则: ${error instanceof Error ? error.message : String(error)}`);
    return lastWeekdayYmd(today);
  }
}

/**
 * 带重试的K线数据下载
 * 首次失败后自动重试1次
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组（可选，默认 ['', 'qfq']）
 * @param period K线周期（默认日线）
 * @returns 下载结果
 */
export async function downloadWithRetry(
  stockCode: string,
  startDate: string,
  endDate: string,
  adjustTypes?: ('' | 'qfq')[],
  period: KlinePeriod = 'd'
): Promise<KlineDownloadResult> {
  // 首次尝试
  let result = await downloadKline(stockCode, startDate, endDate, adjustTypes, period);

  // 首次失败时重试1次
  if (!result.success) {
    log.warn(`K线数据下载失败，重试1次: ${stockCode}`);
    result = await downloadKline(stockCode, startDate, endDate, adjustTypes, period);
  }

  return result;
}

/** 批量下载互斥标志：同一时刻只允许一个批量任务（手动批量或定时自动） */
let batchDownloading = false;

/** 批量下载可选配置 */
export interface DownloadBatchOptions {
  /** 单只失败是否重试1次（默认 false；定时自动下载传 true） */
  retry?: boolean;
  /** 逐只进度回调（每只开始/完成时触发） */
  onProgress?: (payload: KlineBatchProgressPayload) => void;
}

/**
 * 判断当前是否已有批量下载任务在执行
 * @returns 是否有批量下载任务进行中
 */
export function isBatchDownloading(): boolean {
  return batchDownloading;
}

/**
 * 验证批量下载输入参数（整批预校验，任一非法则整批拒绝）
 * @param stockCodes 股票代码列表
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组（可选）
 * @throws 参数无效时抛出错误
 */
export function validateBatchDownloadInput(
  stockCodes: string[],
  startDate: string,
  endDate: string,
  adjustTypes?: ('' | 'qfq')[]
): void {
  if (!Array.isArray(stockCodes) || stockCodes.length === 0) {
    throw new Error('INVALID_STOCK_CODES: 请至少选择一只股票');
  }

  if (adjustTypes && adjustTypes.length === 0) {
    throw new Error('INVALID_ADJUST_TYPES: 请至少选择一种复权类型');
  }

  validateDateRange(startDate, endDate);

  for (const stockCode of stockCodes) {
    validateSecurityCode(stockCode);
  }
}

/**
 * 构建单只股票的批量下载结果
 * 成功判定：所选复权类型中至少一种返回条数大于0。
 * 接口未抛错但所选复权类型均返回0条时视为失败（与自动下载统计口径一致）。
 * @param downloadResult 单只下载结果
 * @param stockCode 股票代码
 * @param stockName 股票名称
 * @param adjustTypes 本次请求的复权类型
 * @returns 批量下载中的单只结果
 */
export function buildBatchStockResult(
  downloadResult: KlineDownloadResult,
  stockCode: string,
  stockName: string,
  adjustTypes: ('' | 'qfq')[],
  period: KlinePeriod = 'd'
): KlineBatchStockResult {
  const typesToCheck = adjustTypes.length > 0 ? adjustTypes : (['', 'qfq'] as ('' | 'qfq')[]);
  const result: KlineBatchStockResult = {
    stockCode,
    stockName,
    period,
    success: false,
  };

  if (typesToCheck.includes('')) {
    result.unadjustedCount = downloadResult.unadjustedCount ?? 0;
    if (downloadResult.unadjustedError) {
      result.unadjustedError = downloadResult.unadjustedError;
    }
  }

  if (typesToCheck.includes('qfq')) {
    result.adjustedCount = downloadResult.adjustedCount ?? 0;
    if (downloadResult.adjustedError) {
      result.adjustedError = downloadResult.adjustedError;
    }
  }

  result.success = typesToCheck.some(type =>
    type === '' ? (result.unadjustedCount ?? 0) > 0 : (result.adjustedCount ?? 0) > 0
  );

  if (!result.success) {
    const errors: string[] = [];
    if (typesToCheck.includes('') && result.unadjustedError) {
      errors.push(`不复权: ${result.unadjustedError}`);
    }
    if (typesToCheck.includes('qfq') && result.adjustedError) {
      errors.push(`前复权: ${result.adjustedError}`);
    }
    result.error = errors.length > 0 ? errors.join('; ') : (downloadResult.error || '未获取到K线数据');
  }

  return result;
}

/**
 * 汇总批量下载结果
 * @param results 逐只下载结果（按请求顺序）
 * @returns 批量下载汇总结果（全部成功时 success 为 true）
 */
export function buildBatchSummary(results: KlineBatchStockResult[]): KlineBatchDownloadSummary {
  const successCount = results.filter(result => result.success).length;
  const failedCount = results.length - successCount;

  return {
    success: failedCount === 0,
    total: results.length,
    successCount,
    failedCount,
    results,
  };
}

/**
 * 安全触发进度回调（回调异常不影响下载流程）
 * @param onProgress 进度回调
 * @param payload 进度负载
 */
function emitProgress(
  onProgress: ((payload: KlineBatchProgressPayload) => void) | undefined,
  payload: KlineBatchProgressPayload
): void {
  if (!onProgress) return;

  try {
    onProgress(payload);
  } catch (error) {
    log.warn(`批量下载进度回调异常: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 计算单只股票某周期的增量下载起点
 * 规则：
 * - 取「不复权最新日」与「前复权最新日」中更早的一天，包含该日（不 +1）
 * - 两者皆无数据 → 回退 EARLIEST_START_DATE（拉取全部历史）
 * - 起点晚于终点（库内脏数据）→ 钳制为终点
 * @param latest 该股在该周期表的两种复权最新日
 * @param endDate 本次下载终点（最近交易日，YYYYMMDD）
 * @returns 起点 YYYYMMDD
 */
export function computeIncrementalStartDate(
  latest: LatestTradeDateEntry | undefined,
  endDate: string
): string {
  const candidates = [latest?.unadjusted, latest?.adjusted].filter(
    (value): value is string => typeof value === 'string' && value !== ''
  );

  if (candidates.length === 0) {
    return EARLIEST_START_DATE;
  }

  // 取值异常（不是 YYYYMMDD）按「无法判定」处理：保守降级为只下载最近交易日，避免误拉全量历史
  if (candidates.some(value => !/^\d{8}$/.test(value))) {
    log.warn(`库内最新交易日格式异常（${candidates.join('/')}），本次起点降级为终点 ${endDate}`);
    return endDate;
  }

  const earliest = candidates.reduce((min, current) => (current < min ? current : min));
  return earliest > endDate ? endDate : earliest;
}

/**
 * 解析批量下载中单只股票的实际起点
 * - 未提供 → 整批 startDate（手动下载路径行为不变）
 * - 格式非法 → warn 并回退整批 startDate，不影响整批
 * - 晚于 endDate → 钳制为 endDate，避免脏数据让整批被日期校验拒绝
 * @param stock 股票项
 * @param batchStartDate 整批起始日
 * @param endDate 结束日
 * @returns 该股本次的起始日 YYYYMMDD
 */
export function resolveStockStartDate(
  stock: DownloadStockInput,
  batchStartDate: string,
  endDate: string
): string {
  const candidate = stock.startDate;
  if (!candidate) {
    return batchStartDate;
  }

  if (!/^\d{8}$/.test(candidate)) {
    log.warn(`股票 ${stock.stockCode} 的下载起始日非法（${candidate}），回退整批起始日 ${batchStartDate}`);
    return batchStartDate;
  }

  if (candidate > endDate) {
    log.warn(`股票 ${stock.stockCode} 的下载起始日 ${candidate} 晚于结束日 ${endDate}，已钳制为 ${endDate}`);
    return endDate;
  }

  return candidate;
}

/**
 * 汇总一批股票的实际下载起点（日志用，避免逐只刷屏）
 * @param stocks 已填入逐只起点的股票列表
 * @param batchStartDate 整批起始日（用作缺省值）
 * @param endDate 结束日
 * @returns 形如「20261113 ~ 20261117; 19900101 ~ 20261117」
 */
export function summarizeStartDates(
  stocks: DownloadStockInput[],
  batchStartDate: string,
  endDate: string
): string {
  const froms = Array.from(new Set(stocks.map(stock => stock.startDate ?? batchStartDate))).sort();
  return froms.map(from => `${from} ~ ${endDate}`).join('; ');
}

/**
 * 判断某只股票在某周期是否已补齐到 endDate
 * 判据：不复权与前复权的最新交易日都不早于 endDate（任一缺失或落后都算未完成）
 * @param latest 该股在该周期表的两种复权最新日
 * @param endDate 最近交易日 YYYYMMDD
 * @returns 是否已完整
 */
export function isPeriodComplete(latest: LatestTradeDateEntry | undefined, endDate: string): boolean {
  if (!latest) {
    return false;
  }
  const { unadjusted, adjusted } = latest;
  return !!unadjusted && !!adjusted && unadjusted >= endDate && adjusted >= endDate;
}

/** 单周期的待补清单 */
export interface PendingStockGroup {
  /** 需要补下载的股票（已填入逐只 startDate） */
  pending: DownloadStockInput[];
  /** 判定为已完整、无需下载的股票数 */
  completedCount: number;
}

/**
 * 收集某周期需要补下载的股票（启动补跑与定时任务共用）
 * 降级策略：查询异常时整批按「待补」处理且只下载最近交易日（无法区分「无数据」与「查询失败」，不冒拉全量的风险）；
 * 单只起点计算异常同样降级为 endDate。任何异常都不中断整批。
 * @param stocks 股票列表（无需提供 startDate）
 * @param period K线周期
 * @param endDate 最近交易日 YYYYMMDD
 * @returns 待补股票与已完整只数
 */
export function collectPendingStocks(
  stocks: DownloadStockInput[],
  period: KlinePeriod,
  endDate: string
): PendingStockGroup {
  let latestMap: Map<string, LatestTradeDateEntry>;
  try {
    latestMap = getLatestTradeDates(stocks.map(stock => stock.stockCode), period);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      `查询${PERIOD_LABELS[period]}库内最新交易日失败，本次按全部待补处理（仅下载最近交易日 ${endDate}）: ${message}`
    );
    return { pending: stocks.map(stock => ({ ...stock, startDate: endDate })), completedCount: 0 };
  }

  const pending: DownloadStockInput[] = [];
  let completedCount = 0;

  for (const stock of stocks) {
    const latest = latestMap.get(stock.stockCode);
    try {
      if (isPeriodComplete(latest, endDate)) {
        completedCount++;
        continue;
      }
      pending.push({ ...stock, startDate: computeIncrementalStartDate(latest, endDate) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`计算 ${stock.stockCode} ${PERIOD_LABELS[period]}下载起点失败，降级为 ${endDate}: ${message}`);
      pending.push({ ...stock, startDate: endDate });
    }
  }

  return { pending, completedCount };
}

/**
 * 批量下载多只股票的K线数据
 * - 整批预校验（日期、复权类型、证券代码），任一非法则整批不启动
 * - 按入参顺序串行下载（避免并发触发数据源限流）
 * - 每只开始/完成时通过 onProgress 推送进度
 * - 与定时自动下载共享互斥标志，同一时刻只允许一个批量任务
 * - 每只股票的写入在各自事务内提交并立即持久化
 * @param stocks 待下载的股票列表（代码 + 名称，可选逐只 startDate；缺省用整批 startDate）
 * @param startDate 整批默认开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组
 * @param options 可选配置（重试、进度回调）
 * @returns 批量下载汇总结果
 */
export async function downloadBatch(
  stocks: DownloadStockInput[],
  startDate: string,
  endDate: string,
  adjustTypes: ('' | 'qfq')[],
  period: KlinePeriod = 'd',
  options: DownloadBatchOptions = {}
): Promise<KlineBatchDownloadSummary> {
  // 互斥：已有批量任务（手动或定时）在执行时直接拒绝
  if (batchDownloading) {
    throw new Error('BATCH_DOWNLOAD_IN_PROGRESS: 已有批量下载任务正在进行中');
  }

  const typesToDownload = adjustTypes.length > 0 ? adjustTypes : (['', 'qfq'] as ('' | 'qfq')[]);

  // 整批预校验：任一非法则整批不启动（逐只起点在循环内单独校验与钳制）
  validateBatchDownloadInput(stocks.map(stock => stock.stockCode), startDate, endDate, typesToDownload);

  batchDownloading = true;
  const total = stocks.length;
  const results: KlineBatchStockResult[] = [];
  const periodLabel = PERIOD_LABELS[period] ?? '日线';

  log.info(
    `开始批量下载${periodLabel}K线数据: 共 ${total} 只, 区间 ${summarizeStartDates(stocks, startDate, endDate)}, 复权类型: ${typesToDownload.map(type => (type === '' ? '不复权' : '前复权')).join(', ')}`
  );

  try {
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      const index = i + 1;
      // 逐只起点：自动增量下载为每只股票填入各自起点；手动批量下载缺省用整批 startDate
      const from = resolveStockStartDate(stock, startDate, endDate);

      emitProgress(options.onProgress, {
        phase: 'started',
        index,
        total,
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        period,
        startDate: from,
      });

      let downloadResult: KlineDownloadResult;
      try {
        log.debug(`${periodLabel}下载区间: ${stock.stockCode}, ${from} ~ ${endDate}`);
        downloadResult = options.retry
          ? await downloadWithRetry(stock.stockCode, from, endDate, typesToDownload, period)
          : await downloadKline(stock.stockCode, from, endDate, typesToDownload, period);
      } catch (error) {
        downloadResult = {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        };
      }

      const result = buildBatchStockResult(downloadResult, stock.stockCode, stock.stockName, typesToDownload, period);
      results.push(result);

      emitProgress(options.onProgress, {
        phase: 'completed',
        index,
        total,
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        period,
        startDate: from,
        result,
      });
    }
  } finally {
    batchDownloading = false;
  }

  const summary = buildBatchSummary(results);
  log.info(`批量下载${periodLabel}K线数据完成: 共 ${summary.total} 只, 成功 ${summary.successCount} 只, 失败 ${summary.failedCount} 只`);

  for (const result of results) {
    if (!result.success) {
      log.warn(`  下载失败: ${result.stockCode} ${result.stockName} - ${result.error || '未知错误'}`);
    }
  }

  return summary;
}

/** 自动下载的周期顺序：日线优先，其次周线、月线 */
const AUTO_DOWNLOAD_PERIODS: KlinePeriod[] = ['d', 'w', 'm'];

/**
 * 执行自动下载（增量 + 完整性判定）
 * - 终点：交易日历中不晚于今天（本地时区）的最近交易日
 * - 逐周期、逐股票判断是否已补齐（不复权与前复权的最新日均不早于终点才算完成）
 * - 只对未完成的股票发起下载，起点取库内最新日（库内无数据回退 EARLIEST_START_DATE）
 * - 三周期全部完成时不做任何请求，仅记录「当日 K 线已完整」
 * - 单周期失败不阻断后续周期；与其它批量任务互斥时直接退出
 * @remarks 增量模式只保证「从库内最新数据往后接续」：
 *          库内已有中间缺口、以及除权除息导致的前复权基准不一致，均不在自动流程中修复，
 *          需由用户通过手动指定区间重下（见 openspec kline-download 规格「增量下载的正确性边界」）。
 */
export async function performAutoDownload(): Promise<void> {
  log.info('开始执行K线数据自动下载（增量，双复权类型）...');

  // 判断是否为交易日
  const isTradeDay = await isTradingDay();
  if (!isTradeDay) {
    log.info('非交易日，跳过K线数据下载');
    return;
  }

  // 获取所有自选股
  const watchlist = getWatchlist();
  if (watchlist.length === 0) {
    log.info('自选股列表为空，跳过K线数据下载');
    return;
  }

  // 终点：不晚于今天（本地时区）的最近交易日；getLastTradingDay 内部已按规则兜底，不会抛错
  const endDate = await getLastTradingDay();
  const baseStocks: DownloadStockInput[] = watchlist.map(stock => ({
    stockCode: stock.stockCode,
    stockName: stock.stockName,
  }));

  let pendingTotal = 0;

  for (const period of AUTO_DOWNLOAD_PERIODS) {
    const { pending, completedCount } = collectPendingStocks(baseStocks, period, endDate);

    if (pending.length === 0) {
      log.info(`${PERIOD_LABELS[period]}已完整，跳过下载: 共 ${completedCount} 只`);
      continue;
    }

    pendingTotal += pending.length;
    log.info(
      `${PERIOD_LABELS[period]}待补 ${pending.length} 只（已完成跳过 ${completedCount} 只）, 区间 ${summarizeStartDates(pending, endDate, endDate)}`
    );

    let summary: KlineBatchDownloadSummary;
    try {
      // 整批缺省起点用 endDate：逐只起点已填好，缺省值只用于单只起点异常时的回退
      summary = await downloadBatch(pending, endDate, endDate, ['', 'qfq'], period, { retry: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('BATCH_DOWNLOAD_IN_PROGRESS')) {
        log.info('已有批量下载任务正在进行中，跳过本次自动下载');
        return;
      }
      // 单周期失败不阻断后续周期（与「周/月线失败不影响日线判定」一致）
      log.error(`${PERIOD_LABELS[period]}自动下载失败: ${message}`);
      continue;
    }

    log.info(
      `${PERIOD_LABELS[period]}自动下载完成: 共 ${summary.total} 只, 成功 ${summary.successCount} 只, 失败 ${summary.failedCount} 只`
    );
  }

  if (pendingTotal === 0) {
    log.info('当日K线已完整（日线/周线/月线），跳过自动下载');
  }
}

/**
 * 判断当前是否已过每日自动下载的计划时刻（本地时区，含等于）
 * @param now 当前时间（测试可注入）
 * @returns 是否已到/已过 15:10
 */
export function isPastDailyScheduleTime(now: Date = new Date()): boolean {
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);
  return now.getTime() >= target.getTime();
}

/**
 * 启动补跑：应用在计划时刻（15:10）之后启动时，检查当日 K 线是否完整，未完成则补齐
 * 已在计划时刻之前启动的实例不触发，交由当天的定时任务处理
 * @returns 无返回；异常只记录日志，不影响应用启动
 */
export async function runStartupCatchUp(): Promise<void> {
  if (!isPastDailyScheduleTime()) {
    log.info(`未到每日自动下载时刻（${SCHEDULE_HOUR}:${String(SCHEDULE_MINUTE).padStart(2, '0')}），启动补跑不触发`);
    return;
  }

  log.info('已过每日自动下载时刻，检查当日K线完整性...');
  try {
    await performAutoDownload();
  } catch (error) {
    log.error(`启动补跑失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 计算下一次自动下载的目标时刻
 * - 目标为当天 15:10
 * - 距目标不足 MIN_LEAD_MS（含已过）视为已过，顺延到次日，避免「提前触发后又排当天一次」
 * - 顺延后继续跳过周六、周日
 * @param now 当前时间（测试可注入）
 * @returns 下一次目标时刻
 */
export function computeNextScheduleTarget(now: Date = new Date()): Date {
  const target = new Date(now.getTime());
  target.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);

  if (now.getTime() + MIN_LEAD_MS >= target.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  // 检查目标日期是否为周末，如果是则跳到下周一
  let dayOfWeek = target.getDay();
  while (dayOfWeek === 0 || dayOfWeek === 6) {
    target.setDate(target.getDate() + 1);
    dayOfWeek = target.getDay();
  }

  return target;
}

/**
 * 调度下一次自动下载
 * 计算到下一个15:10的延迟，触发后执行下载并递归调度
 */
function scheduleNextDownload(): void {
  const now = new Date();
  const target = computeNextScheduleTarget(now);
  const delay = target.getTime() - now.getTime();

  log.info(`⏰ 下次K线自动下载调度于: ${target.toLocaleString()} (延迟 ${Math.round(delay / 1000 / 60)} 分钟)`);

  downloadTimeout = setTimeout(async () => {
    await performAutoDownload();
    scheduleNextDownload(); // 递归调度下一次
  }, delay);
}

/**
 * 启动K线数据自动下载调度器
 */
export function startKlineDownloadScheduler(): void {
  log.info('🔄 启动K线数据自动下载调度器');
  scheduleNextDownload();
}

/**
 * 停止K线数据自动下载调度器
 */
export function stopKlineDownloadScheduler(): void {
  if (downloadTimeout) {
    clearTimeout(downloadTimeout);
    downloadTimeout = null;
    log.info('⏹️  K线数据自动下载调度器已停止');
  }
}

/**
 * 获取K线图展示数据（从数据库读取，支持周期与前复权/不复权切换）
 * @param stockCode 股票代码（纯数字）
 * @param adjust 复权类型：'qfq' 前复权 | '' 不复权
 * @param period K线周期：d 日线 | w 周线 | m 月线（决定查询的数据表）
 * @returns K线数据数组，按交易日期升序排列
 */
export async function getChartData(
  stockCode: string,
  adjust: 'qfq' | '',
  period: KlinePeriod = 'd'
): Promise<KlineData[]> {
  try {
    // adjust 参数已经是数据库使用的格式，无需转换
    log.debug(`获取K线图展示数据（从数据库）: ${stockCode}, 周期: ${period}, 复权方式: ${adjust}`);

    // 从数据库查询对应周期与复权类型的K线数据
    const result = dbGetChartData(stockCode, adjust, period);

    log.debug(`K线图展示数据获取成功: ${stockCode}, 共 ${result.length} 条`);
    return result;
  } catch (error) {
    log.error(`获取K线图展示数据失败: ${stockCode}`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
