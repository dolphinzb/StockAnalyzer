<script setup lang="ts">
import { computed, ref } from 'vue';
import DateRangePicker from './DateRangePicker.vue';
import Modal from './Modal.vue';

interface Props {
  modelValue: boolean;
  stockCode: string;
  stockName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  download: [payload: { stockCode: string; startDate: string; endDate: string; adjustTypes: ('' | 'qfq')[] }];
}>();

/** 计算默认开始日期：当日 */
function getDefaultStartDate(): string {
  const date = new Date();
  return date.toISOString().slice(0, 10);
}

/** 计算默认结束日期：当日 */
function getDefaultEndDate(): string {
  const date = new Date();
  return date.toISOString().slice(0, 10);
}

/** 日期范围 */
const dateRange = ref<{ startDate: string; endDate: string }>({
  startDate: getDefaultStartDate(),
  endDate: getDefaultEndDate(),
});

/** 复权类型选择（T101：默认全选，与stock-sdk的adjust参数一致） */
const adjustTypes = ref<('' | 'qfq')[]>(['', 'qfq']);

/** 验证错误信息 */
const validationError = ref('');

/** 是否可以提交（T102：增加复权类型验证） */
const canSubmit = computed(() => {
  const { startDate, endDate } = dateRange.value;
  if (!startDate || !endDate) return false;
  if (startDate > endDate) return false;
  // 结束日期不能晚于当前日期
  const today = new Date().toISOString().slice(0, 10);
  if (endDate > today) return false;
  // 至少选择一种复权类型
  if (adjustTypes.value.length === 0) return false;
  return true;
});

/** 处理日期范围变更 */
function handleDateChange(value: { startDate: string; endDate: string }) {
  dateRange.value = value;
  validationError.value = '';
}

/** 处理复权类型变更 */
function handleAdjustTypeChange() {
  validationError.value = '';
}

/** 处理确定按钮点击 */
function handleConfirm() {
  const { startDate, endDate } = dateRange.value;

  // 前端验证
  if (!startDate || !endDate) {
    validationError.value = '请选择开始日期和结束日期';
    return;
  }

  if (startDate > endDate) {
    validationError.value = '开始日期不能晚于结束日期';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (endDate > today) {
    validationError.value = '结束日期不能晚于当前日期';
    return;
  }

  // 验证至少选择一种复权类型（T102）
  if (adjustTypes.value.length === 0) {
    validationError.value = '请至少选择一种复权类型';
    return;
  }

  // 将 YYYY-MM-DD 转换为 YYYYMMDD（stock-sdk参数格式）
  const startDateParam = startDate.replace(/-/g, '');
  const endDateParam = endDate.replace(/-/g, '');

  // T103：传递adjustTypes参数给父组件
  emit('download', {
    stockCode: props.stockCode,
    startDate: startDateParam,
    endDate: endDateParam,
    adjustTypes: [...adjustTypes.value],
  });

  // 关闭对话框
  emit('update:modelValue', false);
}

/** 处理取消按钮点击 */
function handleCancel() {
  emit('update:modelValue', false);
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="下载K线数据"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="kline-download-dialog">
      <div class="stock-info">
        <span class="stock-code">{{ stockCode }}</span>
        <span class="stock-name">{{ stockName }}</span>
      </div>

      <DateRangePicker
        :model-value="dateRange"
        @change="handleDateChange"
      />

      <!-- T100：复权类型复选框组 -->
      <div class="adjust-type-section">
        <label class="section-label">复权类型：</label>
        <div class="checkbox-group">
          <label class="checkbox-item">
            <input
              type="checkbox"
              value=""
              v-model="adjustTypes"
              @change="handleAdjustTypeChange"
            />
            <span>不复权</span>
          </label>
          <label class="checkbox-item">
            <input
              type="checkbox"
              value="qfq"
              v-model="adjustTypes"
              @change="handleAdjustTypeChange"
            />
            <span>前复权</span>
          </label>
        </div>
      </div>

      <span v-if="validationError" class="error-message">{{ validationError }}</span>

      <div class="dialog-actions">
        <button class="btn-cancel" @click="handleCancel">取消</button>
        <button class="btn-confirm" :disabled="!canSubmit" @click="handleConfirm">确定</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
.kline-download-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stock-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #f3f4f6;
  border-radius: 6px;

  .stock-code {
    font-family: monospace;
    font-size: 14px;
    font-weight: 600;
    color: #111827;
  }

  .stock-name {
    font-size: 14px;
    color: #6b7280;
  }
}

/* T100：复权类型选择区域样式 */
.adjust-type-section {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .section-label {
    font-size: 14px;
    font-weight: 500;
    color: #374151;
  }

  .checkbox-group {
    display: flex;
    gap: 16px;

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 14px;
      color: #374151;

      input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: var(--color-primary);
      }

      span {
        user-select: none;
      }

      &:hover {
        color: var(--color-primary);
      }
    }
  }
}

.error-message {
  font-size: 12px;
  color: #ef4444;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.btn-cancel,
.btn-confirm {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background-color: #f3f4f6;
  color: #374151;

  &:hover {
    background-color: #e5e7eb;
  }
}

.btn-confirm {
  background-color: var(--color-primary);
  color: white;

  &:hover {
    background-color: var(--color-primary-dark);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
