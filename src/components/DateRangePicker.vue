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
  gap: 8px;
}

.date-inputs {
  display: flex;
  gap: 16px;
}

.input-group {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }
}

.date-input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
}

.error-message {
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
}
</style>
