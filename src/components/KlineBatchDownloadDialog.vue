<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';
import { computed, ref, watch } from 'vue';
import type { BatchDownloadState, BatchStockStatus } from '../stores/watchlist';
import { KLINE_PERIODS, KLINE_PERIOD_LABELS, type KlinePeriod } from '../types';
import { formatPeriodCounts } from '../utils/klinePeriodSummary';
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
  download: [payload: { stockCodes: string[]; startDate: string; endDate: string; adjustTypes: ('' | 'qfq')[]; periods: KlinePeriod[] }];
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

/** K线周期（多选，默认仅日线；未勾选任何周期时禁止提交） */
const periods = ref<KlinePeriod[]>(['d']);

/** 是否已全选周期 */
const allPeriodsSelected = computed(() => KLINE_PERIODS.every(period => periods.value.includes(period)));

/** 是否部分勾选周期（用于全选复选框半选状态） */
const partiallySelectedPeriods = computed(
  () => periods.value.length > 0 && !allPeriodsSelected.value
);

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
  if (periods.value.length === 0) return false;
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
 * 获取单只股票的状态展示信息
 * 成功时按周期展示各复权类型条数（行内截断、title 完整），失败时展示失败周期与原因
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
    const { short, full } = formatPeriodCounts(item.result?.byPeriod);
    // 图标由模板按 status 渲染，文案不再拼接字符
    return { status: 'success', text: short, title: full };
  }

  const error = item.error || item.result?.error || '未知错误';
  return { status: 'failed', text: error, title: error };
}

/** 弹窗打开时重置勾选与参数 */
watch(
  () => props.modelValue,
  visible => {
    if (!visible) return;

    selectedCodes.value = props.stocks.map(stock => stock.stockCode);
    dateRange.value = { startDate: getToday(), endDate: getToday() };
    adjustTypes.value = ['', 'qfq'];
    periods.value = ['d'];
    validationError.value = '';
  }
);

/** 处理周期全选切换 */
function handleToggleAllPeriods(event: Event) {
  const checked = (event.target as HTMLInputElement).checked;
  periods.value = checked ? [...KLINE_PERIODS] : [];
  validationError.value = '';
}

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

  if (periods.value.length === 0) {
    validationError.value = '请至少选择一个周期';
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
    // 周期按固定顺序（日→周→月）去重后传递，执行顺序不依赖勾选顺序
    periods: KLINE_PERIODS.filter(period => periods.value.includes(period)),
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
              <AppIcon
                v-else-if="getRowStatus(stock.stockCode).status === 'success'"
                name="check"
                :size="16"
              />
              <AppIcon
                v-else-if="getRowStatus(stock.stockCode).status === 'failed'"
                name="close"
                :size="16"
              />
              {{ getRowStatus(stock.stockCode).text }}
            </span>
          </li>
        </ul>
      </div>

      <!-- 下载参数（下载过程中禁用） -->
      <fieldset class="download-options" :disabled="isRunning">
        <DateRangePicker :model-value="dateRange" @change="handleDateChange" />

        <div class="period-section">
          <div class="period-header">
            <label class="section-label">周期：</label>
            <label class="select-all">
              <input
                type="checkbox"
                :checked="allPeriodsSelected"
                :indeterminate.prop="partiallySelectedPeriods"
                :disabled="isRunning"
                @change="handleToggleAllPeriods"
              />
              <span>全选</span>
            </label>
            <span class="selected-count">已选 {{ periods.length }} / 共 {{ KLINE_PERIODS.length }}</span>
          </div>
          <div class="checkbox-group">
            <label v-for="p in KLINE_PERIODS" :key="p" class="checkbox-item">
              <input type="checkbox" :value="p" v-model="periods" :disabled="isRunning" />
              <span>{{ KLINE_PERIOD_LABELS[p] }}</span>
            </label>
          </div>
        </div>

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
        <button class="btn btn-secondary" :disabled="isRunning" @click="handleCancel">
          {{ isRunning ? '下载中' : '关闭' }}
        </button>
        <button class="btn btn-primary" :disabled="!canSubmit" @click="handleConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
.batch-download-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.stock-select-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md);
  overflow: hidden;

  .stock-select-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color-light);
  }

  .selected-count {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .empty-hint {
    margin: 0;
    padding: var(--space-4) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
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
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--bg-tertiary);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: var(--bg-secondary);
  }
}

.stock-select {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .stock-name {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.stock-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
  max-width: 55%;
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.status-pending {
    color: var(--text-tertiary);
  }

  &.status-downloading {
    color: var(--color-primary);
  }

  &.status-success {
    color: var(--color-success);
  }

  &.status-failed {
    color: var(--color-danger);
  }
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-circle);
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
  gap: var(--space-4);
}

.adjust-type-section,
.period-section {
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
  }
}

.period-section {
  .period-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
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
}

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

.error-message {
  font-size: var(--font-size-xs);
  color: var(--color-danger);
}

.summary-line {
  font-size: var(--font-size-sm);
  color: var(--color-success);

  &.summary-failed {
    color: var(--color-danger);
  }
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

</style>
