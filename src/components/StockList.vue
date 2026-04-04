<script setup lang="ts">
import type { WatchlistStock } from '../types';
import StockItem from './StockItem.vue';

defineProps<{
  stocks: WatchlistStock[];
}>();

const emit = defineEmits<{
  edit: [stockId: number];
  delete: [stockId: number];
  toggleMonitor: [stockId: number, enabled: boolean];
}>();

function handleEdit(stockId: number) {
  emit('edit', stockId);
}

function handleDelete(stockId: number) {
  emit('delete', stockId);
}

function handleToggleMonitor(stockId: number, enabled: boolean) {
  emit('toggleMonitor', stockId, enabled);
}
</script>

<template>
  <div class="stock-list">
    <div class="stock-list-header">
      <span class="col-code">股票代码</span>
      <span class="col-name">名称</span>
      <span class="col-price">当前价格</span>
      <span class="col-threshold">买入阈值</span>
      <span class="col-threshold">卖出阈值</span>
      <span class="col-monitor">监控</span>
      <span class="col-actions">操作</span>
    </div>
    <div class="stock-list-body">
      <StockItem
        v-for="stock in stocks"
        :key="stock.id"
        :stock="stock"
        @edit="handleEdit"
        @delete="handleDelete"
        @toggle-monitor="handleToggleMonitor"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.stock-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.stock-list-header {
  display: grid;
  grid-template-columns: 100px 100px 100px 100px 100px 80px 120px;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--bg-secondary);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.stock-list-body {
  flex: 1;
  overflow-y: auto;
}

.col-code,
.col-name,
.col-price,
.col-threshold,
.col-monitor,
.col-actions {
  text-align: left;
}

.col-price,
.col-threshold {
  text-align: right;
}
</style>
