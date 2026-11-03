<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BatchDownloadState, BatchStockStatus } from '../stores/watchlist';
import type { KlineBatchStockResult } from '../types';
import DateRangePicker from './DateRangePicker.vue';
import Modal from './Modal.vue';

interface Props {
  modelValue: boolean;
  stocks: { stockCode: string; stockName: string }[];
  state: BatchDownloadState;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  download: [payload: { stockCodes: string[]; startDate: string; endDate: string; adjustTypes: ('' | 'qfq')[] }];
}>();

/** 计算默认日期：当日 */
function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 勾选的股票代码 */
const selectedCodes = ref<string[]>([]);

/** 日期范围（默认当日） */
const dateRange = ref<{ startDate: string; endDate: string }>({
  startDate: getToday(),
  endDate: getToday(),
});

/** 复权类型选择（默认全选） */
const adjustTypes = ref<('' | 'qfq')[]>(['', 'qfq']);

/** 验证错误信息 */
const validationError = ref('');

/** 是否正在批量下载 */
const isRunning = computed(() => props.state.isRunning);

/** 是否全选 */
const allSelected = computed(() => props.stocks.length > 0 && selectedCodes.value.length === props.stocks.length);

/** 是否部分勾选（用于全选复选框半选状态） */
const partiallySelected = computed(() => selectedCodes.value.length > 0 && selectedCodes.value.length < props.stocks.length);

/** 是否可以提交 */
const canSubmit = computed(() => {
  if (isRunning.value) return false;
  if (props.stocks.length === 0) return false;
  if (selectedCodes.value.length === 0) return false;

  const { startDate, endDate } = dateRange.value;
  if (!startDate || !endDate) return false;
  if (startDate > endDate) return false;
  if (endDate > getToday()) return false;
  if (adjustTypes.value.length === 0) return false;

  return true;
});

/** 确定按钮文案 */
const confirmText = computed(() => {
  if (isRunning.value) {
    return `下载中…(${props.state.completed}/${props.state.total})`;
  }
  return '确定';
});

/** 完成后的汇总文案 */
const summaryText = computed(() => {
  const summary = props.state.summary;
  if (!summary || isRunning.value) return '';
  if (summary.error && summary.results.length === 0) {
    return `下载失败：${summary.error}`;
  }
  return `成功 ${summary.successCount} 只，失败 ${summary.failedCount} 只`;
});

/** 汇总是否包含失败（用于红色强调） */
const summaryHasFailure = computed(() => {
  const summary = props.state.summary;
  return !!summary && (summary.failedCount > 0 || !!summary.error);
});

/** 单只股票的状态展示信息 */
interface RowStatusView {
  status: BatchStockStatus;
  text: string;
  title: string;
}

/**
 * 构建单只成功的条数文案（仅展示本次请求的复权类型）
 * @param result 单只下载结果
 */
function buildCountParts(result?: KlineBatchStockResult): string[] {
  if (!result) return [];

  const parts: string[] = [];
  if (result.unadjustedCount !== undefined) {
    parts.push(`不复权 ${result.unadjustedCount} 条`);
  }
  if (result.adjustedCount !== undefined) {
    parts.push(`前复权 ${result.adjustedCount} 条`);
  }
  return parts;
}

/**
 * 获取单只股票的状态展示信息
 * @param stockCode 股票代码
 */
function getRowStatus(stockCode: string): RowStatusView {
  const item = props.state.items.get(stockCode);

  if (!item || item.status === 'pending') {
    return { status: 'pending', text: '等待', title: '' };
  }

  if (item.status === 'downloading') {
    return { status: 'downloading', text: '下载中…', title: '' };
  }

  if (item.status === 'success') {
    const parts = buildCountParts(item.result);
    const text = parts.length > 0 ? parts.join(' · ') : '成功';
    return { status: 'success', text: `✓ ${text}`, title: text };
  }

  const error = item.error || item.result?.error || '未知错误';
  return { status: 'failed', text: `✗ ${error}`, title: error };
}

/** 弹窗打开时重置勾选与参数 */
watch(
  () => props.modelValue,
  visible => {
    if (!visible) return;

    selectedCodes.value = props.stocks.map(stock => stock.stockCode);
    dateRange.value = { startDate: getToday(), endDate: getToday() };
    adjustTypes.value = ['', 'qfq'];
    validationError.value = '';
  }
);

