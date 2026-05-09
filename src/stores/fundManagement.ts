import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { AnnualProfitData, MonthlyProfitData, ProfitStatistics, TransferRecord } from '../../shared/types';

export const useFundManagementStore = defineStore('fundManagement', () => {
  // State
  const transferRecords = ref<TransferRecord[]>([]);
  const profitStatistics = ref<ProfitStatistics | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 图表相关状态
  const annualProfitData = ref<AnnualProfitData[]>([]);
  const monthlyProfitData = ref<MonthlyProfitData[]>([]);
  const isLoadingAnnual = ref(false);
  const isLoadingMonthly = ref(false);

  // 分页相关状态
  const currentPage = ref(0);
  const pageSize = ref(20);
  const hasMore = ref(true);
  const totalRecords = ref(0);

  // Getters
  const recordsCount = computed(() => transferRecords.value.length);
  const isEmpty = computed(() => transferRecords.value.length === 0);

  // Actions

  /**
   * 计算账户余额（辅助方法）
   * @param previousBalance 上一条记录的余额
   * @param amount 当前记录金额
   * @param type 资金类型
   * @returns 计算后的余额
   */
  function calculateAccountBalance(previousBalance: number, amount: number, type: string): number {
    // IN、DIVIDEND、STOCK_SELL、INTEREST 增加余额
    if (type === 'IN' || type === 'DIVIDEND' || type === 'STOCK_SELL' || type === 'INTEREST') {
      return previousBalance + amount;
    }
    // OUT、DIVIDEND_TAX、STOCK_BUY 减少余额
    else if (type === 'OUT' || type === 'DIVIDEND_TAX' || type === 'STOCK_BUY') {
      return previousBalance - amount;
    }
    return previousBalance;
  }

  /**
   * 获取资金明细记录列表（支持分页）
   */
  async function fetchTransferRecords(reset: boolean = false): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      if (reset) {
        currentPage.value = 0;
        transferRecords.value = [];
        hasMore.value = true;
      }

      console.log('Fetching records:', { reset, currentPage: currentPage.value, pageSize: pageSize.value, hasMore: hasMore.value });

      const offset = currentPage.value * pageSize.value;
      const records = await window.fundManagementAPI.getTransferRecords(pageSize.value, offset);

      console.log('Fetched records count:', records.length);

      if (records.length < pageSize.value) {
        hasMore.value = false;
        console.log('No more records to load');
      }

      if (reset) {
        transferRecords.value = records;
      } else {
        transferRecords.value.push(...records);
      }

      totalRecords.value += records.length;
      currentPage.value++;

      console.log('Current state:', {
        totalRecords: totalRecords.value,
        currentPage: currentPage.value,
        hasMore: hasMore.value,
        recordsCount: transferRecords.value.length
      });
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取转账记录失败';
      console.error('fetchTransferRecords error:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 新增资金明细记录
   */
  async function addTransferRecord(record: { transferDate: string; amount: number; type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST' }): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      await window.fundManagementAPI.addTransferRecord(record);

      // 刷新列表（重置到第一页）
      await fetchTransferRecords(true);
    } catch (err) {
      error.value = err instanceof Error ? err.message : '添加转账记录失败';
      console.error('addTransferRecord error:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 更新资金明细记录
   */
  async function updateTransferRecord(id: number, data: { transferDate?: string; amount?: number; type?: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST'; accountBalance?: number }): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      await window.fundManagementAPI.updateTransferRecord(id, data);

      // 刷新列表
      await fetchTransferRecords(true);
    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新转账记录失败';
      console.error('updateTransferRecord error:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 删除资金明细记录
   */
  async function deleteTransferRecord(id: number): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      await window.fundManagementAPI.deleteTransferRecord(id);

      // 从本地列表中移除
      const index = transferRecords.value.findIndex(r => r.id === id);
      if (index !== -1) {
        transferRecords.value.splice(index, 1);
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除转账记录失败';
      console.error('deleteTransferRecord error:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 计算盈亏统计
   * 盈亏公式：盈亏金额=(期末账户余额+期末持仓市值)-(期初账户余额+期初持仓市值)+(转出金额-转入金额)
   * 后端直接返回完整的盈亏统计数据，前端不再拼接计算
   * @param startDate 开始日期（可选，不提供则统计所有历史）
   * @param endDate 结束日期（可选，不提供则统计所有历史）
   */
  async function calculateProfit(startDate?: string, endDate?: string): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      // 如果没有提供日期，使用一个很大的范围来覆盖所有历史记录
      const start = startDate || '1970-01-01';
      const end = endDate || '2099-12-31';

      // 直接从后端获取完整的盈亏统计数据
      const stats = await window.fundManagementAPI.getProfitStatistics(start, end);

      profitStatistics.value = stats;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '计算盈亏统计失败';
      console.error('calculateProfit error:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 清除错误信息
   */
  function clearError(): void {
    error.value = null;
  }

  /**
   * 获取年度盈亏数据
   */
  async function fetchAnnualProfitData(): Promise<void> {
    try {
      console.log('[Store] 开始获取年度盈亏数据...');
      isLoadingAnnual.value = true;
      error.value = null;

      const data = await window.fundManagementAPI.getAnnualProfitData();
      console.log('[Store] 年度盈亏数据:', data);
      annualProfitData.value = data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取年度盈亏数据失败';
      console.error('[Store] fetchAnnualProfitData error:', err);
    } finally {
      isLoadingAnnual.value = false;
    }
  }

  /**
   * 获取月度盈亏数据
   */
  async function fetchMonthlyProfitData(): Promise<void> {
    try {
      console.log('[Store] 开始获取月度盈亏数据...');
      isLoadingMonthly.value = true;
      error.value = null;

      const data = await window.fundManagementAPI.getMonthlyProfitData();
      console.log('[Store] 月度盈亏数据:', data);
      monthlyProfitData.value = data;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取月度盈亏数据失败';
      console.error('[Store] fetchMonthlyProfitData error:', err);
    } finally {
      isLoadingMonthly.value = false;
    }
  }

  return {
    // State
    transferRecords,
    profitStatistics,
    isLoading,
    error,
    currentPage,
    pageSize,
    hasMore,
    totalRecords,
    // 图表相关状态
    annualProfitData,
    monthlyProfitData,
    isLoadingAnnual,
    isLoadingMonthly,

    // Getters
    recordsCount,
    isEmpty,

    // Actions
    fetchTransferRecords,
    addTransferRecord,
    updateTransferRecord,
    deleteTransferRecord,
    calculateProfit,
    calculateAccountBalance,
    clearError,
    fetchAnnualProfitData,
    fetchMonthlyProfitData,
  };
});
