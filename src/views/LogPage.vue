<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import LogViewer from '../components/LogViewer.vue';
import { useLogStore } from '../stores/logStore';
import { useToast } from '../composables/useToast';

defineOptions({
  name: 'LogPage'
});

const logStore = useLogStore();
const { showToast } = useToast();

/** 本地日期字符串（YYYY-MM-DD），与日志文件名口径一致 */
function toLocalDateString(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 日志内容按行反转，最新的在最上面 */
const content = computed(() => {
  const lines = logStore.content.split('\n');
  return lines.reverse().join('\n');
});

const lastRefreshTime = computed(() => {
  if (!logStore.lastRefresh) return '';
  return logStore.lastRefresh.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
});

/**
 * 可选日期：目录中存在的日期 + 当前选中日期
 * 当天尚未产生日志文件时，仍需保证下拉框能显示今天
 */
const dateOptions = computed(() => {
  const options = new Set(logStore.availableDates);
  options.add(logStore.selectedDate);
  return [...options].sort((a, b) => (a < b ? 1 : -1));
});

/** 空状态文案：区分「该日期无日志」与「日志文件为空」 */
const emptyText = computed(() => (logStore.dateHasNoLog ? '该日期没有日志' : '日志文件为空'));

/**
 * 日期下拉项文案
 * @param date 日期字符串
 * @returns 展示文案
 */
function formatDateLabel(date: string): string {
  return date === toLocalDateString() ? `今天（${date}）` : date;
}

/**
 * 切换查看的日志日期
 * @param event 下拉框变更事件
 */
async function handleDateChange(event: Event): Promise<void> {
  const date = (event.target as HTMLSelectElement).value;
  if (!date || date === logStore.selectedDate) {
    return;
  }
  await logStore.selectDate(date);
}

/**
 * 在文件资源管理器中打开日志目录
 */
async function handleOpenDirectory(): Promise<void> {
  try {
    const result = await window.logApi.openLogDirectory();
    if (!result.success) {
      showToast(`打开日志目录失败: ${result.error ?? '未知错误'}`, 'error');
    }
  } catch (error) {
    showToast(`打开日志目录失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
  }
}

function handleVisibilityChange() {
  logStore.setPageVisible(document.visibilityState === 'visible');
}

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  logStore.setPageVisible(true);
  await logStore.initialize();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  logStore.stopAutoRefresh();
});
</script>

<template>
  <div class="page log-page">
    <header class="page-header">
      <h2 class="page-title">日志查看</h2>
      <div class="header-actions">
        <select
          class="select date-select"
          :value="logStore.selectedDate"
          title="选择要查看的日志日期"
          @change="handleDateChange"
        >
          <option v-for="date in dateOptions" :key="date" :value="date">
            {{ formatDateLabel(date) }}
          </option>
        </select>
        <button class="btn btn-secondary btn-sm" type="button" @click="handleOpenDirectory">
          打开日志目录
        </button>
        <span v-if="lastRefreshTime" class="last-refresh">
          最后刷新: {{ lastRefreshTime }}
        </span>
      </div>
    </header>

    <LogViewer
      :content="content"
      :is-loading="logStore.isLoading"
      :error="logStore.error"
      :last-refresh="logStore.lastRefresh"
      :empty-text="emptyText"
    />
  </div>
</template>

<style scoped lang="scss">
// 页面骨架由全局 .page / .page-header / .page-title 提供，此处只补充该页特有布局
.log-page {
  gap: var(--space-4);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

// 日期下拉按内容宽度显示，不撑满标题栏
.date-select {
  width: auto;
}

.last-refresh {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}
</style>
