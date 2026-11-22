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
      <button class="btn btn-ghost btn-icon" @click="$emit('edit', record)" title="编辑">
        <AppIcon name="edit" :size="16" />
      </button>
      <button class="btn btn-ghost-danger btn-icon" @click="$emit('delete', record)" title="删除">
        <AppIcon name="trash" :size="16" />
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';
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
  grid-template-columns: 112px 120px 130px 130px 100px;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-sm);

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
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;

  /* 股票买入 - 原来股票卖出的样式 */
  &.STOCK_BUY {
    background-color: var(--bg-success-subtle);
    color: var(--color-success);
  }

  /* 股票卖出 - 原来股票买入的样式 */
  &.STOCK_SELL {
    background-color: var(--bg-danger-subtle);
    color: var(--color-danger-dark);
  }

  /* 转入 - 原来转出的样式 */
  &.IN {
    background-color: var(--bg-danger-subtle);
    color: var(--color-danger-dark);
  }

  /* 转出 - 原来转入的样式 */
  &.OUT {
    background-color: var(--bg-success-subtle);
    color: var(--color-success);
  }

  /* 股息 - 原来股息扣税的样式 */
  &.DIVIDEND {
    background-color: var(--bg-warning-subtle);
    color: var(--color-warning);
  }

  /* 股息扣税 - 原来股息的样式 */
  &.DIVIDEND_TAX {
    background-color: var(--bg-info-subtle);
    color: var(--color-primary-dark);
  }

  /* 利息 - 原来股息扣税的样式（与股息相同） */
  &.INTEREST {
    background-color: var(--bg-warning-subtle);
    color: var(--color-warning);
  }
}

.col-amount {
  font-weight: 600;
}

/* A股红涨绿跌：增加余额用红色，减少余额用绿色 */
.amount-increase {
  color: var(--color-profit); /* 红色 - 增加余额 */
}

.amount-decrease {
  color: var(--color-loss); /* 绿色 - 减少余额 */
}

.col-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-2);
}
</style>
