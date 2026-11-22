<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from './Modal.vue';
import type { AddStockInput, WatchlistStock, PositionAPI } from '../types';

// 声明全局 window 类型，包含 positionApi
declare global {
  interface Window {
    positionApi: PositionAPI;
  }
}

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
const isLoadingStockName = ref(false);

const isEditing = computed(() => props.stockId !== null);

// 自动获取股票名称的事件处理函数
async function handleStockCodeBlur() {
  await fetchStockName();
}

async function handleStockCodeEnter(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    await fetchStockName();
  }
}

// 调用 API 获取股票名称
async function fetchStockName() {
  const code = stockCode.value.trim();
  // 编辑模式下不触发自动获取
  if (!code || isEditing.value) {
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
  <Modal
    :model-value="true"
    :title="isEditing ? '编辑股票' : '添加股票'"
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
            :disabled="isEditing"
            placeholder="如: 600519"
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
          :disabled="isEditing"
          placeholder="如: 贵州茅台"
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="buyThreshold">买入阈值</label>
        <input
          id="buyThreshold"
          v-model="buyThreshold"
          class="input"
          type="number"
          step="0.01"
          placeholder="当价格低于此值时触发买入告警"
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="sellThreshold">卖出阈值</label>
        <input
          id="sellThreshold"
          v-model="sellThreshold"
          class="input"
          type="number"
          step="0.01"
          placeholder="当价格高于此值时触发卖出告警"
        />
      </div>

      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </form>

    <template #footer>
      <button type="button" class="btn btn-secondary" @click="handleClose">取消</button>
      <button type="button" class="btn btn-primary" @click="handleSubmit">
        {{ isEditing ? '保存' : '添加' }}
      </button>
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
    animation: pulse 1.5s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.error-message {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}
</style>
