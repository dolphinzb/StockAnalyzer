<script setup lang="ts">
import Sortable from 'sortablejs';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { WatchlistStock } from '../types';
import { moveArrayItem } from '../utils/stockOrder';
import StockItem from './StockItem.vue';

const props = defineProps<{
  stocks: WatchlistStock[];
  /** 顺序保存中：禁用再次拖拽，避免交叉覆盖 */
  reordering?: boolean;
}>();

const emit = defineEmits<{
  edit: [stockId: number];
  delete: [stockId: number];
  toggleMonitor: [stockId: number, enabled: boolean];
  'download-kline': [stockCode: string];
  'show-kline-chart': [stockCode: string, stockName: string];
  reorder: [orderedIds: number[]];
}>();

const listBodyRef = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

onMounted(() => {
  if (!listBodyRef.value) {
    return;
  }
  sortable = Sortable.create(listBodyRef.value, {
    handle: '.drag-handle',
    animation: 150,
    ghostClass: 'drag-ghost',
    chosenClass: 'drag-chosen',
    onEnd: event => {
      const { oldIndex, newIndex } = event;
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
        return;
      }
      // 同步重排数组，使 Vue 渲染结果与 Sortable 已移动的 DOM 一致，避免顺序回跳
      const reordered = moveArrayItem(props.stocks, oldIndex, newIndex);
      emit('reorder', reordered.map(stock => stock.id));
    },
  });
  sortable.option('disabled', Boolean(props.reordering));
});

onBeforeUnmount(() => {
  sortable?.destroy();
  sortable = null;
});

// 顺序保存期间禁用拖拽
watch(
  () => props.reordering,
  value => {
    sortable?.option('disabled', Boolean(value));
  }
);

function handleEdit(stockId: number) {
  emit('edit', stockId);
}

function handleDelete(stockId: number) {
  emit('delete', stockId);
}

function handleToggleMonitor(stockId: number, enabled: boolean) {
  emit('toggleMonitor', stockId, enabled);
}

/** 处理下载K线事件 */
function handleDownloadKline(stockCode: string) {
  emit('download-kline', stockCode);
}

/** 处理股票名称点击，弹出K线图 */
function handleShowKlineChart(stockCode: string, stockName: string) {
  emit('show-kline-chart', stockCode, stockName);
}
</script>

<template>
  <div class="stock-list">
    <div class="stock-list-header">
      <span class="col-drag"></span>
      <span class="col-code">股票代码</span>
      <span class="col-name">名称</span>
      <span class="col-price">开盘价</span>
      <span class="col-price">最高价</span>
      <span class="col-price">最低价</span>
      <span class="col-change">涨跌额</span>
      <span class="col-change">涨跌幅</span>
      <span class="col-price">当前价格</span>
      <span class="col-threshold">买入阈值</span>
      <span class="col-threshold">卖出阈值</span>
      <span class="col-monitor">监控</span>
      <span class="col-actions">操作</span>
    </div>
    <div ref="listBodyRef" class="stock-list-body">
      <StockItem
        v-for="stock in stocks"
        :key="stock.id"
        :stock="stock"
        @edit="handleEdit"
        @delete="handleDelete"
        @toggle-monitor="handleToggleMonitor"
        @download-kline="handleDownloadKline"
        @show-kline-chart="handleShowKlineChart"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/stock-grid' as *;

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
  grid-template-columns: $stock-list-columns;
  gap: 0.375rem;
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

.stock-list-header span {
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* SortableJS 拖拽态（class 作用在 StockItem 根元素上） */
:deep(.drag-ghost) {
  opacity: 0.4;
  background-color: var(--bg-secondary);
}

:deep(.drag-chosen) {
  background-color: var(--bg-highlight);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
</style>
