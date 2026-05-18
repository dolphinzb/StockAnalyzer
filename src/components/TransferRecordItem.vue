<template>
  <div class="transfer-record-item">
    <span class="col-date">{{ record.transferDate }}</span>
    <span class="col-type">
      <span class="type-badge" :class="record.type">
        {{ getTypeLabel(record.type) }}
      </span>
    </span>
    <span class="col-amount" :class="getAmountColorClass(record.type)">¥{{ formatAmount(record.amount) }}</span>
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

/**
 * 根据资金类型获取金额颜色类
 * 增加余额的类型使用红色，减少余额的类型使用绿色
 */
const getAmountColorClass = (type: string): string => {
  // 增加余额的类型：转入、股票卖出、利息、股息
  const increaseTypes = ['IN', 'STOCK_SELL', 'INTEREST', 'DIVIDEND'];
  return increaseTypes.includes(type) ? 'amount-increase' : 'amount-decrease';
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

  /* 股票买入 - 原来股票卖出的样式 */
  &.STOCK_BUY {
    background-color: #dcfce7;
    color: #166534;
  }

  /* 股票卖出 - 原来股票买入的样式 */
  &.STOCK_SELL {
    background-color: #fce7f3;
    color: #9f1239;
  }

  /* 转入 - 原来转出的样式 */
  &.IN {
    background-color: #fee2e2;
    color: #991b1b;
  }

  /* 转出 - 原来转入的样式 */
  &.OUT {
    background-color: #d1fae5;
    color: #065f46;
  }

  /* 股息 - 原来股息扣税的样式 */
  &.DIVIDEND {
    background-color: #fef3c7;
    color: #92400e;
  }

  /* 股息扣税 - 原来股息的样式 */
  &.DIVIDEND_TAX {
    background-color: #dbeafe;
    color: #1e40af;
  }

  /* 利息 - 原来股息扣税的样式（与股息相同） */
  &.INTEREST {
    background-color: #fef3c7;
    color: #92400e;
  }
}

.col-amount {
  font-weight: 600;
}

/* A股红涨绿跌：增加余额用红色，减少余额用绿色 */
.amount-increase {
  color: #e53935; /* 红色 - 增加余额 */
}

.amount-decrease {
  color: #43a047; /* 绿色 - 减少余额 */
}

.col-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.btn-edit,
.btn-delete {
  padding: 0.25rem 0.5rem;
  font-size: 1.125rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background-color: transparent;
  transition: all 0.2s;

  &:hover {
    background-color: var(--bg-highlight);
  }
}
</style>
