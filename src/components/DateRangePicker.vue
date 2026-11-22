<template>
  <div class="date-range-picker">
    <div class="date-inputs">
      <div class="input-group">
        <label for="start-date">开始日期</label>
        <input
          id="start-date"
          v-model="startDate"
          type="date"
          class="date-input"
          @change="validateAndEmit"
        />
      </div>
      <div class="input-group">
        <label for="end-date">结束日期</label>
        <input
          id="end-date"
          v-model="endDate"
          type="date"
          class="date-input"
          @change="validateAndEmit"
        />
      </div>
    </div>
    <span v-if="error" class="error-message">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Props {
  modelValue?: { startDate: string; endDate: string };
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({ startDate: '', endDate: '' }),
});

const emit = defineEmits<{
  'update:modelValue': [value: { startDate: string; endDate: string }];
  change: [value: { startDate: string; endDate: string }];
}>();

const startDate = ref(props.modelValue.startDate);
const endDate = ref(props.modelValue.endDate);
const error = ref('');

// 验证并触发更新
const validateAndEmit = () => {
  error.value = '';

  // 验证开始日期不能晚于结束日期
  if (startDate.value && endDate.value && startDate.value > endDate.value) {
    error.value = '开始日期不能晚于结束日期';
    return;
  }

  const value = { startDate: startDate.value, endDate: endDate.value };
  emit('update:modelValue', value);
  emit('change', value);
};

// 监听外部变化
watch(
  () => props.modelValue,
  (newValue) => {
    startDate.value = newValue.startDate;
    endDate.value = newValue.endDate;
  }
);
</script>

<style scoped lang="scss">
.date-range-picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.date-inputs {
  display: flex;
  gap: var(--space-4);
}

.input-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: 500;
    white-space: nowrap;
  }
}

.date-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-info);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }
}

.error-message {
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}
</style>
