import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AddStockInput, Alert, IndexData, IndexDataState, PriceUpdate, UpdateStockInput, WatchlistStock } from '../types';

export const useWatchlistStore = defineStore('watchlist', () => {
  const stocks = ref<WatchlistStock[]>([]);
  const lastRefreshTime = ref<string | null>(null);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const alerts = ref<Alert[]>([]);
  const priceMap = ref<Map<string, PriceUpdate>>(new Map());

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
    enabledStocks,
    sortedStocks,
    getCurrentPrice,
    getStockPrice,
    fetchStocks,
    addStock,
    updateStock,
    deleteStock,
    refreshPrices,
    handlePriceUpdate,
    handleAlert,
    handleRefreshTimeUpdate,
    handleIndexUpdate,
    setupEventListeners,
  };
});