/** 处理全选切换 */
function handleToggleAll(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  selectedCodes.value = checked ? props.stocks.map(stock => stock.stockCode) : [];
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

/** 处理 Modal 的显隐请求（下载中禁止关闭） */
function handleModalUpdate(value: boolean) {
  if (!value && isRunning.value) return;
  emit('update:modelValue', value);
}

/** 处理取消/关闭按钮点击 */
function handleCancel() {
  if (isRunning.value) return;
  emit('update:modelValue', false);
}

/** 处理确定按钮点击 */
function handleConfirm() {
  const { startDate, endDate } = dateRange.value;

  if (selectedCodes.value.length === 0) {
    validationError.value = '请至少选择一只股票';
    return;
  }

  if (!startDate || !endDate) {
    validationError.value = '请选择开始日期和结束日期';
    return;
  }

  if (startDate > endDate) {
    validationError.value = '开始日期不能晚于结束日期';
    return;
  }

  if (endDate > getToday()) {
    validationError.value = '结束日期不能晚于当前日期';
    return;
  }

  if (adjustTypes.value.length === 0) {
    validationError.value = '请至少选择一种复权类型';
    return;
  }

  emit('download', {
    // 按自选股列表顺序提交，主进程按该顺序串行下载
    stockCodes: props.stocks
      .map(stock => stock.stockCode)
      .filter(stockCode => selectedCodes.value.includes(stockCode)),
    startDate: startDate.replace(/-/g, ''),
    endDate: endDate.replace(/-/g, ''),
    adjustTypes: [...adjustTypes.value],
  });
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    title="批量下载K线数据"
    :close-on-overlay-click="!isRunning"
    @update:model-value="handleModalUpdate"
  >
    <div class="batch-download-dialog">
      <!-- 股票勾选列表 -->
      <div class="stock-select-section">
        <div class="stock-select-header">
          <label class="checkbox-item select-all">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate.prop="partiallySelected"
              :disabled="isRunning"
              @change="handleToggleAll"
            />
            <span>全选</span>
          </label>
          <span class="selected-count">已选 {{ selectedCodes.length }} / 共 {{ stocks.length }}</span>
        </div>

        <p v-if="stocks.length === 0" class="empty-hint">暂无自选股</p>
        <ul v-else class="stock-list">
          <li v-for="stock in stocks" :key="stock.stockCode" class="stock-row">
            <label class="stock-select">
              <input
                type="checkbox"
                :value="stock.stockCode"
                v-model="selectedCodes"
                :disabled="isRunning"
              />
              <span class="stock-code">{{ stock.stockCode }}</span>
              <span class="stock-name">{{ stock.stockName }}</span>
            </label>
            <span
              class="stock-status"
              :class="`status-${getRowStatus(stock.stockCode).status}`"
              :title="getRowStatus(stock.stockCode).title"
            >
              <span v-if="getRowStatus(stock.stockCode).status === 'downloading'" class="spinner"></span>
              {{ getRowStatus(stock.stockCode).text }}
            </span>
          </li>
        </ul>
      </div>

      <!-- 下载参数（下载过程中禁用） -->
      <fieldset class="download-options" :disabled="isRunning">
        <DateRangePicker :model-value="dateRange" @change="handleDateChange" />

        <div class="adjust-type-section">
          <label class="section-label">复权类型：</label>
          <div class="checkbox-group">
            <label class="checkbox-item">
              <input type="checkbox" value="" v-model="adjustTypes" @change="handleAdjustTypeChange" />
              <span>不复权</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" value="qfq" v-model="adjustTypes" @change="handleAdjustTypeChange" />
              <span>前复权</span>
            </label>
          </div>
        </div>
      </fieldset>

      <span v-if="validationError" class="error-message">{{ validationError }}</span>
      <span v-if="summaryText" class="summary-line" :class="{ 'summary-failed': summaryHasFailure }">
        {{ summaryText }}
      </span>

      <div class="dialog-actions">
        <button class="btn-cancel" :disabled="isRunning" @click="handleCancel">
          {{ isRunning ? '下载中' : '关闭' }}
        </button>
        <button class="btn-confirm" :disabled="!canSubmit" @click="handleConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
.batch-download-dialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stock-select-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  overflow: hidden;

  .stock-select-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background-color: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
  }

  .selected-count {
    font-size: 13px;
    color: #6b7280;
  }

  .empty-hint {
    margin: 0;
    padding: 16px 12px;
    font-size: 13px;
    color: #6b7280;
    text-align: center;
  }
}

.stock-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
}

.stock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid #f3f4f6;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: #f9fafb;
  }
}

.stock-select {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  min-width: 0;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--color-primary);
    flex-shrink: 0;
  }

  .stock-code {
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    color: #111827;
  }

  .stock-name {
    font-size: 13px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.stock-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 55%;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.status-pending {
    color: #9ca3af;
  }

  &.status-downloading {
    color: var(--color-primary);
  }

  &.status-success {
    color: #16a34a;
  }

  &.status-failed {
    color: #ef4444;
  }
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.download-options {
  border: none;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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
  }
}

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

.error-message {
  font-size: 12px;
  color: #ef4444;
}

.summary-line {
  font-size: 13px;
  color: #16a34a;

  &.summary-failed {
    color: #ef4444;
  }
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

  &:hover:not(:disabled) {
    background-color: #e5e7eb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-confirm {
  background-color: var(--color-primary);
  color: white;

  &:hover:not(:disabled) {
    background-color: var(--color-primary-dark);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
