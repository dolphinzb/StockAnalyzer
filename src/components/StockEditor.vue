<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { WatchlistStock, AddStockInput } from '../types';

const props = defineProps<{
  stockId: number | null;
  stock: WatchlistStock | null;
}>();

const emit = defineEmits<{
  save: [data: AddStockInput];
  close: [];
}>();

const stockCode = ref('');
const stockName = ref('');
const buyThreshold = ref<number | string>('');
const sellThreshold = ref<number | string>('');
const errorMessage = ref('');

const isEditing = computed(() => props.stockId !== null);

watch(() => props.stock, (newStock) => {
  if (newStock) {
    stockCode.value = newStock.stockCode;
    stockName.value = newStock.stockName;
    buyThreshold.value = newStock.buyThreshold;
    sellThreshold.value = newStock.sellThreshold;
  } else {
    stockCode.value = '';
    stockName.value = '';
    buyThreshold.value = '';
    sellThreshold.value = '';
  }
  errorMessage.value = '';
}, { immediate: true });

function validateForm(): boolean {
  if (!stockCode.value.trim()) {
    errorMessage.value = '请输入股票代码';
    return false;
  }
  if (!stockName.value.trim()) {
    errorMessage.value = '请输入股票名称';
    return false;
  }
  const buy = Number(buyThreshold.value);
  const sell = Number(sellThreshold.value);
  if (isNaN(buy) || buy <= 0) {
    errorMessage.value = '请输入有效的买入阈值';
    return false;
  }
  if (isNaN(sell) || sell <= 0) {
    errorMessage.value = '请输入有效的卖出阈值';
    return false;
  }
  if (sell <= buy) {
    errorMessage.value = '卖出阈值必须高于买入阈值';
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
      stockCode: stockCode.value.trim(),
      stockName: stockName.value.trim(),
      buyThreshold: Number(buyThreshold.value),
      sellThreshold: Number(sellThreshold.value),
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
  <div class="stock-editor-overlay" @click.self="handleClose">
    <div class="stock-editor">
      <div class="editor-header">
        <h3>{{ isEditing ? '编辑股票' : '添加股票' }}</h3>
        <button class="btn-close" @click="handleClose">×</button>
      </div>

      <form class="editor-form" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="stockCode">股票代码</label>
          <input
            id="stockCode"
            v-model="stockCode"
            type="text"
            :disabled="isEditing"
            placeholder="如: 600519"
          />
        </div>

        <div class="form-group">
          <label for="stockName">股票名称</label>
          <input
            id="stockName"
            v-model="stockName"
            type="text"
            :disabled="isEditing"
            placeholder="如: 贵州茅台"
          />
        </div>

        <div class="form-group">
          <label for="buyThreshold">买入阈值</label>
          <input
            id="buyThreshold"
            v-model="buyThreshold"
            type="number"
            step="0.01"
            placeholder="当价格低于此值时触发买入告警"
          />
        </div>

        <div class="form-group">
          <label for="sellThreshold">卖出阈值</label>
          <input
            id="sellThreshold"
            v-model="sellThreshold"
            type="number"
            step="0.01"
            placeholder="当价格高于此值时触发卖出告警"
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="handleClose">取消</button>
          <button type="submit" class="btn-submit">{{ isEditing ? '保存' : '添加' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
.stock-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.stock-editor {
  background-color: var(--bg-primary);
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
}

.form-group {
  margin-bottom: 1rem;

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
  }

  input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 0.875rem;

    &:focus {
      outline: none;
      border-color: var(--color-primary);
    }

    &:disabled {
      background-color: var(--bg-secondary);
      cursor: not-allowed;
    }
  }
}

.error-message {
  color: var(--color-danger, #f44336);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn-cancel,
.btn-submit {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-cancel {
  background-color: var(--bg-secondary);
  color: var(--text-primary);

  &:hover {
    background-color: var(--bg-hover);
  }
}

.btn-submit {
  background-color: var(--color-primary);
  color: white;

  &:hover {
    background-color: var(--color-primary-dark);
  }
}
</style>
