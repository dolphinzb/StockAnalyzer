/**
 * 行情库同步状态与控制命令
 *
 * 行为（见 change spec「页面轮询同步状态并及时停止」）：
 * - 挂载时立即查询一次状态，并在可见期间每 1 秒轮询
 * - 卸载时清除轮询定时器
 * - 控制命令失败时抛出可读错误，由页面展示，不静默吞掉
 */

import { onMounted, onUnmounted, ref } from 'vue';
import type { MarketDataAPI, MarketSyncControlResult, MarketSyncStatus } from '../../shared/types';
import { useToast } from './useToast';

declare global {
  interface Window {
    marketDataAPI?: MarketDataAPI;
  }
}

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 1000;

/** 控制命令类型 */
export type MarketControlAction = 'start' | 'incremental' | 'retry';

export function useMarketDataSync() {
  const status = ref<MarketSyncStatus | null>(null);
  const loading = ref(false);
  const actionPending = ref<MarketControlAction | null>(null);
  const loadError = ref<string | null>(null);
  const { showToast } = useToast();

  let timer: ReturnType<typeof setInterval> | null = null;

  const api = (): MarketDataAPI | undefined => window.marketDataAPI;

  /** 立即查询一次状态 */
  async function refresh(): Promise<void> {
    const target = api();
    if (!target) {
      loadError.value = '行情库接口不可用，请重启应用';
      return;
    }
    try {
      status.value = await target.getStatus();
      loadError.value = null;
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error);
    }
  }

  /** 启动 1 秒轮询（重复调用不会叠加定时器） */
  function startPolling(): void {
    stopPolling();
    timer = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
  }

  /** 清除轮询定时器 */
  function stopPolling(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /**
   * 执行控制命令并给出结果提示
   * @param action 命令标识（用于按钮禁用）
   * @param run 实际调用
   * @param successMessage 成功提示
   */
  async function runControl(
    action: MarketControlAction,
    run: (target: MarketDataAPI) => Promise<MarketSyncControlResult>,
    successMessage: string
  ): Promise<MarketSyncControlResult> {
    const target = api();
    if (!target) {
      const result = { success: false, error: '行情库接口不可用，请重启应用' };
      loadError.value = result.error;
      showToast(result.error, 'error');
      return result;
    }

    actionPending.value = action;
    try {
      const result = await run(target);
      if (result.success) {
        showToast(successMessage, 'success');
      } else if (result.error) {
        loadError.value = result.error;
        showToast(result.error, 'error');
      }
      await refresh();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      loadError.value = message;
      showToast(message, 'error');
      return { success: false, error: message };
    } finally {
      actionPending.value = null;
    }
  }

  /** 开始/继续全量回填 */
  function startFullBackfill(): Promise<MarketSyncControlResult> {
    return runControl('start', target => target.startFullBackfill(), '已启动全量回填');
  }

  /** 手动增量补跑 */
  function runIncremental(): Promise<MarketSyncControlResult> {
    return runControl('incremental', target => target.runIncremental(), '已启动增量更新');
  }

  /** 重试失败任务 */
  function retryFailed(): Promise<MarketSyncControlResult> {
    return runControl('retry', target => target.retryFailed(), '已重试失败任务');
  }

  /** 手动刷新（按钮） */
  async function manualRefresh(): Promise<void> {
    loading.value = true;
    try {
      await refresh();
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void refresh();
    startPolling();
  });

  onUnmounted(() => {
    stopPolling();
  });

  return {
    status,
    loading,
    actionPending,
    loadError,
    refresh,
    manualRefresh,
    startFullBackfill,
    runIncremental,
    retryFailed,
    startPolling,
    stopPolling,
  };
}
