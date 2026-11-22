<template>
  <div class="transfer-record-list">
    <!-- 工具栏 -->
    <div class="list-toolbar">
      <h2>资金明细</h2>
      <button class="btn btn-primary" @click="$emit('add')">
        + 新增记录
      </button>
    </div>

    <!-- 类型筛选器 -->
    <div class="filter-bar">
      <div class="filter-label">类型筛选：</div>
      <div class="filter-types">
        <button
          v-for="type in store.availableTypes"
          :key="type.value"
          class="filter-type-btn"
          :class="{ active: store.selectedTypes.has(type.value) }"
          @click="store.toggleType(type.value)"
        >
          {{ type.label }}
        </button>
      </div>
      <button
        v-if="store.hasFilter"
        class="btn btn-ghost-danger btn-sm"
        @click="store.clearFilter"
      >
        清除筛选
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="store.isLoading && store.isEmpty" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="store.isEmpty" class="empty-state">
      <p>暂无资金明细</p>
      <button class="btn btn-primary" @click="$emit('add')">添加第一条记录</button>
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
      <div ref="recordsContainerRef" class="records-table-body" @scroll="handleScroll">
        <TransferRecordItem
          v-for="record in store.transferRecords"
          :key="record.id"
          :record="record"
          @edit="$emit('edit', $event)"
          @delete="$emit('delete', $event)"
        />
        
        <!-- 加载更多提示 -->
        <div v-if="isLoadingMore" class="loading-more">
          <p>加载中...</p>
        </div>
        <div v-else-if="!store.hasMore" class="loading-more">
          <p>已加载全部</p>
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
import { onMounted, ref } from 'vue';
import { useFundManagementStore } from '../stores/fundManagement';
import TransferRecordItem from './TransferRecordItem.vue';
import type { TransferRecord } from '../../shared/types';

const store = useFundManagementStore();

// 滚动容器引用
const recordsContainerRef = ref<HTMLElement | null>(null);

// 加载更多标志
const isLoadingMore = ref(false);

/**
 * 处理滚动事件
 * 当滚动到底部且还有更多数据时，自动加载下一页
 */
function handleScroll(event: Event) {
  const container = event.target as HTMLElement;
  if (!container || !store.hasMore || isLoadingMore.value || store.isLoading) {
    return;
  }

  // 判断是否滚动到底部（距离底部不超过50px时触发加载）
  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollHeight - scrollTop - clientHeight <= 50) {
    loadMore();
  }
}

/**
 * 加载更多数据
 */
async function loadMore() {
  if (isLoadingMore.value || !store.hasMore) return;
  
  isLoadingMore.value = true;
  try {
    await store.fetchTransferRecords(false);
  } finally {
    isLoadingMore.value = false;
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
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-secondary);

  h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--text-primary);
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.filter-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.filter-types {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  flex: 1;
}

.filter-type-btn {
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background-color: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background-color: var(--bg-highlight);
    border-color: var(--color-primary);
  }

  &.active {
    background-color: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--text-on-color);
  }
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  color: var(--text-secondary);

  p {
    margin-bottom: var(--space-4);
    font-size: var(--font-size-md);
  }
}


.records-table-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.records-table-header {
  display: grid;
  grid-template-columns: 112px 120px 130px 130px 100px;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background-color: var(--bg-secondary);
  font-weight: 600;
  font-size: var(--font-size-sm);
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
  padding: var(--space-4);
  color: var(--text-secondary);

  p {
    margin: 0;
    font-size: var(--font-size-sm);
  }
}

.error-message {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: var(--bg-danger-subtle);
  color: var(--color-danger-dark);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  gap: var(--space-3);

  p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  button {
    background: none;
    border: none;
    color: var(--color-danger-dark);
    cursor: pointer;
    font-size: var(--font-size-sm);
    text-decoration: underline;

    &:hover {
      color: var(--color-danger-dark);
    }
  }
}
</style>
