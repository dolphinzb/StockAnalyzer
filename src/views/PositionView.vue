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
      const result = await window.positionApi.addTradeRecord(data);
      // 检查资金明细同步是否失败，显示Toast通知
      if (!result.fundSyncSuccess) {
        showToast(`资金明细同步失败：${result.fundSyncError || '未知错误'}，请手动补录`, 'warning');
      }
    }
    handleCloseEditor();
    await loadPositions();
    refreshKey.value++;
  } catch (error) {
    console.error('Failed to save trade:', error);
    throw error;
  }
}

/** Toast通知相关状态 */
const toastMessage = ref('');
const toastType = ref<'info' | 'warning' | 'error'>('info');
const toastVisible = ref(false);
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 显示Toast通知
 * @param message 通知消息
 * @param type 通知类型
 * @param duration 显示时长（毫秒），默认3000
 */
function showToast(message: string, type: 'info' | 'warning' | 'error' = 'info', duration: number = 3000) {
  toastMessage.value = message;
  toastType.value = type;
  toastVisible.value = true;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toastVisible.value = false;
  }, duration);
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

    <!-- Toast通知组件，用于显示资金明细同步失败等非阻塞提示 -->
    <Transition name="toast">
      <div v-if="toastVisible" class="toast" :class="`toast-${toastType}`">
        {{ toastMessage }}
      </div>
    </Transition>
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

/* Toast通知样式 */
.toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  padding: 0.75rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  z-index: 9999;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toast-warning {
  background-color: #fff3e0;
  color: #e65100;
  border: 1px solid #ffb74d;
}

.toast-error {
  background-color: #ffebee;
  color: #c62828;
  border: 1px solid #ef9a9a;
}

.toast-info {
  background-color: #e3f2fd;
  color: #1565c0;
  border: 1px solid #90caf9;
}

/* Toast过渡动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>