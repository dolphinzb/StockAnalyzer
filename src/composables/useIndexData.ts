import { ref, onMounted, onUnmounted } from 'vue';
import type { IndexDataState } from '../types';

/**
 * 指数数据 Composable
 * 用于管理指数数据的获取、更新和状态管理
 */
export function useIndexData() {
  const indexDataState = ref<IndexDataState>({
    indices: [],
    status: 'normal',
    errorMessage: null,
    isLoading: false,
  });

  // 保存上次成功的指数数据（用于错误时显示）
  let lastSuccessfulData: IndexDataState['indices'] = [];

  /**
   * 处理指数数据更新
   */
  function handleIndexUpdate(data: {
    indices: IndexDataState['indices'];
    status: 'normal' | 'error';
    errorMessage?: string | null;
    timestamp: string;
  }) {
    if (data.status === 'error') {
      // 错误状态：保持上次成功的数据，显示错误信息
      indexDataState.value = {
        indices: lastSuccessfulData.length > 0 ? lastSuccessfulData : [],
        status: 'error',
        errorMessage: data.errorMessage || '数据更新失败',
        isLoading: false,
      };
    } else {
      // 正常状态：更新数据并缓存
      if (data.indices.length > 0) {
        lastSuccessfulData = data.indices;
      }
      indexDataState.value = {
        indices: data.indices,
        status: 'normal',
        errorMessage: null,
        isLoading: false,
      };
    }
  }

  /**
   * 设置事件监听器
   */
  function setupEventListeners(): (() => void) | null {
    if (typeof window !== 'undefined' && window.stockWatcherAPI?.onIndexUpdate) {
      return window.stockWatcherAPI.onIndexUpdate(handleIndexUpdate);
    }
    return null;
  }

  onMounted(() => {
    // 组件挂载时设置监听器
    setupEventListeners();
  });

  return {
    indexDataState,
    handleIndexUpdate,
    setupEventListeners,
  };
}
