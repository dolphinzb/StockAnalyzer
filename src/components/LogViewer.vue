<script setup lang="ts">
defineProps<{
  content: string;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
}>();
</script>

<template>
  <div class="log-viewer">
    <div v-if="isLoading" class="loading-state">
      <span class="loading-icon">⟳</span>
      <span>加载中...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-icon">⚠</span>
      <span>{{ error }}</span>
    </div>

    <div v-else-if="!content" class="empty-state">
      <span class="empty-icon">📄</span>
      <span>日志文件为空</span>
    </div>

    <pre v-else class="log-content">{{ content }}</pre>
  </div>
</template>

<style scoped lang="scss">
.log-viewer {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.loading-icon {
  font-size: 1.5rem;
  animation: spin 1s linear infinite;
}

.error-icon {
  font-size: 1.5rem;
  color: var(--color-error);
}

.empty-icon {
  font-size: 2rem;
  opacity: 0.5;
}

.log-content {
  flex: 1;
  margin: 0;
  padding: 1rem;
  overflow: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-primary);
  background-color: var(--bg-primary);
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
