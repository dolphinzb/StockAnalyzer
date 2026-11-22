<script setup lang="ts">
import type { Position } from '../types';
import PositionItem from './PositionItem.vue';

defineProps<{
  positions: Position[];
  expandedStockCode: string | null;
  refreshKey?: number;
}>();

const emit = defineEmits<{
  toggle: [stockCode: string];
  editRecord: [record: any];
  deleteRecord: [id: number];
}>();

function handleToggle(stockCode: string) {
  emit('toggle', stockCode);
}

function handleEditRecord(record: any) {
  emit('editRecord', record);
}

function handleDeleteRecord(id: number) {
  emit('deleteRecord', id);
}
</script>

<template>
  <div class="position-list">
    <div class="list-header">
      <span>股票代码</span>
      <span>股票名称</span>
      <span>日期</span>
      <span>持仓</span>
      <span>成本</span>
      <span>现价</span>
      <span>盈亏</span>
      <span>比例</span>
      <span></span>
    </div>
    <div class="list-body">
      <PositionItem
        v-for="position in positions"
        :key="position.stockCode"
        :position="position"
        :is-expanded="expandedStockCode === position.stockCode"
        :refresh-key="refreshKey"
        @toggle="handleToggle"
        @edit-record="handleEditRecord"
        @delete-record="handleDeleteRecord"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/position-grid' as *;

.position-list {
  /* 占满视图剩余高度，让列表主体自身滚动：避免内容溢出被 overflow 裁掉最后一行 */
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.list-header {
  display: grid;
  grid-template-columns: $position-summary-columns;
  gap: var(--space-2);
  padding: var(--space-2);
  background-color: var(--bg-header);
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span:nth-child(3),
  span:nth-child(4),
  span:nth-child(5),
  span:nth-child(6),
  span:nth-child(7),
  span:nth-child(8) {
    text-align: right;
  }

  span:nth-child(9) {
    text-align: center;
  }
}

.list-body {
  /* 表头固定，列表主体滚动；滚动到底时最后一行完整可见 */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
</style>