<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import LogViewer from '../components/LogViewer.vue';
import { useLogStore } from '../stores/logStore';

defineOptions({
  name: 'LogPage'
});

const logStore = useLogStore();

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

function handleVisibilityChange() {
  logStore.setPageVisible(document.visibilityState === 'visible');
}

onMounted(async () => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  logStore.setPageVisible(true);
  await logStore.fetchLog();
  logStore.startAutoRefresh();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  logStore.stopAutoRefresh();
});
</script>

<template>
  <div class="log-page">
    <header class="log-header">
      <h2>日志查看</h2>
      <div class="header-actions">
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
    />
  </div>
</template>

<style scoped lang="scss">
.log-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  gap: 1rem;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.last-refresh {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
</style>
