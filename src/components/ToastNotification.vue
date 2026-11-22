<script setup lang="ts">
import { useToast, type ToastType } from '../composables/useToast';
import AppIcon from './ui/AppIcon.vue';
import type { IconName } from './ui/icons';

defineOptions({
  name: 'ToastNotification'
});

const { toasts, removeToast } = useToast();

/** 提示等级 → 图标 */
const ICON_BY_TYPE: Record<ToastType, IconName> = {
  success: 'check',
  warning: 'warning',
  error: 'error',
  info: 'info',
};
</script>

<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="['toast', `toast-${toast.type}`]"
      >
        <span class="toast-icon">
          <AppIcon :name="ICON_BY_TYPE[toast.type]" :size="16" />
        </span>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" aria-label="关闭提示" @click="removeToast(toast.id)">
          <AppIcon name="close" :size="16" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.toast-container {
  position: fixed;
  top: 48px;
  right: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 280px;
  max-width: 400px;
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.toast-success {
  background: var(--bg-success-subtle);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

.toast-warning {
  background: var(--bg-warning-subtle);
  color: var(--color-warning);
  border: 1px solid var(--color-warning);
}

.toast-error {
  background: var(--bg-danger-subtle);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.toast-info {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color-strong);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-message {
  flex: 1;
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
