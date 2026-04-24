import { ref, onMounted } from 'vue';
import type { HistoricalTradeRecord } from '../types';

/**
 * 历史交易数据获取与计算组合式函数
 * 用于管理历史开仓记录的数据获取和状态
 */
export function useHistoricalTrades() {
  /** 历史开仓记录数组 */
  const records = ref<HistoricalTradeRecord[]>([]);
  /** 加载状态 */
  const isLoading = ref(false);
  /** 错误信息 */
  const error = ref<string | null>(null);

  /**
   * 获取历史开仓记录
   * 调用 IPC API 从主进程获取所有历史交易周期数据
   */
  async function fetchHistoricalTrades(): Promise<void> {
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

  /**
   * 组件挂载时自动获取数据
   */
  onMounted(() => {
    fetchHistoricalTrades();
  });

  return {
    records,
    isLoading,
    error,
    fetchHistoricalTrades,
  };
}
