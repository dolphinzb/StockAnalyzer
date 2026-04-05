<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import PositionList from '../components/PositionList.vue';
import TradeEditor from '../components/TradeEditor.vue';
import { usePositionStore } from '../stores/position';

defineOptions({
  name: 'PositionView'
});

const positionStore = usePositionStore();
const isLoading = ref(false);
const showEditor = ref(false);
const expandedStockCode = ref<string | null>(null);
const editingRecord = ref<any | undefined>(undefined);
const refreshKey = ref(0);

const positions = computed(() => positionStore.positions);

onMounted(async () => {
  await loadPositions();
  const unsubPrice = positionStore.setupPriceListener();
  onUnmounted(() => {
    unsubPrice();
  });
});

async function loadPositions() {
  isLoading.value = true;
  try {
    const data = await window.positionApi.getPositions();
    positionStore.updatePositions(data);
    const stockCodes = data.map(p => p.stockCode);
    if (stockCodes.length > 0) {
      const priceResults = await window.positionApi.fetchPrices(stockCodes);
      priceResults.forEach(result => {
        if (result.success) {
          positionStore.handlePriceUpdate(result.stockCode, result.price);
        }
      });
    }
  } catch (error) {
    console.error('Failed to load positions:', error);
  } finally {
    isLoading.value = false;
  }
}

function handleToggleExpand(stockCode: string) {
  if (expandedStockCode.value === stockCode) {
    expandedStockCode.value = null;
  } else {
    expandedStockCode.value = stockCode;
  }
}

function handleAddTrade() {
  editingRecord.value = undefined;
  showEditor.value = true;
}

function handleEditRecord(record: any) {
  editingRecord.value = record;
  showEditor.value = true;
}

async function handleDeleteRecord(id: number) {
  if (!confirm('确定要删除这条交易记录吗？')) {
    return;
  }
  try {
    await window.positionApi.deleteTradeRecord(id);
    await loadPositions();
    refreshKey.value++;
  } catch (error) {
    console.error('Failed to delete trade:', error);
    throw error;
  }
}

function handleCloseEditor() {
  showEditor.value = false;
  editingRecord.value = undefined;
}

async function handleSaveTrade(data: any) {
  try {
    if (data.id) {
      await window.positionApi.updateTradeRecord(data);
    } else {
      await window.positionApi.addTradeRecord(data);
    }
    handleCloseEditor();
    await loadPositions();
    refreshKey.value++;
  } catch (error) {
    console.error('Failed to save trade:', error);
    throw error;
  }
}
</script>

<template>
  <div class="position-view">
    <header class="position-header">
      <h2>持仓</h2>
      <button class="btn-add" @click="handleAddTrade">新增交易</button>
    </header>

    <div v-if="isLoading" class="loading">加载中...</div>
    <div v-else-if="positions.length === 0" class="empty-state">
      <p>暂无持仓</p>
    </div>
    <PositionList
      v-else
      :positions="positions"
      :expanded-stock-code="expandedStockCode"
      :refresh-key="refreshKey"
      @toggle="handleToggleExpand"
      @edit-record="handleEditRecord"
      @delete-record="handleDeleteRecord"
    />

    <TradeEditor
      v-if="showEditor"
      :record="editingRecord"
      @save="handleSaveTrade"
      @close="handleCloseEditor"
    />
  </div>
</template>

<style scoped lang="scss">
.position-view {
  padding: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.position-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;

  h2 {
    font-size: 1.5rem;
    margin: 0;
  }
}

.btn-add {
  padding: 0.5rem 1rem;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;

  &:hover {
    opacity: 0.9;
  }
}

.loading,
.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-secondary);
}
</style>