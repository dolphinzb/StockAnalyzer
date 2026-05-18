<template>
  <div class="transfer-record-item">
    <span class="col-date">{{ record.transferDate }}</span>
    <span class="col-type">
      <span class="type-badge" :class="record.type">
        {{ getTypeLabel(record.type) }}
      </span>
    </span>
    <span class="col-amount amount-positive">¥{{ formatAmount(record.amount) }}</span>
    <span class="col-balance">¥{{ formatAmount(record.accountBalance) }}</span>
    <span class="col-actions">
      <button class="btn-edit" @click="$emit('edit', record)" title="编辑">
        ✏️
      </button>
      <button class="btn-delete" @click="$emit('delete', record)" title="删除">
        🗑️
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { TransferRecord } from '../../shared/types';

interface Props {
  record: TransferRecord;
}

defineProps<Props>();

defineEmits<{
  edit: [record: TransferRecord];
  delete: [record: TransferRecord];
}>();

const formatAmount = (amount: number | undefined | null | string): string => {
  // 处理空值、空字符串或非数字的情况
  if (amount === undefined || amount === null || amount === '') {
    return '0.00';
  }
  
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    return '0.00';
  }
  
  return numAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const getTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'IN': '转入',
    'OUT': '转出',
    'DIVIDEND': '股息',
    'DIVIDEND_TAX': '股息扣税',
    'STOCK_BUY': '股票买入',
    'STOCK_SELL': '股票卖出',
    'INTEREST': '利息',
  };
  return labels[type] || type;
};
</script>

<style scoped lang="scss">
.transfer-record-item {
  display: grid;
  grid-template-columns: 100px 120px 120px 120px 100px;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.875rem;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: var(--bg-highlight);
  }
}

.transfer-record-item > span {
  text-align: center;
  font-family: monospace;
}

.col-type {
  display: flex;
  justify-content: center;
}

.type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;

  &.IN {
    background-color: #d1fae5;
    color: #065f46;
  }

  &.OUT {
    background-color: #fee2e2;
    color: #991b1b;
  }

  &.DIVIDEND {
    background-color: #dbeafe;
    color: #1e40af;
  }

  &.DIVIDEND_TAX {
    background-color: #fef3c7;
    color: #92400e;
  }

  &.STOCK_BUY {
    background-color: #fce7f3;
    color: #9f1239;
  }

  &.STOCK_SELL {
    background-color: #dcfce7;
    color: #166534;
  }

  &.INTEREST {
    background-color: #e0e7ff;
    color: #3730a3;
  }
}

.col-amount {
  font-weight: 600;
}

.amount-positive {
  color: #e53935; /* A股红涨 */
}

.amount-negative {
  color: #43a047; /* A股绿跌 */
}

.col-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
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
