<script setup lang="ts">
import { onMounted, ref } from 'vue';
import HistoricalTradeItem from '../components/HistoricalTradeItem.vue';
import { useHistoricalTradesStore } from '../stores/historicalTrades';

/**
 * 历史开仓记录页面
 * 展示所有已清仓股票的交易统计信息，按清仓时间倒序排列
 * 支持展开查看交易明细，同时只能展开一条记录
 */
defineOptions({
  name: 'HistoricalTradesView'
});

const historicalTradesStore = useHistoricalTradesStore();

/** 当前展开的记录 ID */
const expandedRecordId = ref<string | null>(null);
/** 刷新按钮加载状态 */
const isRefreshing = ref(false);

onMounted(async () => {
  await historicalTradesStore.fetchRecords();
});

/**
 * 刷新历史记录列表
 * 点击刷新按钮时重新加载数据
 */
async function handleRefresh(): Promise<void> {
  isRefreshing.value = true;
  try {
    await historicalTradesStore.fetchRecords();
  } finally {
    isRefreshing.value = false;
  }
}

/**
 * 处理展开/收起事件
 * 实现单次展开行为：同时只能展开一条交易明细
 */
function handleToggle(recordId: string): void {
  if (expandedRecordId.value === recordId) {
    // 如果点击的是已展开的记录，则收起
    expandedRecordId.value = null;
  } else {
    // 否则展开新的记录（自动收起之前的）
    expandedRecordId.value = recordId;
  }
}
</script>

<template>
  <div class="historical-trades-view">
    <header class="view-header">
      <h2>历史开仓记录</h2>
      <button
        class="refresh-button"
        :disabled="isRefreshing || historicalTradesStore.isLoading"
        @click="handleRefresh"
      >
        {{ isRefreshing ? '刷新中...' : '刷新' }}
      </button>
    </header>

    <div v-if="historicalTradesStore.isLoading" class="loading-state">
      <p>加载中...</p>
    </div>

    <div v-else-if="historicalTradesStore.error" class="error-state">
      <p>{{ historicalTradesStore.error }}</p>
    </div>

    <div v-else-if="historicalTradesStore.records.length === 0" class="empty-state">
      <p>暂无历史开仓记录</p>
    </div>

    <div v-else class="records-list">
      <HistoricalTradeItem
        v-for="record in historicalTradesStore.records"
        :key="record.id"
        :record="record"
        :is-expanded="expandedRecordId === record.id"
        @toggle="handleToggle"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.historical-trades-view {
  padding: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.view-header {
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    font-size: 1.5rem;
    margin: 0;
  }
}

.refresh-button {
  padding: 0.5rem 1rem;
  background-color: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.875rem;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background-color: var(--hover-bg);
    border-color: var(--primary-color);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.loading-state,
.error-state,
.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}

.error-state {
  color: var(--color-loss);
}

.records-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}
</style>
