<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="modal-overlay" @click="handleOverlayClick">
        <div class="modal-container" :style="{ width, maxWidth }" @click.stop>
          <div class="modal-header">
            <h3>{{ title }}</h3>
            <button class="modal-close" @click="close" aria-label="关闭">
              <AppIcon name="close" :size="20" />
            </button>
          </div>
          <div class="modal-body">
            <slot></slot>
          </div>
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';

interface Props {
  modelValue: boolean;
  title?: string;
  closeOnOverlayClick?: boolean;
  /** 弹窗宽度，不同内容类型可按需指定（表单类较窄、列表类较宽） */
  width?: string;
  /** 弹窗最大宽度 */
  maxWidth?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  closeOnOverlayClick: true,
  width: '90%',
  maxWidth: '600px',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  close: [];
}>();

const handleOverlayClick = () => {
  if (props.closeOnOverlayClick) {
    close();
  }
};

const close = () => {
  emit('update:modelValue', false);
  emit('close');
};
</script>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--overlay);
  z-index: var(--z-modal);
}

.modal-container {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-color-light);

  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
  }
}

.modal-body {
  flex: 1;
  padding: var(--space-5);
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border-color-light);
}

// Modal过渡动画
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95) translateY(-10px);
}
</style>
