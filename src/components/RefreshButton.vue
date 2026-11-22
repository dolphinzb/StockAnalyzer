<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';

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
    class="btn btn-secondary"
    :class="{ 'is-loading': loading }"
    :disabled="loading"
    @click="handleClick"
  >
    <span class="icon"><AppIcon name="refresh" :size="16" /></span>
    <span>{{ loading ? '刷新中...' : '刷新' }}</span>
  </button>
</template>

<style scoped lang="scss">
// 按钮外观由全局 .btn / .btn-secondary 提供，此处只处理图标旋转
.is-loading .icon {
  display: inline-flex;
  animation: spin 1s linear infinite;
}

.icon {
  display: inline-flex;
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
