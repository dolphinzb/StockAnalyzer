<template>
  <div class="transfer-record-item">
    <div class="record-info">
      <div class="record-date">{{ record.transferDate }}</div>
      <div class="record-details">
        <span class="record-type" :class="record.type">
          {{ record.type === 'IN' ? '转入' : '转出' }}
        </span>
        <span class="record-amount">¥{{ formatAmount(record.amount) }}</span>
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

const formatAmount = (amount: number): string => {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
}

.record-amount {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
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
