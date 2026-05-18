<template>
  <div class="transfer-record-list">
    <!-- 工具栏 -->
    <div class="list-toolbar">
      <h2>资金明细</h2>
      <button class="btn-add" @click="$emit('add')">
        + 新增记录
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="store.isLoading && store.isEmpty" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="store.isEmpty" class="empty-state">
      <p>暂无资金明细</p>
      <button class="btn-add-first" @click="$emit('add')">添加第一条记录</button>
    </div>

    <!-- 记录列表 - 表格形式 -->
    <div v-else class="records-table-container">
      <div class="records-table-header">
        <span class="col-date">日期</span>
        <span class="col-type">类型</span>
        <span class="col-amount">金额</span>
        <span class="col-balance">账户余额</span>
        <span class="col-actions">操作</span>
      </div>
      <div class="records-table-body">
        <TransferRecordItem
          v-for="record in store.transferRecords"
          :key="record.id"
          :record="record"
          @edit="$emit('edit', $event)"
          @delete="$emit('delete', $event)"
        />
      </div>
      
      <!-- 加载更多提示 -->
      <div v-if="isLoadingMore" class="loading-more">
        <p>加载中...</p>
      </div>
      <div v-else-if="!store.hasMore" class="loading-more">
        <p>已加载全部</p>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.error" class="error-message">
      <p>{{ store.error }}</p>
      <button @click="store.clearError">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useFundManagementStore } from '../stores/fundManagement';
import TransferRecordItem from './TransferRecordItem.vue';
import type { TransferRecord } from '../../shared/types';

const store = useFundManagementStore();

// 加载更多标志
const isLoadingMore = false;

/**
 * 加载更多数据
 */
async function loadMore() {
  if (isLoadingMore || !store.hasMore) return;
  
  // isLoadingMore.value = true;
  try {
    await store.fetchTransferRecords(false);
  } finally {
    // isLoadingMore.value = false;
  }
}

// 组件挂载时加载初始数据
onMounted(async () => {
  await store.fetchTransferRecords(true);
});

defineEmits<{
  add: [];
  edit: [record: TransferRecord];
  delete: [record: TransferRecord];
}>();
</script>

<style scoped lang="scss">
.transfer-record-list {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.list-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-secondary);

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.btn-add {
  padding: 8px 16px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: var(--color-primary-dark);
  }
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-secondary);

  p {
    margin-bottom: 16px;
    font-size: 16px;
  }
}

.btn-add-first {
  padding: 10px 20px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: var(--color-primary-dark);
  }
}

.records-table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.records-table-header {
  display: grid;
  grid-template-columns: 100px 120px 120px 120px 100px;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--bg-secondary);
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.records-table-body {
  flex: 1;
  overflow-y: auto;
}

.records-table-header span {
  text-align: center;
}

.loading-more {
  text-align: center;
  padding: 16px;
  color: var(--text-secondary);

  p {
    margin: 0;
    font-size: 14px;
  }
}

.error-message {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: #fee2e2;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;

  p {
    margin: 0;
    font-size: 14px;
  }

  button {
    background: none;
    border: none;
    color: #991b1b;
    cursor: pointer;
    font-size: 14px;
    text-decoration: underline;

    &:hover {
      color: #7f1d1d;
    }
  }
}
</style>
