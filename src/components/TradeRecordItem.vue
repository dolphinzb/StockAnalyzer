<script setup lang="ts">
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
  return price.toFixed(3);
}
</script>

<template>
  <div class="trade-record-item">
    <span class="col-code">{{ record.stockCode }}</span>
    <span class="col-name">{{ record.stockName }}</span>
    <span class="col-type" :class="getTradeTypeClass(record.tradeType)">
      {{ getTradeTypeLabel(record.tradeType) }}
    </span>
    <span class="col-date">{{ formatDate(record.tradeDate) }}</span>
    <span class="col-price">{{ formatPrice(record.tradePrice) }}</span>
    <span class="col-count">{{ record.tradeCount }}</span>
    <span class="col-holding-count">{{ record.holdingCount }}</span>
    <span class="col-holding-price">{{ formatPrice(record.holdingPrice) }}</span>
    <div class="col-actions">
      <button class="btn-edit" @click="emit('edit', record)" title="编辑">✎</button>
      <button class="btn-delete" @click="emit('delete', record.id)" title="删除">✕</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.trade-record-item {
  display: grid;
  grid-template-columns: 80px 90px 80px 100px 90px 90px 90px 100px 60px;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.875rem;
  align-items: center;

  &:hover {
    background-color: var(--hover-bg);
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
    color: var(--color-buy, #43a047);
  }

  &.type-sell {
    color: var(--color-sell, #e53935);
  }

  &.type-dividend {
    color: var(--color-dividend, #fb8c00);
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
  gap: 0.25rem;
  justify-content: center;

  button {
    background: none;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    cursor: pointer;
    padding: 0.2rem 0.4rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: all 0.2s;

    &:hover {
      background-color: var(--hover-bg);
    }
  }

  .btn-edit:hover {
    color: var(--color-primary, #1976d2);
    border-color: var(--color-primary, #1976d2);
  }

  .btn-delete:hover {
    color: var(--color-sell, #e53935);
    border-color: var(--color-sell, #e53935);
  }
}
</style>