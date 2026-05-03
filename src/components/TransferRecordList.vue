<template>
  <div class="transfer-record-list">
    <!-- 工具栏 -->
    <div class="list-toolbar">
      <h2>转账记录</h2>
      <button class="btn-add" @click="$emit('add')">
        + 新增转账
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="store.isLoading && store.isEmpty" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="store.isEmpty" class="empty-state">
      <p>暂无转账记录</p>
      <button class="btn-add-first" @click="$emit('add')">添加第一笔转账</button>
    </div>

    <!-- 记录列表 -->
    <div v-else class="records-container">
      <TransferRecordItem
        v-for="record in store.transferRecords"
        :key="record.id"
        :record="record"
        @edit="$emit('edit', $event)"
        @delete="$emit('delete', $event)"
      />
      
      <!-- 无限滚动哨兵元素 -->
      <div ref="sentinelRef" class="scroll-sentinel">
        <div v-if="store.isLoading" class="loading-more">
          <p>加载更多...</p>
        </div>
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
import { useInfiniteScroll } from '../composables/useInfiniteScroll';
import TransferRecordItem from './TransferRecordItem.vue';
import type { TransferRecord } from '../../shared/types';

const store = useFundManagementStore();

// 设置无限滚动
const { sentinelRef } = useInfiniteScroll(
  () => store.fetchTransferRecords(false),
  () => store.hasMore,
  () => store.isLoading
);

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
  border-bottom: 1px solid #e5e7eb;
  background-color: #f9fafb;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #111827;
  }
}

.btn-add {
  padding: 8px 16px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #2563eb;
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
  color: #6b7280;

  p {
    margin-bottom: 16px;
    font-size: 16px;
  }
}

.btn-add-first {
  padding: 10px 20px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: #2563eb;
  }
}

.records-container {
  flex: 1;
  overflow-y: auto;
}

.scroll-sentinel {
  height: 20px;
}

.loading-more {
  text-align: center;
  padding: 16px;
  color: #6b7280;

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
