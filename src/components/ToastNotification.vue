<script setup lang="ts">
import { useToast } from '../composables/useToast';

defineOptions({
  name: 'ToastNotification'
});

const { toasts, removeToast } = useToast();
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
          <svg v-if="toast.type === 'success'" width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.5 5.1l-4 4c-.2.2-.5.3-.7.3s-.5-.1-.7-.3l-2-2c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l1.3 1.3 3.3-3.3c.4-.4 1-.4 1.4 0s.4 1 0 1.4z"/>
          </svg>
          <svg v-else-if="toast.type === 'error'" width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.5 9c-.2.2-.5.3-.7.3s-.5-.1-.7-.3l-3-3c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l3 3c.4.4.4 1 0 1.4z"/>
          </svg>
          <svg v-else width="16" height="16" viewBox="0 0 16 16">
            <path fill="currentColor" d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 11H7V7h2v4zm0-6H7V5h2v2z"/>
          </svg>
        </span>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" @click="removeToast(toast.id)">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/>
            <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.toast-container {
  position: fixed;
  top: 48px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 14px;
  min-width: 280px;
  max-width: 400px;
}

.toast-success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #67c23a;
}

.toast-error {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #f56c6c;
}

.toast-info {
  background: #f4f4f5;
  color: #909399;
  border: 1px solid #909399;
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
  background: transparent;
  border: none;
  cursor: pointer;
  opacity: 0.6;
  padding: 4px;
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
