<script setup lang="ts">
import { computed } from 'vue';
import type { WatchlistStock } from '../types';
import { useWatchlistStore } from '../stores/watchlist';

const props = defineProps<{
  stock: WatchlistStock;
}>();

const store = useWatchlistStore();

const emit = defineEmits<{
  edit: [stockId: number];
  delete: [stockId: number];
  toggleMonitor: [stockId: number, enabled: boolean];
}>();

function handleEdit() {
  emit('edit', props.stock.id);
}

function handleDelete() {
  emit('delete', props.stock.id);
}

function handleToggleMonitor(event: Event) {
  const target = event.target as HTMLInputElement;
  emit('toggleMonitor', props.stock.id, target.checked);
}

const currentPrice = computed(() => store.getCurrentPrice(props.stock.stockCode));

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) {
    return '-';
  }
  return `¥${price.toFixed(2)}`;
}

function getPriceColorClass(price: number | null): string {
  if (price === null || price === undefined) {
    return '';
  }
  if (price >= props.stock.sellThreshold) {
    return 'price-sell';
  }
  if (price <= props.stock.buyThreshold) {
    return 'price-buy';
  }
  return '';
}
</script>

<template>
  <div class="stock-item" :class="{ 'monitor-enabled': stock.monitorEnabled }">
    <span class="col-code">{{ stock.stockCode }}</span>
    <span class="col-name">{{ stock.stockName }}</span>
    <span class="col-price" :class="getPriceColorClass(currentPrice)">{{ formatPrice(currentPrice) }}</span>
    <span class="col-threshold">{{ formatPrice(stock.buyThreshold) }}</span>
    <span class="col-threshold">{{ formatPrice(stock.sellThreshold) }}</span>
    <span class="col-monitor">
      <label class="switch">
        <input
          type="checkbox"
          :checked="stock.monitorEnabled"
          @change="handleToggleMonitor"
        />
        <span class="slider"></span>
      </label>
    </span>
    <span class="col-actions">
      <button class="btn-edit" @click="handleEdit">编辑</button>
      <button class="btn-delete" @click="handleDelete">删除</button>
    </span>
  </div>
</template>

<style scoped lang="scss">
.stock-item {
  display: grid;
  grid-template-columns: 100px 100px 100px 100px 100px 80px 120px;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.875rem;

  &:last-child {
    border-bottom: none;
  }

  &.monitor-enabled {
    background-color: var(--bg-highlight);
  }
}

.col-code {
  font-family: monospace;
}

.col-price,
.col-threshold {
  text-align: right;
  font-family: monospace;
}

.price-sell {
  color: #e53935;
  font-weight: 600;
}

.price-buy {
  color: #43a047;
  font-weight: 600;
}

.col-monitor {
  display: flex;
  justify-content: center;
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: 0.3s;
    border-radius: 22px;

    &:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: var(--color-success, #4caf50);
  }

  input:checked + .slider:before {
    transform: translateX(18px);
  }
}

.col-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-edit,
.btn-delete {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-edit {
  background-color: var(--color-primary);
  color: white;

  &:hover {
    background-color: var(--color-primary-dark);
  }
}

.btn-delete {
  background-color: var(--color-danger, #f44336);
  color: white;

  &:hover {
    background-color: var(--color-danger-dark);
  }
}
</style>
