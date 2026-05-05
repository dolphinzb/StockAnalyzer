import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { TransferRecord, ProfitStatistics } from '../../shared/types';

export const useFundManagementStore = defineStore('fundManagement', () => {
  // State
  const transferRecords = ref<TransferRecord[]>([]);
  const profitStatistics = ref<ProfitStatistics | null>(null);
  const accountBalance = ref<number>(0); // 账户余额（从数据库加载）
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  
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
   * 获取转账记录列表（支持分页）
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

      const offset = currentPage.value * pageSize.value;
      const records = await window.fundManagementAPI.getTransferRecords(pageSize.value, offset);

      if (records.length < pageSize.value) {
        hasMore.value = false;
      }

      if (reset) {
        transferRecords.value = records;
      } else {
        transferRecords.value.push(...records);
      }

      totalRecords.value += records.length;
      currentPage.value++;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取转账记录失败';
      console.error('fetchTransferRecords error:', err);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 新增转账记录
   */
  async function addTransferRecord(record: { transferDate: string; amount: number; type: 'IN' | 'OUT' }): Promise<void> {
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
   * 更新转账记录
   */
  async function updateTransferRecord(id: number, data: { transferDate?: string; amount?: number; type?: 'IN' | 'OUT' }): Promise<void> {
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
   * 删除转账记录
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
   * 获取账户余额（从数据库）
   */
  async function fetchAccountBalance(): Promise<void> {
    try {
      const balance = await window.fundManagementAPI.getAccountBalance();
      accountBalance.value = balance;
    } catch (err) {
      console.error('fetchAccountBalance error:', err);
      accountBalance.value = 0; // 出错时默认为0
    }
  }

  /**
   * 更新账户余额（保存到数据库）
   */
  async function updateAccountBalance(newBalance: number): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      if (newBalance < 0) {
        throw new Error('账户余额不能为负数');
      }

      await window.fundManagementAPI.updateAccountBalance(newBalance);
      accountBalance.value = newBalance;
      
      // 如果已有盈利统计数据，重新计算
      if (profitStatistics.value) {
        await calculateProfit(
          profitStatistics.value.startDate,
          profitStatistics.value.endDate,
          newBalance
        );
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '更新账户余额失败';
      console.error('updateAccountBalance error:', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 计算盈利统计
   * @param startDate 开始日期（可选，不提供则统计所有历史）
   * @param endDate 结束日期（可选，不提供则统计所有历史）
   * @param balance 账户余额（可选，默认使用store中的值）
   */
  async function calculateProfit(startDate?: string, endDate?: string, balance?: number): Promise<void> {
    try {
      isLoading.value = true;
      error.value = null;

      // 如果没有提供日期，使用一个很大的范围来覆盖所有历史记录
      const start = startDate || '1970-01-01';
      const end = endDate || '2099-12-31';

      // 使用传入的余额或store中的余额
      const currentBalance = balance !== undefined ? balance : accountBalance.value;

      // 获取转账统计
      const stats = await window.fundManagementAPI.getProfitStatistics(start, end);

      // 获取当前持仓总市值
      let currentHoldings = 0;
      try {
        currentHoldings = await window.fundManagementAPI.getCurrentHoldingsTotal();
      } catch (err) {
        console.warn('获取持仓数据失败:', err);
        // 持仓数据获取失败不影响显示，设为0
      }

      // 计算盈利：转出金额 + 账户余额 + 当前持仓金额 - 转入金额
      const profit = stats.totalOut + currentBalance + currentHoldings - stats.totalIn;

      profitStatistics.value = {
        startDate: start,
        endDate: end,
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        accountBalance: currentBalance,
        currentHoldings,
        profit,
      };
    } catch (err) {
      error.value = err instanceof Error ? err.message : '计算盈利统计失败';
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

  return {
    // State
    transferRecords,
    profitStatistics,
    accountBalance,
    isLoading,
    error,
    currentPage,
    pageSize,
    hasMore,
    totalRecords,
    
    // Getters
    recordsCount,
    isEmpty,
    
    // Actions
    fetchTransferRecords,
    addTransferRecord,
    updateTransferRecord,
    deleteTransferRecord,
    calculateProfit,
    fetchAccountBalance,
    updateAccountBalance,
    clearError,
  };
});
