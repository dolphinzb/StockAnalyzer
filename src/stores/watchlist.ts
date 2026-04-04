import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { WatchlistStock, AddStockInput, UpdateStockInput, Alert, PriceUpdate } from '../types';

export const useWatchlistStore = defineStore('watchlist', () => {
  const stocks = ref<WatchlistStock[]>([]);
  const lastRefreshTime = ref<string | null>(null);
  const isLoading = ref(false);
  const isRefreshing = ref(false);
  const alerts = ref<Alert[]>([]);

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
      const stock = stocks.value.find(s => s.stockCode === update.stockCode);
      if (stock) {
        stock.currentPrice = update.price;
      }
    });
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

  function setupEventListeners(): () => void {
    const unsubPrice = window.stockWatcherAPI.onPriceUpdate(handlePriceUpdate);
    const unsubAlert = window.stockWatcherAPI.onAlert(handleAlert);
    const unsubTime = window.stockWatcherAPI.onRefreshTimeUpdate(handleRefreshTimeUpdate);

    return () => {
      unsubPrice();
      unsubAlert();
      unsubTime();
    };
  }

  return {
    stocks,
    lastRefreshTime,
    isLoading,
    isRefreshing,
    alerts,
    enabledStocks,
    sortedStocks,
    fetchStocks,
    addStock,
    updateStock,
    deleteStock,
    refreshPrices,
    handlePriceUpdate,
    handleAlert,
    handleRefreshTimeUpdate,
    setupEventListeners,
  };
});
