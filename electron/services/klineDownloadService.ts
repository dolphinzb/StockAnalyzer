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
  KlineBatchDownloadSummary,
  KlineBatchProgressPayload,
  KlineBatchStockResult,
  KlineData,
  KlineDownloadResult
} from '../../shared/types';
import { isFund } from '../../shared/utils/securities';
import { getWatchlist, saveKlineData, getChartData as dbGetChartData } from '../database';

// StockSDK 模块级单例
const sdk = new StockSDK();

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
  adjustType: '' | 'qfq'
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    // 判断证券类型并记录日志
    const securityType = /^(51|15|16|50|52|511)\d{4}$/.test(stockCode) ? '基金' : '股票';
    log.info(`开始下载${securityType}${adjustType === 'qfq' ? '前复权' : '不复权'}K线数据: ${stockCode}, ${startDate} ~ ${endDate}`);

    // 为stock-sdk添加市场前缀（基金需要正确的前缀才能获取数据）
    const codeWithPrefix = getStockCodeWithPrefix(stockCode);
    log.info(`使用代码格式: ${codeWithPrefix}`);

    // 调用 stock-sdk 获取K线数据
    const klines = await sdk.getHistoryKline(codeWithPrefix, {
      period: 'daily',
      adjust: adjustType,
      startDate,
      endDate,
    });

    // 保存到数据库（使用纯数字代码）
    const count = saveKlineData(stockCode, klines, adjustType);

    log.info(`${securityType}${adjustType === 'qfq' ? '前复权' : '不复权'}K线数据下载完成: ${stockCode}, 共 ${count} 条`);
    return { success: true, count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    log.error(`${adjustType === 'qfq' ? '前复权' : '不复权'}K线数据下载失败: ${stockCode}`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 手动下载K线数据（T111-T115：根据用户选择的复权类型下载）
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组（可选，默认 ['', 'qfq']）
 * @returns 下载结果（包含所选复权类型的统计）
 */
export async function downloadKline(
  stockCode: string,
  startDate: string,
  endDate: string,
  adjustTypes?: ('' | 'qfq')[]
): Promise<KlineDownloadResult> {
  // T112：如果未指定adjustTypes，默认下载两种类型
  const typesToDownload = adjustTypes && adjustTypes.length > 0 ? adjustTypes : ['', 'qfq'];
  
  log.info(`开始下载K线数据: ${stockCode}, ${startDate} ~ ${endDate}, 复权类型: ${typesToDownload.map(t => t === '' ? '不复权' : '前复权').join(', ')}`);

  // T112：遍历adjustTypes数组，依次下载每种复权类型
  let unadjustedCount: number | undefined;
  let adjustedCount: number | undefined;
  let unadjustedError: string | undefined;
  let adjustedError: string | undefined;
  let overallSuccess = false;

  for (const adjustType of typesToDownload) {
    const result = await downloadSingleAdjust(stockCode, startDate, endDate, adjustType as '' | 'qfq');
    
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

  log.info(`K线数据下载完成: ${stockCode}, 不复权=${unadjustedCount || 0}条, 前复权=${adjustedCount || 0}条`);

  // 下载成功后广播 kline:updated，通知形态检测等消费方刷新缓存的 K 线数据
  // （覆盖手动下载与自动调度两条路径，二者都经过此函数）
  if (overallSuccess) {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('kline:updated', {
        stockCode,
        adjustTypes: typesToDownload,
      });
      log.info(`已广播 kline:updated 事件: ${stockCode}`);
    }
  }

  return result;
}

/**
 * 判断今天是否为交易日
 * 优先使用 stock-sdk 交易日历，API不可用时回退到周末排除规则
 * @returns 是否为交易日
 */
export async function isTradingDay(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);

  // 检查缓存是否有效（同一天内复用）
  if (calendarCacheDate === today && tradingCalendarCache !== null) {
    return tradingCalendarCache.includes(today);
  }

  try {
    // 调用 stock-sdk 获取交易日历（返回交易日日期字符串数组）
    const calendar = await sdk.getTradingCalendar();

    // 更新缓存
    tradingCalendarCache = calendar;
    calendarCacheDate = today;

    const isOpen = calendar.includes(today);

    log.info(`交易日历查询: ${today}, isOpen=${isOpen}`);
    return isOpen;
  } catch (error) {
    // API不可用时回退到周末排除规则
    log.warn(`交易日历API不可用，使用周末排除规则: ${error instanceof Error ? error.message : String(error)}`);
    const day = new Date().getDay();
    return day !== 0 && day !== 6;
  }
}

/**
 * 带重试的K线数据下载
 * 首次失败后自动重试1次
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组（可选，默认 ['', 'qfq']）
 * @returns 下载结果
 */
export async function downloadWithRetry(
  stockCode: string,
  startDate: string,
  endDate: string,
  adjustTypes?: ('' | 'qfq')[]
): Promise<KlineDownloadResult> {
  // 首次尝试
  let result = await downloadKline(stockCode, startDate, endDate, adjustTypes);

  // 首次失败时重试1次
  if (!result.success) {
    log.info(`K线数据下载重试: ${stockCode}`);
    result = await downloadKline(stockCode, startDate, endDate, adjustTypes);
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
  adjustTypes: ('' | 'qfq')[]
): KlineBatchStockResult {
  const typesToCheck = adjustTypes.length > 0 ? adjustTypes : (['', 'qfq'] as ('' | 'qfq')[]);
  const result: KlineBatchStockResult = {
    stockCode,
    stockName,
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
 * 批量下载多只股票的K线数据
 * - 整批预校验（日期、复权类型、证券代码），任一非法则整批不启动
 * - 按入参顺序串行下载（避免并发触发数据源限流）
 * - 每只开始/完成时通过 onProgress 推送进度
 * - 与定时自动下载共享互斥标志，同一时刻只允许一个批量任务
 * @param stocks 待下载的股票列表（代码 + 名称）
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @param adjustTypes 复权类型数组
 * @param options 可选配置（重试、进度回调）
 * @returns 批量下载汇总结果
 */
export async function downloadBatch(
  stocks: { stockCode: string; stockName: string }[],
  startDate: string,
  endDate: string,
  adjustTypes: ('' | 'qfq')[],
  options: DownloadBatchOptions = {}
): Promise<KlineBatchDownloadSummary> {
  // 互斥：已有批量任务（手动或定时）在执行时直接拒绝
  if (batchDownloading) {
    throw new Error('BATCH_DOWNLOAD_IN_PROGRESS: 已有批量下载任务正在进行中');
  }

  const typesToDownload = adjustTypes.length > 0 ? adjustTypes : (['', 'qfq'] as ('' | 'qfq')[]);

  // 整批预校验：任一非法则整批不启动
  validateBatchDownloadInput(stocks.map(stock => stock.stockCode), startDate, endDate, typesToDownload);

  batchDownloading = true;
  const total = stocks.length;
  const results: KlineBatchStockResult[] = [];

  log.info(`开始批量下载K线数据: 共 ${total} 只, ${startDate} ~ ${endDate}, 复权类型: ${typesToDownload.map(type => (type === '' ? '不复权' : '前复权')).join(', ')}`);

  try {
    for (let i = 0; i < stocks.length; i++) {
      const stock = stocks[i];
      const index = i + 1;

      emitProgress(options.onProgress, {
        phase: 'started',
        index,
        total,
        stockCode: stock.stockCode,
        stockName: stock.stockName,
      });

      let downloadResult: KlineDownloadResult;
      try {
        downloadResult = options.retry
          ? await downloadWithRetry(stock.stockCode, startDate, endDate, typesToDownload)
          : await downloadKline(stock.stockCode, startDate, endDate, typesToDownload);
      } catch (error) {
        downloadResult = {
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        };
      }

      const result = buildBatchStockResult(downloadResult, stock.stockCode, stock.stockName, typesToDownload);
      results.push(result);

      emitProgress(options.onProgress, {
        phase: 'completed',
        index,
        total,
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        result,
      });
    }
  } finally {
    batchDownloading = false;
  }

  const summary = buildBatchSummary(results);
  log.info(`批量下载K线数据完成: 共 ${summary.total} 只, 成功 ${summary.successCount} 只, 失败 ${summary.failedCount} 只`);

  for (const result of results) {
    if (!result.success) {
      log.info(`  下载失败: ${result.stockCode} ${result.stockName} - ${result.error || '未知错误'}`);
    }
  }

  return summary;
}

/**
 * 执行自动下载所有自选股当日K线数据
 * 复用 downloadBatch：串行逐只下载两种复权类型，失败重试1次，结果记录到日志
 */
export async function performAutoDownload(): Promise<void> {
  log.info('开始执行K线数据自动下载（双复权类型）...');

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

  // 获取今天的日期 (YYYYMMDD)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  let summary: KlineBatchDownloadSummary;
  try {
    summary = await downloadBatch(
      watchlist.map(stock => ({ stockCode: stock.stockCode, stockName: stock.stockName })),
      today,
      today,
      ['', 'qfq'],
      { retry: true }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith('BATCH_DOWNLOAD_IN_PROGRESS')) {
      log.info('已有批量下载任务正在进行中，跳过本次自动下载');
      return;
    }
    log.error(`K线数据自动下载失败: ${message}`);
    return;
  }

  // 按复权类型统计（口径与批量下载一致：条数 > 0 计成功）
  const unadjustedFailedStocks = summary.results.filter(result => (result.unadjustedCount ?? 0) <= 0);
  const adjustedFailedStocks = summary.results.filter(result => (result.adjustedCount ?? 0) <= 0);
  const unadjustedSuccessCount = summary.total - unadjustedFailedStocks.length;
  const adjustedSuccessCount = summary.total - adjustedFailedStocks.length;

  // 记录汇总日志
  log.info(`K线数据自动下载完成，共 ${summary.total} 只股票`);
  log.info(`  不复权: ${unadjustedSuccessCount} 只成功, ${unadjustedFailedStocks.length} 只失败`);
  log.info(`  前复权: ${adjustedSuccessCount} 只成功, ${adjustedFailedStocks.length} 只失败`);

  // 记录不复权失败的股票
  for (const failed of unadjustedFailedStocks) {
    log.info(`  不复权失败: ${failed.stockCode} ${failed.stockName} - ${failed.unadjustedError || failed.error || '未知错误'}`);
  }

  // 记录前复权失败的股票
  for (const failed of adjustedFailedStocks) {
    log.info(`  前复权失败: ${failed.stockCode} ${failed.stockName} - ${failed.adjustedError || failed.error || '未知错误'}`);
  }
}

/**
 * 调度下一次自动下载
 * 计算到下一个15:10的延迟，触发后执行下载并递归调度
 */
function scheduleNextDownload(): void {
  const now = new Date();
  const target = new Date();

  // 设置目标时间为今天15:10
  target.setHours(15, 10, 0, 0);

  // 如果今天15:10已过，则调度明天
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  // 检查目标日期是否为周末，如果是则跳到下周一
  let dayOfWeek = target.getDay();
  while (dayOfWeek === 0 || dayOfWeek === 6) {
    target.setDate(target.getDate() + 1);
    dayOfWeek = target.getDay();
  }

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
 * 获取K线图展示数据（支持前复权/不复权）
 * 通过 stock-sdk 的 adjust 参数获取对应复权类型的K线数据
 * @param stockCode 股票代码（纯数字）
 * @param adjust 复权方式：'qfq' 前复权 | '' 不复权
 * @returns K线数据数组
 */
/**
 * 获取K线图展示数据（从数据库读取，支持前复权/不复权切换）
 * @param stockCode 股票代码
 * @param adjust 复权类型：'qfq' 前复权 | '' 不复权
 * @returns K线数据数组，按交易日期升序排列
 */
export async function getChartData(stockCode: string, adjust: 'qfq' | ''): Promise<KlineData[]> {
  try {
    // adjust 参数已经是数据库使用的格式，无需转换
    log.info(`获取K线图展示数据（从数据库）: ${stockCode}, 复权方式: ${adjust}`);

    // 从数据库查询对应复权类型的K线数据
    const result = dbGetChartData(stockCode, adjust);

    log.info(`K线图展示数据获取成功: ${stockCode}, 共 ${result.length} 条`);
    return result;
  } catch (error) {
    log.error(`获取K线图展示数据失败: ${stockCode}`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
