<script setup lang="ts">
import { ref, watch } from 'vue';
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
  holdingCount: number;
  holdingPrice: number;
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
const holdingCount = ref<number | string>('');
const holdingPrice = ref<number | string>('');
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
    holdingCount.value = record.holdingCount;
    holdingPrice.value = record.holdingPrice;
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
      holdingCount: Number(holdingCount.value),
      holdingPrice: Number(holdingPrice.value),
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
  <div class="trade-editor-overlay" @click.self="handleClose">
    <div class="trade-editor">
      <div class="editor-header">
        <h3>{{ record ? '编辑交易记录' : '新增交易记录' }}</h3>
        <button class="btn-close" @click="handleClose">×</button>
      </div>

      <form class="editor-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="stockCode">股票代码</label>
          <div class="input-with-loading">
            <input
              id="stockCode"
              v-model="stockCode"
              type="text"
              placeholder="如: 600519"
              :disabled="!!record"
              @blur="handleStockCodeBlur"
              @keydown="handleStockCodeEnter"
            />
            <span v-if="isLoadingStockName" class="loading-indicator">...</span>
          </div>
        </div>

        <div class="form-group">
          <label for="stockName">股票名称</label>
          <input
            id="stockName"
            v-model="stockName"
            type="text"
            placeholder="如: 贵州茅台"
          />
        </div>

        <div class="form-group">
          <label for="tradeType">交易类型</label>
          <select id="tradeType" v-model="tradeType">
            <option value="BUY">买入</option>
            <option value="SELL">卖出</option>
            <option value="DIVIDEND">股息</option>
          </select>
        </div>

        <div class="form-group">
          <label for="tradeDate">交易日期</label>
          <input
            id="tradeDate"
            v-model="tradeDate"
            type="date"
          />
        </div>

        <div class="form-group">
          <label for="tradePrice">交易价格</label>
          <input
            id="tradePrice"
            v-model="tradePrice"
            type="number"
            step="0.001"
            placeholder="如: 1800.00"
          />
        </div>

        <div class="form-group">
          <label for="tradeCount">交易数量</label>
          <input
            id="tradeCount"
            v-model="tradeCount"
            type="number"
            step="1"
            placeholder="如: 100"
          />
          <span v-if="tradeType === 'DIVIDEND'" class="helper-text">股息类型数量请输入0</span>
        </div>

        <div v-if="record" class="form-group">
          <label for="holdingCount">持仓数量</label>
          <input
            id="holdingCount"
            v-model="holdingCount"
            type="number"
            step="1"
            placeholder="持仓数量"
          />
        </div>

        <div v-if="record" class="form-group">
          <label for="holdingPrice">持仓均价</label>
          <input
            id="holdingPrice"
            v-model="holdingPrice"
            type="number"
            step="0.001"
            placeholder="持仓均价"
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="handleClose">取消</button>
          <button type="submit" class="btn-submit">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
.trade-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(128, 128, 128, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.trade-editor {
  background-color: #ffffff;
  border-radius: 8px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 0;
    font-size: 1.125rem;
  }
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  line-height: 1;

  &:hover {
    color: var(--text-primary);
  }
}

.editor-form {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  input,
  select {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.875rem;
    background-color: var(--bg-primary);
    color: var(--text-primary);

    &:focus {
      outline: none;
      border-color: var(--color-primary);
    }

    &:disabled {
      background-color: var(--bg-secondary);
      cursor: not-allowed;
    }
  }

  select {
    cursor: pointer;
  }
}

.helper-text {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.error-message {
  padding: 0.5rem;
  background-color: rgba(229, 57, 53, 0.1);
  border: 1px solid var(--color-error, #e53935);
  border-radius: 4px;
  color: var(--color-error, #e53935);
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.btn-cancel,
.btn-submit {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-cancel {
  background-color: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);

  &:hover {
    background-color: var(--bg-secondary);
  }
}

.btn-submit {
  background-color: var(--color-primary);
  border: none;
  color: white;

  &:hover {
    opacity: 0.9;
  }
}
</style>