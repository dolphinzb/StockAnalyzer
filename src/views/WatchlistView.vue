<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import IndexStatusBar from '../components/IndexStatusBar.vue';
import KlineBatchDownloadDialog from '../components/KlineBatchDownloadDialog.vue';
import KlineChartDialog from '../components/KlineChartDialog.vue';
import KlineDownloadDialog from '../components/KlineDownloadDialog.vue';
import RefreshButton from '../components/RefreshButton.vue';
import StockEditor from '../components/StockEditor.vue';
import StockList from '../components/StockList.vue';
import { useToast } from '../composables/useToast';
import { useWatchlistStore } from '../stores/watchlist';

defineOptions({
  name: 'WatchlistView'
});

const store = useWatchlistStore();
const { showToast } = useToast();
const showEditor = ref(false);
const editingStock = ref<number | null>(null);

// K线下载对话框状态
const showKlineDialog = ref(false);
const klineDownloadStock = ref<{ stockCode: string; stockName: string }>({ stockCode: '', stockName: '' });

// 批量下载对话框状态
const showBatchDialog = ref(false);
const batchStocks = computed(() =>
  store.sortedStocks.map(stock => ({ stockCode: stock.stockCode, stockName: stock.stockName }))
);

const sortedStocks = computed(() => store.sortedStocks);
const lastRefreshTime = computed(() => store.lastRefreshTime);
const isRefreshing = computed(() => store.isRefreshing);

onMounted(async () => {
  await store.fetchStocks();
});

function handleAddStock() {
  editingStock.value = null;
  showEditor.value = true;
}

function handleEditStock(stockId: number) {
  editingStock.value = stockId;
  showEditor.value = true;
}

function handleCloseEditor() {
  showEditor.value = false;
  editingStock.value = null;
}

async function handleSaveStock(data: { stockCode: string; stockName: string; buyThreshold: number; sellThreshold: number }) {
  try {
    if (editingStock.value !== null) {
      await store.updateStock(editingStock.value, {
        buyThreshold: data.buyThreshold,
        sellThreshold: data.sellThreshold,
      });
    } else {
      await store.addStock(data);
    }
    handleCloseEditor();
  } catch (error) {
    console.error('Failed to save stock:', error);
    throw error;
  }
}

async function handleDeleteStock(stockId: number) {
  if (confirm('确定要删除这只股票吗？')) {
    await store.deleteStock(stockId);
  }
}

function handleToggleMonitor(stockId: number, enabled: boolean) {
  store.updateStock(stockId, { monitorEnabled: enabled });
}

/** 处理下载K线按钮点击，打开下载对话框 */
function handleDownloadKline(stockCode: string) {
  const stock = sortedStocks.value.find(s => s.stockCode === stockCode);
  if (stock) {
    klineDownloadStock.value = { stockCode: stock.stockCode, stockName: stock.stockName };
    showKlineDialog.value = true;
  }
}

/** 处理K线下载确认（T108-T110：传递adjustTypes参数并更新Toast通知） */
async function handleKlineDownload(payload: {
  stockCode: string;
  startDate: string;
  endDate: string;
  adjustTypes: ('' | 'qfq')[];
}) {
  const result = await store.downloadKline(
    payload.stockCode,
    payload.startDate,
    payload.endDate,
    payload.adjustTypes
  );

  // T109-T110：根据用户选择的复权类型显示结果
  if (result.success) {
    const parts: string[] = [];
    if (payload.adjustTypes.includes('') && result.unadjustedCount !== undefined) {
      parts.push(`${result.unadjustedCount} 条不复权数据`);
    }
    if (payload.adjustTypes.includes('qfq') && result.adjustedCount !== undefined) {
      parts.push(`${result.adjustedCount} 条前复权数据`);
    }
    const message = `下载完成，共获取 ${parts.join('，')}`;
    showToast(message, 'success', 3000);
  } else {
    // 部分失败或全部失败
    const errors: string[] = [];
    if (result.unadjustedError) {
      errors.push(`不复权：${result.unadjustedError}`);
    }
    if (result.adjustedError) {
      errors.push(`前复权：${result.adjustedError}`);
    }
    const errorMessage = errors.length > 0 ? errors.join('；') : (result.error || '未知错误');
    showToast(`下载失败：${errorMessage}`, 'error', 0);
  }
}

