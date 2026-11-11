import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** 自动刷新间隔（毫秒） */
const AUTO_REFRESH_INTERVAL = 30000;

/**
 * 本地日期字符串（YYYY-MM-DD）
 * 与主进程日志文件名保持同一口径，必须用本地时间而非 UTC
 * @param date 时间，默认当前
 * @returns 日期字符串
 */
function toLocalDateString(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const useLogStore = defineStore('log', () => {
  /**
   * 自动刷新定时器句柄
   * 必须是 store 实例私有的：放在模块级会跨实例残留，
   * 一旦句柄非空且未清空，startAutoRefresh 的幂等判断会让轮询永久不再启动
   */
  let autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

  const content = ref<string>('');
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastRefresh = ref<Date | null>(null);
  const isPageVisible = ref(true);

  /** 保留窗口内存在的日志日期（倒序） */
  const availableDates = ref<string[]>([]);
  /** 当前查看的日期 */
  const selectedDate = ref<string>(toLocalDateString());
  /** 所选日期没有日志文件（区别于文件存在但内容为空） */
  const dateHasNoLog = ref(false);

  /** 是否正在查看今天：只有今天需要自动刷新 */
  const isToday = computed(() => selectedDate.value === toLocalDateString());

  /**
   * 拉取可用的日志日期列表，失败时降级为空列表
   */
  async function loadAvailableDates(): Promise<void> {
    try {
      availableDates.value = (await window.logApi.listLogDates()) ?? [];
    } catch (err) {
      console.error('Failed to load log dates:', err);
      availableDates.value = [];
    }
  }

  /**
   * 读取当前所选日期的日志
   */
  async function fetchLog(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    dateHasNoLog.value = false;

    try {
      const result = await window.logApi.readLog(selectedDate.value);

      if (result.error === 'LOG_FILE_NOT_FOUND') {
        // 该日期没有日志文件：属于正常情况，交给空状态展示
        content.value = '';
        dateHasNoLog.value = true;
      } else if (result.error === 'INVALID_LOG_DATE') {
        content.value = '';
        error.value = '日期参数无效';
      } else if (result.error === 'LOG_FILE_PERMISSION_DENIED') {
        content.value = '';
        error.value = '无法读取日志文件，请检查权限';
      } else if (result.error) {
        content.value = '';
        error.value = `读取日志失败: ${result.error}`;
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

  /**
   * 切换查看的日期，立即拉取并按是否今天调整自动刷新
   * @param date 目标日期（YYYY-MM-DD）
   */
  async function selectDate(date: string): Promise<void> {
    selectedDate.value = date;
    await fetchLog();
    syncAutoRefresh();
  }

  function startAutoRefresh(): void {
    if (autoRefreshInterval) {
      return;
    }

    autoRefreshInterval = setInterval(() => {
      // 页面不可见时跳过本次拉取，但不销毁定时器：
      // 可见性事件的偶发 hidden 不应导致轮询被永久停掉
      if (!isPageVisible.value) {
        return;
      }
      if (!isToday.value) {
        return;
      }
      fetchLog();
    }, AUTO_REFRESH_INTERVAL);
  }

  function stopAutoRefresh(): void {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
    }
  }

  /**
   * 按「是否正在看今天」决定是否轮询
   * 历史日期的文件不会再变化，轮询只是白白读盘；
   * 页面可见性不参与启停，只在定时器内部作为跳过条件
   */
  function syncAutoRefresh(): void {
    if (isToday.value) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  /**
   * 设置页面可见性（仅影响定时器内部是否发起请求，不启停定时器）
   * @param visible 是否可见
   */
  function setPageVisible(visible: boolean): void {
    isPageVisible.value = visible;
  }

  /**
   * 进入日志页：加载可选日期并展示今天
   */
  async function initialize(): Promise<void> {
    await loadAvailableDates();
    selectedDate.value = toLocalDateString();
    await fetchLog();
    syncAutoRefresh();
  }

  return {
    content,
    isLoading,
    error,
    lastRefresh,
    isPageVisible,
    availableDates,
    selectedDate,
    dateHasNoLog,
    isToday,
    loadAvailableDates,
    fetchLog,
    selectDate,
    startAutoRefresh,
    stopAutoRefresh,
    setPageVisible,
    initialize,
  };
});
