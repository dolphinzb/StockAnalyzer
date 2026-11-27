<script setup lang="ts">
import { computed, ref } from 'vue';
import DateRangePicker from './DateRangePicker.vue';
import Modal from './Modal.vue';
import { KLINE_PERIODS, KLINE_PERIOD_LABELS, type KlinePeriod } from '../types';

interface Props {
  modelValue: boolean;
  stockCode: string;
  stockName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  download: [payload: { stockCode: string; startDate: string; endDate: string; adjustTypes: ('' | 'qfq')[]; periods: KlinePeriod[] }];
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

/** K线周期（多选，默认全选日/周/月；切换周期不改动日期范围） */
const periods = ref<KlinePeriod[]>([...KLINE_PERIODS]);

/** 是否已全选周期 */
const allPeriodsSelected = computed(() => KLINE_PERIODS.every(period => periods.value.includes(period)));

/** 是否部分勾选周期（用于全选复选框半选状态） */
const partiallySelectedPeriods = computed(
  () => periods.value.length > 0 && !allPeriodsSelected.value
);

/** 验证错误信息 */
const validationError = ref('');

/** 是否可以提交（T102：增加复权类型验证；多周期需至少选一个） */
const canSubmit = computed(() => {
  const { startDate, endDate } = dateRange.value;
  if (!startDate || !endDate) return false;
  if (startDate > endDate) return false;
  // 结束日期不能晚于当前日期
  const today = new Date().toISOString().slice(0, 10);
  if (endDate > today) return false;
  // 至少选择一个周期
  if (periods.value.length === 0) return false;
  // 至少选择一种复权类型
  if (adjustTypes.value.length === 0) return false;
  return true;
});

/** 处理周期全选切换 */
function handleToggleAllPeriods(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  periods.value = checked ? [...KLINE_PERIODS] : [];
  validationError.value = '';
}

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

  // 验证至少选择一个周期
  if (periods.value.length === 0) {
    validationError.value = '请至少选择一个周期';
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

  // T103：传递adjustTypes参数给父组件；周期按固定顺序（日→周→月）去重后传递
  emit('download', {
    stockCode: props.stockCode,
    startDate: startDateParam,
    endDate: endDateParam,
    adjustTypes: [...adjustTypes.value],
    periods: KLINE_PERIODS.filter(period => periods.value.includes(period)),
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

      <!-- 周期选择（多选，默认全选日/周/月） -->
      <div class="period-section">
        <div class="section-header">
          <label class="section-label">周期：</label>
          <label class="select-all">
            <input
              type="checkbox"
              :checked="allPeriodsSelected"
              :indeterminate.prop="partiallySelectedPeriods"
              @change="handleToggleAllPeriods"
            />
            <span>全选</span>
          </label>
          <span class="selected-count">已选 {{ periods.length }} / 共 {{ KLINE_PERIODS.length }}</span>
        </div>
        <div class="checkbox-group">
          <label v-for="p in KLINE_PERIODS" :key="p" class="checkbox-item">
            <input type="checkbox" :value="p" v-model="periods" />
            <span>{{ KLINE_PERIOD_LABELS[p] }}</span>
          </label>
        </div>
      </div>

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
        <button class="btn btn-secondary" @click="handleCancel">取消</button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="handleConfirm">确定</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
.kline-download-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stock-info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background-color: var(--bg-tertiary);
  border-radius: var(--radius-md);

  .stock-code {
    font-family: monospace;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .stock-name {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

/* 周期选择区域样式（多选 + 全选） */
.period-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .section-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .select-all {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--text-primary);

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

  .selected-count {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .checkbox-group {
    display: flex;
    gap: var(--space-4);

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
      font-size: var(--font-size-sm);
      color: var(--text-primary);

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

/* T100：复权类型选择区域样式 */
.adjust-type-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  .section-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--text-primary);
  }

  .checkbox-group {
    display: flex;
    gap: var(--space-4);

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      cursor: pointer;
      font-size: var(--font-size-sm);
      color: var(--text-primary);

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
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

</style>