/** 打开批量下载弹窗（清空上次的逐只状态与汇总） */
function handleOpenBatchDownload() {
  if (store.isBatchDownloading) return;
  store.resetBatchDownloadState();
  showBatchDialog.value = true;
}

/** 处理批量下载确认，完成后用 Toast 汇总提示 */
async function handleBatchDownload(payload: {
  stockCodes: string[];
  startDate: string;
  endDate: string;
  adjustTypes: ('' | 'qfq')[];
}) {
  const summary = await store.downloadKlineBatch(payload);

  // 整体失败（参数校验/任务互斥等），逐只原因保留在弹窗内
  if (summary.error && summary.results.length === 0) {
    showToast(`批量下载失败：${summary.error}`, 'error', 0);
    return;
  }

  if (summary.failedCount === 0) {
    showToast(`批量下载完成，成功 ${summary.successCount} 只`, 'success', 3000);
  } else {
    showToast(`批量下载完成，成功 ${summary.successCount} 只，失败 ${summary.failedCount} 只`, 'error', 0);
  }
}

/** 处理股票名称点击，打开K线弹窗 */
function handleShowKlineChart(stockCode: string, stockName: string) {
  store.openKlineChart(stockCode, stockName);
}

/** 处理K线弹窗关闭 */
function handleCloseKlineChart() {
  store.closeKlineChart();
}
</script>

<template>
  <div class="watchlist-view">
    <header class="watchlist-header">
      <h2>自选股</h2>
      <div class="header-actions">
        <span v-if="lastRefreshTime" class="last-refresh">
          最后刷新: {{ new Date(lastRefreshTime).toLocaleString() }}
        </span>
        <RefreshButton @refresh="store.refreshPrices" :loading="isRefreshing" />
        <button
          class="btn-secondary"
          :disabled="sortedStocks.length === 0 || store.isBatchDownloading"
          @click="handleOpenBatchDownload"
        >
          下载K线
        </button>
        <button class="btn-add" @click="handleAddStock">添加股票</button>
      </div>
    </header>

    <StockList
      :stocks="sortedStocks"
      @edit="handleEditStock"
      @delete="handleDeleteStock"
      @toggle-monitor="handleToggleMonitor"
      @download-kline="handleDownloadKline"
      @show-kline-chart="handleShowKlineChart"
    />

    <StockEditor
      v-if="showEditor"
      :stock-id="editingStock"
      :stock="editingStock !== null ? (sortedStocks.find(s => s.id === editingStock) ?? null) : null"
      @save="handleSaveStock"
      @close="handleCloseEditor"
    />

    <KlineDownloadDialog
      v-model="showKlineDialog"
      :stock-code="klineDownloadStock.stockCode"
      :stock-name="klineDownloadStock.stockName"
      @download="handleKlineDownload"
    />

    <KlineBatchDownloadDialog
      v-model="showBatchDialog"
      :stocks="batchStocks"
      :state="store.batchDownloadState"
      @download="handleBatchDownload"
    />

    <KlineChartDialog
      v-model="store.klineChartDialog.visible"
      :stock-code="store.klineChartDialog.stockCode"
      :stock-name="store.klineChartDialog.stockName"
      @update:model-value="handleCloseKlineChart"
    />

    <div v-if="sortedStocks.length === 0 && !store.isLoading" class="empty-state">
      <p>暂无自选股</p>
      <button class="btn-add" @click="handleAddStock">添加第一只股票</button>
    </div>

    <!-- 指数状态栏 -->
    <IndexStatusBar :index-data-state="store.indexDataState" />
  </div>
</template>

<style scoped lang="scss">
.watchlist-view {
  padding: 1rem;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.watchlist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;

  h2 {
    font-size: 1.5rem;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .last-refresh {
    font-size: 0.875rem;
    color: var(--text-secondary);
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
    background-color: var(--color-primary-dark);
  }
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background-color: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;

  &:hover:not(:disabled) {
    background-color: var(--color-primary);
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--text-secondary);

  p {
    margin-bottom: 1rem;
    font-size: 1.125rem;
  }
}
</style>
