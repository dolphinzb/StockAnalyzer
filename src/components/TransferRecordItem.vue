<template>
  <div class="transfer-record-item">
    <div class="record-info">
      <div class="record-date">{{ record.transferDate }}</div>
      <div class="record-details">
        <span class="record-type" :class="record.type">
          {{ getTypeLabel(record.type) }}
        </span>
        <span class="record-amount">¥{{ formatAmount(record.amount) }}</span>
        <span class="record-balance">余额: ¥{{ formatAmount(record.accountBalance) }}</span>
      </div>
    </div>
    <div class="record-actions">
      <button class="btn-edit" @click="$emit('edit', record)" title="编辑">
        ✏️
      </button>
      <button class="btn-delete" @click="$emit('delete', record)" title="删除">
        🗑️
      </button>
    </div>
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
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  transition: background-color 0.2s;

  &:hover {
    background-color: #f9fafb;
  }

  &:last-child {
    border-bottom: none;
  }
}

.record-info {
  flex: 1;
}

.record-date {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
}

.record-details {
  display: flex;
  align-items: center;
  gap: 12px;
}

.record-type {
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

.record-amount {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.record-balance {
  font-size: 13px;
  color: #6b7280;
  margin-left: auto;
}

.record-actions {
  display: flex;
  gap: 8px;
}

.btn-edit,
.btn-delete {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;

  &:hover {
    background-color: #e5e7eb;
  }
}

.btn-delete:hover {
  background-color: #fee2e2;
}
</style>
