import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { HistoricalTradeRecord } from '../types';

/**
 * 历史交易 Pinia Store
 * 管理历史开仓记录的状态
 */
export const useHistoricalTradesStore = defineStore('historicalTrades', () => {
  /** 历史开仓记录数组 */
  const records = ref<HistoricalTradeRecord[]>([]);
  /** 加载状态 */
  const isLoading = ref(false);
  /** 错误信息 */
  const error = ref<string | null>(null);

  /**
   * 获取所有历史开仓记录
   */
  async function fetchRecords(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      records.value = await window.historicalTradeAPI.getAll();
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取历史记录失败';
      console.error('Failed to fetch historical trades:', err);
    } finally {
      isLoading.value = false;
    }
  }

  return {
    records,
    isLoading,
    error,
    fetchRecords,
  };
});
