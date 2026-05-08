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
import type { KlineDownloadResult } from '../../shared/types';
import { getWatchlist, saveKlineData } from '../database';

// StockSDK 模块级单例
const sdk = new StockSDK();

// 交易日历缓存（当日有效，存储交易日日期字符串数组）
let tradingCalendarCache: string[] | null = null;
let calendarCacheDate: string | null = null;

// 自动下载调度器状态
let downloadTimeout: NodeJS.Timeout | null = null;

/**
 * 判断股票代码是否为A股
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

  // 验证是否为A股代码
  if (!isAStockCode(stockCode)) {
    throw new Error('INVALID_STOCK_CODE: 不支持的股票类型，仅支持A股');
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
export async function downloadKline(stockCode: string, startDate: string, endDate: string): Promise<KlineDownloadResult> {
  try {
    log.info(`开始下载K线数据: ${stockCode}, ${startDate} ~ ${endDate}`);

    // 调用 stock-sdk 获取不复权日K线数据
    const klines = await sdk.getHistoryKline(stockCode, {
      period: 'daily',
      adjust: '',       // 不复权原始数据
      startDate,
      endDate,
    });

    // 保存到数据库
    const count = saveKlineData(stockCode, klines);

    log.info(`K线数据下载完成: ${stockCode}, 共 ${count} 条`);
    return { success: true, count };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    log.error(`K线数据下载失败: ${stockCode}`, errorMessage);
    return { success: false, error: errorMessage };
  }
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
 * 串行逐只下载，失败重试1次，结果记录到日志
 */
export async function performAutoDownload(): Promise<void> {
  log.info('开始执行K线数据自动下载...');

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

  let successCount = 0;
  let failCount = 0;
  const failedStocks: { stockCode: string; stockName: string; error: string }[] = [];

  // 串行逐只下载
  for (const stock of watchlist) {
    try {
      const result = await downloadWithRetry(stock.stockCode, today, today);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
        failedStocks.push({
          stockCode: stock.stockCode,
          stockName: stock.stockName,
          error: result.error || '未知错误',
        });
      }
    } catch (error) {
      failCount++;
      failedStocks.push({
        stockCode: stock.stockCode,
        stockName: stock.stockName,
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  }

  // 记录汇总日志
  const totalCount = watchlist.length;
  if (failCount === 0) {
    log.info(`K线数据自动下载完成，共 ${totalCount} 只股票，全部成功`);
  } else {
    log.info(`K线数据自动下载完成，共 ${totalCount} 只股票，${successCount} 只成功，${failCount} 只失败`);
    for (const failed of failedStocks) {
      log.info(`  失败: ${failed.stockCode} ${failed.stockName} - ${failed.error}`);
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
