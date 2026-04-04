import { ref } from 'vue';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const toasts = ref<Toast[]>([]);
let nextId = 0;

export function useToast() {
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    const id = nextId++;
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      removeToast(id);
    }, duration);
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
