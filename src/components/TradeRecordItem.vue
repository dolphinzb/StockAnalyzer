<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';
const props = defineProps<{
  record: {
    id: number;
    stockCode: string;
    stockName: string;
    tradeDate: string;
    tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
    tradePrice: number;
    tradeCount: number;
    holdingCount: number;
    holdingPrice: number;
  };
}>();

const emit = defineEmits<{
  (e: 'edit', record: typeof props.record): void;
  (e: 'delete', id: number): void;
}>();

function formatDate(dateStr: string): string {
  return dateStr.split('T')[0];
}

function getTradeTypeLabel(type: string): string {
  switch (type) {
    case 'BUY':
      return '买入';
    case 'SELL':
      return '卖出';
    case 'DIVIDEND':
      return '股息';
    default:
      return type;
  }
}

function getTradeTypeClass(type: string): string {
  switch (type) {
    case 'BUY':
      return 'type-buy';
    case 'SELL':
      return 'type-sell';
    case 'DIVIDEND':
      return 'type-dividend';
    default:
      return '';
  }
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '-';
  // 最多显示4位小数，去掉末尾的0
  return parseFloat(price.toFixed(4)).toString();
}
</script>

<template>
  <div class="trade-record-item">
    <span class="col-code">{{ record.stockCode }}</span>
    <span class="col-name" :title="record.stockName">{{ record.stockName }}</span>
    <span class="col-type" :class="getTradeTypeClass(record.tradeType)">
      {{ getTradeTypeLabel(record.tradeType) }}
    </span>
    <span class="col-date">{{ formatDate(record.tradeDate) }}</span>
    <span class="col-price">{{ formatPrice(record.tradePrice) }}</span>
    <span class="col-count">{{ record.tradeCount }}</span>
    <span class="col-holding-count">{{ record.holdingCount }}</span>
    <span class="col-holding-price">{{ formatPrice(record.holdingPrice) }}</span>
    <div class="col-actions">
      <button class="btn btn-ghost btn-icon" @click="emit('edit', record)" title="编辑">
        <AppIcon name="edit" :size="16" />
      </button>
      <button class="btn btn-ghost-danger btn-icon" @click="emit('delete', record.id)" title="删除">
        <AppIcon name="trash" :size="16" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/position-grid' as *;

.trade-record-item {
  display: grid;
  grid-template-columns: $position-record-columns;
  gap: var(--space-2);
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  align-items: center;

  &:hover {
    background-color: var(--bg-hover);
  }
}

.col-code {
  font-weight: 500;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-type {
  font-weight: 500;
  text-align: center;

  &.type-buy {
    color: var(--color-buy, var(--color-loss));
  }

  &.type-sell {
    color: var(--color-sell, var(--color-profit));
  }

  &.type-dividend {
    color: var(--color-dividend, var(--color-warning));
  }
}

.col-date {
  color: var(--text-secondary);
}

.col-price,
.col-count,
.col-holding-count,
.col-holding-price {
  text-align: right;
  font-family: monospace;
}

.col-actions {
  display: flex;
  gap: var(--space-1);
  justify-content: center;

}
</style>