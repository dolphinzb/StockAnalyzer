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

import log from 'electron-log';
import { StockSDK } from 'stock-sdk';
import type { KlineData, KlineDownloadResult } from '../../shared/types';
import { getWatchlist, saveKlineData, getChartData as dbGetChartData } from '../database';

// StockSDK 模块级单例
const sdk = new StockSDK();

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
  
  // 基金：上交所ETF(51)、深交所ETF(15)、深交所LOF(16)、上交所LOF(50)、上交所货币基金(52)、上交所债券ETF(511)
  const isFund = /^(51|15|16|50|52|511)\d{4}$/.test(stockCode);
  
  return isAStock || isFund;
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
  
  // 沪市股票和基金（6开头股票、51/50/52/511开头基金）
  if (/^[6]/.test(stockCode) || /^(51|50|52|511)/.test(stockCode)) {
    return `sh${stockCode}`;
  }
  
  // 深市股票和基金（0/3开头股票、15/16开头基金）
  if (/^[03]/.test(stockCode) || /^(15|16)/.test(stockCode)) {
    return `sz${stockCode}`;
  }
  
  // 默认返回深市格式
  return `sz${stockCode}`;
}

/**
 * 判断股票代码是否为A股（已废弃，使用 isValidSecurityCode 替代）
 * @deprecated 请使用 isValidSecurityCode()
 * A股代码规则：6位数字，以0（深市主板）、3（创业板）、6（沪市主板）开头
 * @param stockCode 股票代码
 * @returns 是否为A股
 */
function isAStockCode(stockCode: string): boolean {
  return /^\d{6}$/.test(stockCode) && /^[036]/.test(stockCode);
}

/**
 * 验证下载输入参数
 * @param stockCode 股票代码
 * @param startDate 开始日期 (YYYYMMDD)
 * @param endDate 结束日期 (YYYYMMDD)
 * @throws 参数无效时抛出错误
 */
export function validateDownloadInput(stockCode: string, startDate: string, endDate: string): void {
  // 验证股票代码为6位数字
  if (!stockCode || !/^\d{6}$/.test(stockCode)) {
    throw new Error('INVALID_STOCK_CODE: 股票代码必须为6位数字');
  }

  // 验证是否为支持的证券类型（A股或基金）
  if (!isValidSecurityCode(stockCode)) {
    throw new Error('INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金');
  }

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
 * @returns 下载结果
 */
export async function downloadWithRetry(stockCode: string, startDate: string, endDate: string): Promise<KlineDownloadResult> {
  // 首次尝试
  let result = await downloadKline(stockCode, startDate, endDate);

  // 首次失败时重试1次
  if (!result.success) {
    log.info(`K线数据下载重试: ${stockCode}`);
    result = await downloadKline(stockCode, startDate, endDate);
  }

  return result;
}

/**
 * 执行自动下载所有自选股当日K线数据
 * 串行逐只下载两种复权类型（股票A不复权→前复权→股票B...），失败重试1次，结果记录到日志
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

  // 分别统计不复权和前复权的成功/失败数量
  let unadjustedSuccessCount = 0;
  let unadjustedFailCount = 0;
  let adjustedSuccessCount = 0;
  let adjustedFailCount = 0;
  
  const unadjustedFailedStocks: { stockCode: string; stockName: string; error: string }[] = [];
  const adjustedFailedStocks: { stockCode: string; stockName: string; error: string }[] = [];

  // 串行逐只下载：每只股票依次下载不复权→前复权
  for (const stock of watchlist) {
    try {
      const result = await downloadWithRetry(stock.stockCode, today, today);
      
      // 统计不复权结果
      if (result.unadjustedCount !== undefined && result.unadjustedCount > 0) {
        unadjustedSuccessCount++;
      } else {
        unadjustedFailCount++;
        unadjustedFailedStocks.push({
          stockCode: stock.stockCode,
          stockName: stock.stockName,
          error: result.unadjustedError || '未知错误',
        });
      }
      
      // 统计前复权结果
      if (result.adjustedCount !== undefined && result.adjustedCount > 0) {
        adjustedSuccessCount++;
      } else {
        adjustedFailCount++;
        adjustedFailedStocks.push({
          stockCode: stock.stockCode,
          stockName: stock.stockName,
          error: result.adjustedError || '未知错误',
        });
      }
    } catch (error) {
      // 异常情况下，两种复权类型都标记为失败
      unadjustedFailCount++;
      adjustedFailCount++;
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      unadjustedFailedStocks.push({
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        error: errorMsg,
      });
      adjustedFailedStocks.push({
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        error: errorMsg,
      });
    }
  }

  // 记录汇总日志
  const totalCount = watchlist.length;
  log.info(`K线数据自动下载完成，共 ${totalCount} 只股票`);
  log.info(`  不复权: ${unadjustedSuccessCount} 只成功, ${unadjustedFailCount} 只失败`);
  log.info(`  前复权: ${adjustedSuccessCount} 只成功, ${adjustedFailCount} 只失败`);
  
  // 记录不复权失败的股票
  if (unadjustedFailedStocks.length > 0) {
    for (const failed of unadjustedFailedStocks) {
      log.info(`  不复权失败: ${failed.stockCode} ${failed.stockName} - ${failed.error}`);
    }
  }
  
  // 记录前复权失败的股票
  if (adjustedFailedStocks.length > 0) {
    for (const failed of adjustedFailedStocks) {
      log.info(`  前复权失败: ${failed.stockCode} ${failed.stockName} - ${failed.error}`);
    }
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
