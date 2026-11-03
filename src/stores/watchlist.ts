import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AddStockInput, Alert, IndexData, IndexDataState, KlineBatchDownloadInput, KlineBatchDownloadSummary, KlineBatchProgressPayload, KlineBatchStockResult, KlineDownloadResult, PriceUpdate, UpdateStockInput, WatchlistStock } from '../types';

/** 批量下载中单只股票状态 */
export type BatchStockStatus = 'pending' | 'downloading' | 'success' | 'failed';

/** 批量下载中单只股票的状态项 */
export interface BatchStockItemState {
  stockCode: string;
  stockName: string;
  status: BatchStockStatus;
  result?: KlineBatchStockResult;
  error?: string;
}

/** 批量下载整体状态 */
export interface BatchDownloadState {
  isRunning: boolean;
  total: number;
  completed: number;
  items: Map<string, BatchStockItemState>;
  summary: KlineBatchDownloadSummary | null;
}

export const useWatchlistStore = defineStore('watchlist', () => {
  const stocks = ref<WatchlistStock[]>([]);
  const lastRefreshTime = ref<string | null>(null);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const alerts = ref<Alert[]>([]);
  const priceMap = ref<Map<string, PriceUpdate>>(new Map());

  // K线下载状态管理（T107：更新类型定义，支持存储不同复权类型的下载结果）
  const downloadStatusMap = ref<Map<string, { isDownloading: boolean; result?: KlineDownloadResult | null }>>(new Map());

  // 批量下载状态（逐只状态 + 汇总，弹窗展示用）
  const batchDownloadState = ref<BatchDownloadState>({
    isRunning: false,
    total: 0,
    completed: 0,
    items: new Map(),
    summary: null,
  });

  // K线弹窗状态
  const klineChartDialog = ref<{
    visible: boolean;
    stockCode: string;
    stockName: string;
  }>({
    visible: false,
    stockCode: '',
    stockName: '',
  });

  // 指数数据状态
  const indexDataState = ref<IndexDataState>({
    indices: [],
    status: 'normal',
    errorMessage: null,
    isLoading: false,
  });

  const enabledStocks = computed(() =>
    stocks.value.filter(s => s.monitorEnabled)
  );

  // 是否有批量下载任务在执行（按钮禁用/弹窗锁定用）
  const isBatchDownloading = computed(() => batchDownloadState.value.isRunning);

  const sortedStocks = computed(() => {
    return [...stocks.value].sort((a, b) => {
      if (a.monitorEnabled !== b.monitorEnabled) {
        return a.monitorEnabled ? -1 : 1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  });

  function getCurrentPrice(stockCode: string): number | null {
    return priceMap.value.get(stockCode)?.price ?? null;
  }

  function getStockPrice(stockCode: string): PriceUpdate | null {
    return priceMap.value.get(stockCode) ?? null;
  }

  async function fetchStocks(): Promise<void> {
    isLoading.value = true;
    try {
      stocks.value = await window.stockWatcherAPI.getWatchlist();
    } catch (error) {
      console.error('Failed to fetch watchlist:', error);
      throw error;
    } finally {
      isLoading.value = false;
    }
  }

  async function addStock(input: AddStockInput): Promise<WatchlistStock> {
    const newStock = await window.stockWatcherAPI.addStock(input);
    await fetchStocks();
    return newStock;
  }

  async function updateStock(id: number, updates: UpdateStockInput): Promise<WatchlistStock> {
    const updated = await window.stockWatcherAPI.updateStock(id, updates);
    const index = stocks.value.findIndex(s => s.id === id);
    if (index !== -1) {
      stocks.value[index] = updated;
    }
    return updated;
  }

  async function deleteStock(id: number): Promise<void> {
    await window.stockWatcherAPI.deleteStock(id);
    stocks.value = stocks.value.filter(s => s.id !== id);
  }

  async function refreshPrices(): Promise<void> {
    isRefreshing.value = true;
    try {
      await window.stockWatcherAPI.refreshPrices();
    } finally {
      isRefreshing.value = false;
    }
  }

  /**
   * 下载指定股票的K线数据（T105-T106：接收adjustTypes参数）
   * @param stockCode 股票代码
   * @param startDate 开始日期 (YYYYMMDD)
   * @param endDate 结束日期 (YYYYMMDD)
   * @param adjustTypes 复权类型数组（可选，默认 ['', 'qfq']）
   * @returns 下载结果
   */
  async function downloadKline(
    stockCode: string,
    startDate: string,
    endDate: string,
    adjustTypes?: ('' | 'qfq')[]
  ): Promise<KlineDownloadResult> {
    // 设置下载中状态
    downloadStatusMap.value.set(stockCode, { isDownloading: true, result: null });
    downloadStatusMap.value = new Map(downloadStatusMap.value);

    try {
      // T106：将adjustTypes参数传递给window.klineAPI.downloadKline
      const result = await window.klineAPI.downloadKline({
        stockCode,
        startDate,
        endDate,
        adjustTypes,
      });
      downloadStatusMap.value.set(stockCode, { isDownloading: false, result });
      downloadStatusMap.value = new Map(downloadStatusMap.value);
      return result;
    } catch (error) {
      const result: KlineDownloadResult = {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
      downloadStatusMap.value.set(stockCode, { isDownloading: false, result });
      downloadStatusMap.value = new Map(downloadStatusMap.value);
      return result;
    }
  }

  /**
   * 批量下载多只股票的K线数据
   * 由主进程串行执行并通过 kline:batch-progress 推送逐只进度
   * @param input 批量下载参数（股票代码列表、日期范围、复权类型）
   * @returns 批量下载汇总结果
   */
  async function downloadKlineBatch(input: KlineBatchDownloadInput): Promise<KlineBatchDownloadSummary> {
    const stockCodes = [...input.stockCodes];
    const items = new Map<string, BatchStockItemState>();

    // 初始化逐只状态为等待，并同步列表行内“下载中”状态
    downloadStatusMap.value = new Map(downloadStatusMap.value);
    for (const stockCode of stockCodes) {
      const stock = stocks.value.find(item => item.stockCode === stockCode);
      items.set(stockCode, {
        stockCode,
        stockName: stock?.stockName ?? '',
        status: 'pending',
      });
      downloadStatusMap.value.set(stockCode, { isDownloading: false, result: null });
    }

    batchDownloadState.value = {
      isRunning: true,
      total: stockCodes.length,
      completed: 0,
      items,
      summary: null,
    };

    try {
      const summary = await window.klineAPI.downloadKlineBatch({ ...input, stockCodes });
      // 以返回值作为最终事实来源，兜底进度事件丢失
      applyBatchSummary(summary, items);
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      const summary: KlineBatchDownloadSummary = {
        success: false,
        total: stockCodes.length,
        successCount: 0,
        failedCount: stockCodes.length,
        results: [],
        error: message,
      };
      batchDownloadState.value = {
        ...batchDownloadState.value,
        isRunning: false,
        summary,
      };
      return summary;
    } finally {
      // 清理列表行内“下载中”状态
      for (const stockCode of stockCodes) {
        downloadStatusMap.value.set(stockCode, { isDownloading: false });
      }
      downloadStatusMap.value = new Map(downloadStatusMap.value);
    }
  }

  /**
   * 用批量下载返回值覆盖逐只状态
   * @param summary 批量下载汇总结果
   * @param initialItems 初始化时的逐只状态（用于保留未返回股票及名称）
   */
  function applyBatchSummary(
    summary: KlineBatchDownloadSummary,
    initialItems: Map<string, BatchStockItemState>
  ): void {
    const items = new Map<string, BatchStockItemState>();

    for (const result of summary.results) {
      items.set(result.stockCode, {
        stockCode: result.stockCode,
        stockName: result.stockName || initialItems.get(result.stockCode)?.stockName || '',
        status: result.success ? 'success' : 'failed',
        result,
        error: result.error,
      });
    }

    // 结果中未返回的股票（如整批校验失败）保持原状态
    for (const [stockCode, item] of initialItems) {
      if (!items.has(stockCode)) {
        items.set(stockCode, item);
      }
    }

    batchDownloadState.value = {
      isRunning: false,
      total: summary.total || initialItems.size,
      completed: summary.results.length,
      items,
      summary,
    };
  }

  /**
   * 处理主进程推送的批量下载进度
   * @param payload 进度负载（started / completed）
   */
  function handleBatchProgress(payload: KlineBatchProgressPayload): void {
    const current = batchDownloadState.value;
    if (!current.isRunning && !current.items.has(payload.stockCode)) {
      return;
    }

    const items = new Map(current.items);
    const existing = items.get(payload.stockCode);

    if (payload.phase === 'started') {
      items.set(payload.stockCode, {
        stockCode: payload.stockCode,
        stockName: payload.stockName || existing?.stockName || '',
        status: 'downloading',
      });
      downloadStatusMap.value.set(payload.stockCode, { isDownloading: true });
      downloadStatusMap.value = new Map(downloadStatusMap.value);
      batchDownloadState.value = { ...current, items };
      return;
    }

    const result = payload.result;
    items.set(payload.stockCode, {
      stockCode: payload.stockCode,
      stockName: payload.stockName || existing?.stockName || '',
      status: result?.success ? 'success' : 'failed',
      result,
      error: result?.error,
    });
    downloadStatusMap.value.set(payload.stockCode, { isDownloading: false });
    downloadStatusMap.value = new Map(downloadStatusMap.value);
    batchDownloadState.value = {
      ...current,
      items,
      completed: Math.max(payload.index, current.completed),
    };
  }

  /**
   * 重置批量下载状态（重新打开弹窗时清空上次结果）
   */
  function resetBatchDownloadState(): void {
    if (batchDownloadState.value.isRunning) {
      return;
    }

    batchDownloadState.value = {
      isRunning: false,
      total: 0,
      completed: 0,
      items: new Map(),
      summary: null,
    };
  }

  /**
   * 查询指定股票是否正在下载K线数据
   * @param stockCode 股票代码
   * @returns 是否正在下载
   */
  function isDownloading(stockCode: string): boolean {
    return downloadStatusMap.value.get(stockCode)?.isDownloading ?? false;
  }

  /**
   * 打开K线弹窗
   * @param stockCode 股票代码
   * @param stockName 股票名称
   */
  function openKlineChart(stockCode: string, stockName: string): void {
    klineChartDialog.value = {
      visible: true,
      stockCode,
      stockName,
    };
  }

  /**
   * 关闭K线弹窗
   */
  function closeKlineChart(): void {
    klineChartDialog.value = {
      visible: false,
      stockCode: '',
      stockName: '',
    };
  }

  function handlePriceUpdate(prices: PriceUpdate[]): void {
    prices.forEach(update => {
      priceMap.value.set(update.stockCode, update);
    });
    priceMap.value = new Map(priceMap.value);
  }

  function handleAlert(alert: Alert): void {
    alerts.value.unshift(alert);
    if (alerts.value.length > 50) {
      alerts.value = alerts.value.slice(0, 50);
    }
  }

  function handleRefreshTimeUpdate(time: string): void {
    lastRefreshTime.value = time;
  }

  function handleIndexUpdate(data: { indices: IndexData[]; status: 'normal' | 'error'; errorMessage?: string | null; timestamp: string }): void {
    indexDataState.value = {
      indices: data.indices,
      status: data.status,
      errorMessage: data.errorMessage ?? null,
      isLoading: false,
    };
  }

  function setupEventListeners(): () => void {
    const unsubPrice = window.stockWatcherAPI.onPriceUpdate(handlePriceUpdate);
    const unsubAlert = window.stockWatcherAPI.onAlert(handleAlert);
    const unsubTime = window.stockWatcherAPI.onRefreshTimeUpdate(handleRefreshTimeUpdate);
    const unsubIndex = window.stockWatcherAPI.onIndexUpdate(handleIndexUpdate);
    const unsubBatchProgress = window.klineAPI.onBatchDownloadProgress(handleBatchProgress);

    return () => {
      unsubPrice();
      unsubAlert();
      unsubTime();
      unsubIndex();
      unsubBatchProgress();
    };
  }

  return {
    stocks,
    lastRefreshTime,
    isLoading,
    isRefreshing,
    alerts,
    priceMap,
    indexDataState,
    downloadStatusMap,
    batchDownloadState,
    enabledStocks,
    isBatchDownloading,
    sortedStocks,
    klineChartDialog,
    getCurrentPrice,
    getStockPrice,
    fetchStocks,
    addStock,
    updateStock,
    deleteStock,
    refreshPrices,
    downloadKline,
    downloadKlineBatch,
    handleBatchProgress,
    resetBatchDownloadState,
    isDownloading,
    openKlineChart,
    closeKlineChart,
    handlePriceUpdate,
    handleAlert,
    handleRefreshTimeUpdate,
    handleIndexUpdate,
    setupEventListeners,
  };
});
