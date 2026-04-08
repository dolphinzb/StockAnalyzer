import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface LogViewerState {
  content: string;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  isPageVisible: boolean;
}

let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

export const useLogStore = defineStore('log', () => {
  const content = ref<string>('');
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastRefresh = ref<Date | null>(null);
  const isPageVisible = ref(true);

  async function fetchLog(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await window.logApi.readLog();
      if (result.error) {
        if (result.error === 'LOG_FILE_NOT_FOUND') {
          error.value = '日志文件不存在';
        } else if (result.error === 'LOG_FILE_PERMISSION_DENIED') {
          error.value = '无法读取日志文件，请检查权限';
        } else {
          error.value = `读取日志失败: ${result.error}`;
        }
        content.value = '';
      } else {
        content.value = result.content;
      }
      lastRefresh.value = new Date();
    } catch (err) {
      error.value = '读取日志失败';
      content.value = '';
      console.error('Failed to fetch log:', err);
    } finally {
      isLoading.value = false;
    }
  }

  function startAutoRefresh(): void {
    if (autoRefreshInterval) {
      return;
    }
    autoRefreshInterval = setInterval(() => {
      if (isPageVisible.value) {
        fetchLog();
      }
    }, 30000);
  }

  function stopAutoRefresh(): void {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  function setPageVisible(visible: boolean): void {
    isPageVisible.value = visible;
  }

  return {
    content,
    isLoading,
    error,
    lastRefresh,
    isPageVisible,
    fetchLog,
    startAutoRefresh,
    stopAutoRefresh,
    setPageVisible,
  };
});
