<script setup lang="ts">
import { ref, watch } from 'vue';
import Modal from './Modal.vue';
import type { PositionAPI } from '../types';

declare global {
  interface Window {
    positionApi: PositionAPI;
  }
}

interface TradeRecord {
  id?: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}

const props = defineProps<{
  record?: TradeRecord;
}>();

const emit = defineEmits<{
  save: [data: TradeRecord & { id?: number }];
  close: [];
}>();

const stockCode = ref('');
const stockName = ref('');
const tradeType = ref<'BUY' | 'SELL' | 'DIVIDEND'>('BUY');
const tradeDate = ref(new Date().toISOString().split('T')[0]);
const tradePrice = ref<number | string>('');
const tradeCount = ref<number | string>('');
const errorMessage = ref('');
const isLoadingStockName = ref(false);

watch(() => props.record, (record) => {
  if (record) {
    stockCode.value = record.stockCode;
    stockName.value = record.stockName;
    tradeType.value = record.tradeType;
    tradeDate.value = record.tradeDate.split('T')[0];
    tradePrice.value = record.tradePrice;
    tradeCount.value = record.tradeCount;
  }
}, { immediate: true });

async function handleStockCodeBlur() {
  await fetchStockName();
}

async function handleStockCodeEnter(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    await fetchStockName();
  }
}

async function fetchStockName() {
  const code = stockCode.value.trim();
  if (!code || props.record) {
    return;
  }

  isLoadingStockName.value = true;
  try {
    const result = await window.positionApi.getStockName(code);
    if (result.success && result.stockName) {
      stockName.value = result.stockName;
    }
  } catch (error) {
    console.error('Failed to fetch stock name:', error);
  } finally {
    isLoadingStockName.value = false;
  }
}

/**
 * 验证价格输入，确保最多4位小数
 */
function validatePriceInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const value = input.value;
  
  // 允许空值、数字和小数点
  if (value === '' || value === '.') {
    return;
  }
  
  // 验证格式：必须是有效的数字，且最多4位小数
  const regex = /^\d*\.?\d{0,4}$/;
  if (!regex.test(value)) {
    // 如果不符合格式，恢复到上一个有效值
    input.value = String(tradePrice.value);
    return;
  }
  
  // 更新对应的响应式变量
  if (input.id === 'tradePrice') {
    tradePrice.value = value;
  }
}

function validateForm(): boolean {
  if (!stockCode.value.trim()) {
    errorMessage.value = '请输入股票代码';
    return false;
  }
  if (!stockName.value.trim()) {
    errorMessage.value = '请输入股票名称';
    return false;
  }
  const price = Number(tradePrice.value);
  if (isNaN(price) || price <= 0) {
    errorMessage.value = '请输入有效的交易价格';
    return false;
  }
  const count = Number(tradeCount.value);
  if (tradeType.value === 'BUY' && (isNaN(count) || count <= 0)) {
    errorMessage.value = '请输入有效的交易数量';
    return false;
  }
  if (tradeType.value === 'SELL' && (isNaN(count) || count >= 0)) {
    errorMessage.value = '卖出数量请输入负数';
    return false;
  }
  if (tradeType.value === 'DIVIDEND' && (isNaN(count) || count !== 0)) {
    errorMessage.value = '股息类型数量请输入0';
    return false;
  }
  if (!tradeDate.value) {
    errorMessage.value = '请选择交易日期';
    return false;
  }
  return true;
}

async function handleSubmit() {
  errorMessage.value = '';
  if (!validateForm()) {
    return;
  }
  try {
    emit('save', {
      id: props.record?.id,
      stockCode: stockCode.value.trim(),
      stockName: stockName.value.trim(),
      tradeType: tradeType.value,
      tradeDate: tradeDate.value,
      tradePrice: Number(tradePrice.value),
      tradeCount: Number(tradeCount.value),
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败';
  }
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <Modal
    :model-value="true"
    :title="record ? '编辑交易记录' : '新增交易记录'"
    width="400px"
    :close-on-overlay-click="false"
    @update:model-value="handleClose"
  >
    <form class="editor-form" @submit.prevent="handleSubmit">
      <div class="form-item">
        <label class="form-label" for="stockCode">股票代码</label>
        <div class="input-with-loading">
          <input
            id="stockCode"
            v-model="stockCode"
            class="input"
            type="text"
            placeholder="如: 600519"
            :disabled="!!record"
            @blur="handleStockCodeBlur"
            @keydown="handleStockCodeEnter"
          />
          <span v-if="isLoadingStockName" class="loading-indicator">...</span>
        </div>
      </div>

      <div class="form-item">
        <label class="form-label" for="stockName">股票名称</label>
        <input
          id="stockName"
          v-model="stockName"
          class="input"
          type="text"
          placeholder="如: 贵州茅台"
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="tradeType">交易类型</label>
        <select id="tradeType" v-model="tradeType" class="select">
          <option value="BUY">买入</option>
          <option value="SELL">卖出</option>
          <option value="DIVIDEND">股息</option>
        </select>
      </div>

      <div class="form-item">
        <label class="form-label" for="tradeDate">交易日期</label>
        <input id="tradeDate" v-model="tradeDate" class="input" type="date" />
      </div>

      <div class="form-item">
        <label class="form-label" for="tradePrice">交易价格</label>
        <input
          id="tradePrice"
          v-model="tradePrice"
          class="input"
          type="text"
          inputmode="decimal"
          placeholder="如: 1800.0000"
          @input="validatePriceInput"
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="tradeCount">交易数量</label>
        <input
          id="tradeCount"
          v-model="tradeCount"
          class="input"
          type="number"
          step="1"
          placeholder="如: 100"
        />
        <span v-if="tradeType === 'DIVIDEND'" class="helper-text">股息类型数量请输入0</span>
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" @click="handleClose">取消</button>
      <button type="button" class="btn btn-primary" @click="handleSubmit">保存</button>
    </template>
  </Modal>
</template>

<style scoped lang="scss">
// 弹窗容器、标题栏、按钮、表单控件均由 Modal 与全局基础类提供
.editor-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.input-with-loading {
  position: relative;
  display: flex;
  align-items: center;

  .input {
    flex: 1;
  }

  .loading-indicator {
    position: absolute;
    right: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

.helper-text {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.error-message {
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  background-color: var(--bg-danger-subtle);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-sm);
}
</style>