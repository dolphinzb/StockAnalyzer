<script setup lang="ts">
defineProps<{
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

function handleClick() {
  if (!window.event?.defaultPrevented) {
    emit('refresh');
  }
}
</script>

<template>
  <button
    class="refresh-button"
    :class="{ loading }"
    :disabled="loading"
    @click="handleClick"
  >
    <span class="icon">⟳</span>
    <span class="text">{{ loading ? '刷新中...' : '刷新' }}</span>
  </button>
</template>

<style scoped lang="scss">
.refresh-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background-color: var(--bg-hover);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  &.loading {
    .icon {
      animation: spin 1s linear infinite;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.icon {
  font-size: 1rem;
}
</style>
