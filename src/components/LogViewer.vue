<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';

defineProps<{
  content: string;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  /** 无内容时的提示文案，用于区分「该日期没有日志」与「日志文件为空」 */
  emptyText?: string;
}>();
</script>

<template>
  <div class="log-viewer">
    <div v-if="isLoading" class="loading-state">
      <span class="loading-icon"><AppIcon name="refresh" :size="20" /></span>
      <span>加载中...</span>
    </div>

    <div v-else-if="error" class="error-state">
      <span class="error-icon"><AppIcon name="warning" :size="20" /></span>
      <span>{{ error }}</span>
    </div>

    <div v-else-if="!content" class="empty-state">
      <span class="empty-icon"><AppIcon name="file" :size="20" /></span>
      <span>{{ emptyText ?? '日志文件为空' }}</span>
    </div>

    <pre v-else class="log-content">{{ content }}</pre>
  </div>
</template>

<style scoped lang="scss">
.log-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
}

.loading-state,
.error-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 100%;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.loading-icon {
  display: inline-flex;
  animation: spin 1s linear infinite;
}

.error-icon {
  display: inline-flex;
  color: var(--color-danger);
}

.empty-icon {
  display: inline-flex;
  color: var(--text-tertiary);
}

.log-content {
  flex: 1;
  margin: 0;
  padding: var(--space-4);
  overflow: auto;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
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
