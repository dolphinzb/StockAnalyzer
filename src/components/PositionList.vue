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
.position-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.list-header {
  display: grid;
  grid-template-columns: 80px 90px 80px 70px 80px 80px 90px 70px 40px;
  gap: 0.5rem;
  padding: 0.5rem;
  background-color: var(--bg-header);
  font-size: 0.75rem;
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
  display: flex;
  flex-direction: column;
}
</style>