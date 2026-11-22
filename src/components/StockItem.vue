<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';
import { computed } from 'vue';
import { useWatchlistStore } from '../stores/watchlist';
import type { PriceUpdate, WatchlistStock } from '../types';
import { formatPrice, formatChange, formatChangePercent } from '../utils/formatPrice';

const props = defineProps<{
  stock: WatchlistStock;
}>();

const store = useWatchlistStore();

const emit = defineEmits<{
  edit: [stockId: number];
  delete: [stockId: number];
  toggleMonitor: [stockId: number, enabled: boolean];
  'download-kline': [stockCode: string];
  'show-kline-chart': [stockCode: string, stockName: string];
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

/** 处理下载K线按钮点击 */
function handleDownloadKline() {
  emit('download-kline', props.stock.stockCode);
}

/** 处理股票名称点击，弹出K线图 */
function handleShowKlineChart() {
  emit('show-kline-chart', props.stock.stockCode, props.stock.stockName);
}

const stockPrice = computed<PriceUpdate | null>(() => store.getStockPrice(props.stock.stockCode));
const currentPrice = computed(() => stockPrice.value?.price ?? null);
const openPrice = computed(() => stockPrice.value?.openPrice ?? null);
const highPrice = computed(() => stockPrice.value?.highPrice ?? null);
const lowPrice = computed(() => stockPrice.value?.lowPrice ?? null);
const priceChange = computed(() => stockPrice.value?.priceChange ?? null);
const priceChangePercent = computed(() => stockPrice.value?.priceChangePercent ?? null);

// 使用工具函数进行价格格式化，传入股票代码以自动判断精度
function formatPriceWithCode(price: number | null): string {
  return formatPrice(price, props.stock.stockCode);
}

function formatChangeWithCode(value: number | null): string {
  return formatChange(value, props.stock.stockCode);
}

function formatChangePercentWithCode(value: number | null): string {
  return formatChangePercent(value, props.stock.stockCode);
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

/** 涨跌颜色：A股红涨绿跌 */
function getChangeColorClass(value: number | null): string {
  if (value === null || value === undefined || value === 0) {
    return '';
  }
  return value > 0 ? 'price-up' : 'price-down';
}
</script>

<template>
  <div class="stock-item" :class="{ 'monitor-enabled': stock.monitorEnabled }">
    <span class="drag-handle" title="拖拽调整顺序">⋮⋮</span>
    <span class="col-code">{{ stock.stockCode }}</span>
    <span class="col-name col-name-clickable" :title="stock.stockName" @click="handleShowKlineChart">{{ stock.stockName }}</span>
    <span class="col-price">{{ formatPriceWithCode(openPrice) }}</span>
    <span class="col-price">{{ formatPriceWithCode(highPrice) }}</span>
    <span class="col-price">{{ formatPriceWithCode(lowPrice) }}</span>
    <span class="col-change" :class="getChangeColorClass(priceChange)">{{ formatChangeWithCode(priceChange) }}</span>
    <span class="col-change" :class="getChangeColorClass(priceChangePercent)">{{ formatChangePercentWithCode(priceChangePercent) }}</span>
    <span class="col-price" :class="getPriceColorClass(currentPrice)">{{ formatPriceWithCode(currentPrice) }}</span>
    <span class="col-threshold">{{ formatPriceWithCode(stock.buyThreshold) }}</span>
    <span class="col-threshold">{{ formatPriceWithCode(stock.sellThreshold) }}</span>
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
      <button
        class="btn btn-ghost btn-icon btn-sm"
        :class="{ 'is-loading': store.isDownloading(stock.stockCode) }"
        :disabled="store.isDownloading(stock.stockCode)"
        :title="store.isDownloading(stock.stockCode) ? '下载中' : '下载K线'"
        aria-label="下载K线"
        @click="handleDownloadKline"
      >
        <span v-if="store.isDownloading(stock.stockCode)" class="spinner"></span>
        <AppIcon v-else name="download" :size="16" />
      </button>
      <button class="btn btn-ghost btn-icon btn-sm" title="编辑" aria-label="编辑" @click="handleEdit">
        <AppIcon name="edit" :size="16" />
      </button>
      <button
        class="btn btn-ghost-danger btn-icon btn-sm"
        title="删除"
        aria-label="删除"
        @click="handleDelete"
      >
        <AppIcon name="trash" :size="16" />
      </button>
    </span>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/stock-grid' as *;

.stock-item {
  display: grid;
  grid-template-columns: $stock-list-columns;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  // 列表主内容与全局正文同档（16px）
  font-size: var(--font-size-sm);
  line-height: var(--line-height-tight);

  &:last-child {
    border-bottom: none;
  }

  &.monitor-enabled {
    background-color: var(--bg-highlight);
  }
}

.stock-item > span {
  text-align: center;
  font-family: monospace;
}

/* 固定列宽下超长代码/名称省略显示，避免文字溢到相邻列 */
.stock-item > .col-code,
.stock-item > .col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 拖拽手柄：仅此区域可拖动，避免与行内点击/按钮冲突 */
.stock-item > .drag-handle {
  cursor: grab;
  user-select: none;
  color: var(--text-secondary);
  font-family: inherit;
  letter-spacing: -2px;
  opacity: 0.5;
  transition: opacity 0.2s, color 0.2s;

  &:hover {
    opacity: 1;
    color: var(--color-info);
  }

  &:active {
    cursor: grabbing;
  }
}

/* 股票名称可点击样式 */
.col-name-clickable {
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: var(--color-info);
    text-decoration: underline;
  }
}

.price-sell {
  color: var(--color-profit);
  font-weight: 600;
}

.price-buy {
  color: var(--color-loss);
  font-weight: 600;
}

/* A股红涨绿跌 */
.price-up {
  color: var(--color-profit);
  font-weight: 600;
}

.price-down {
  color: var(--color-loss);
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
    background-color: var(--border-color);
    transition: 0.3s;
    border-radius: var(--radius-pill);

    &:before {
      position: absolute;
      content: "";
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: var(--bg-primary);
      transition: 0.3s;
      border-radius: var(--radius-circle);
    }
  }

  input:checked + .slider {
    background-color: var(--color-success, var(--color-success));
  }

  input:checked + .slider:before {
    transform: translateX(18px);
  }
}

.col-actions {
  display: flex;
  gap: var(--space-1);
  justify-content: center;

  // 操作按钮按内容宽度显示，不被 grid 列宽压缩
  > .btn {
    flex-shrink: 0;
  }
}

/** 加载动画 spinner */
.spinner {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--border-on-color-subtle);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-circle);
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
