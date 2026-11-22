<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import PositionList from '../components/PositionList.vue';
import TradeEditor from '../components/TradeEditor.vue';
import { useToast } from '../composables/useToast';
import { usePositionStore } from '../stores/position';

defineOptions({
  name: 'PositionView'
});

const positionStore = usePositionStore();
const { showToast } = useToast();
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
          // 去掉前缀，与持仓数据中的 stockCode 格式一致
          const codeWithoutPrefix = result.stockCode.replace(/^(sh|sz|bj)/, '');
          positionStore.handlePriceUpdate(codeWithoutPrefix, result.price);
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
      // 交易与资金明细在同一批次提交，失败时整个批次回滚并抛出异常
      await window.positionApi.addTradeRecord(data);
    }
    handleCloseEditor();
    await loadPositions();
    refreshKey.value++;
  } catch (error) {
    console.error('Failed to save trade:', error);
    showToast(
      `保存失败，未产生任何变更，请重试：${error instanceof Error ? error.message : '未知错误'}`,
      'error'
    );
  }
}

</script>

<template>
  <div class="page position-view">
    <header class="page-header">
      <h2 class="page-title">持仓</h2>
      <button class="btn btn-primary" @click="handleAddTrade">新增交易</button>
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
// 页面骨架与提示均由全局提供（.page / .page-header / .page-title / ToastNotification）
.loading,
.empty-state {
  padding: var(--space-6);
  font-size: var(--font-size-sm);
  text-align: center;
  color: var(--text-secondary);
}
</style>