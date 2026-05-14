import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AddStockInput, Alert, IndexData, IndexDataState, KlineDownloadResult, PriceUpdate, UpdateStockInput, WatchlistStock } from '../types';

export const useWatchlistStore = defineStore('watchlist', () => {
  const stocks = ref<WatchlistStock[]>([]);
  const lastRefreshTime = ref<string | null>(null);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const alerts = ref<Alert[]>([]);
  const priceMap = ref<Map<string, PriceUpdate>>(new Map());

  // K线下载状态管理（T107：更新类型定义，支持存储不同复权类型的下载结果）
  const downloadStatusMap = ref<Map<string, { isDownloading: boolean; result?: KlineDownloadResult | null }>>(new Map());

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

    return () => {
      unsubPrice();
      unsubAlert();
      unsubTime();
      unsubIndex();
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
    enabledStocks,
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
