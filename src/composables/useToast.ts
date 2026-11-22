import { ref } from 'vue';

/** 提示等级：与 ToastNotification 的样式一一对应 */
export type ToastType = 'success' | 'warning' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  const showToast = (message: string, type: ToastType = 'info', duration = 3000) => {
    const id = nextId++;
    toasts.value.push({ id, message, type });
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const removeToast = (id: number) => {
    const index = toasts.value.findIndex((t: Toast) => t.id === id);
    if (index > -1) {
      toasts.value.splice(index, 1);
    }
  };

  return {
    toasts,
    showToast,
    removeToast,
  };
}
