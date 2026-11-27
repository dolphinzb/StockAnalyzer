<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import KlineBatchDownloadDialog from '../components/KlineBatchDownloadDialog.vue';
import KlineChartDialog from '../components/KlineChartDialog.vue';
import KlineDownloadDialog from '../components/KlineDownloadDialog.vue';
import RefreshButton from '../components/RefreshButton.vue';
import StockEditor from '../components/StockEditor.vue';
import StockList from '../components/StockList.vue';
import { useToast } from '../composables/useToast';
import { useWatchlistStore } from '../stores/watchlist';
import { KLINE_PERIOD_LABELS, type KlinePeriod } from '../types';
import { formatPeriodCounts } from '../utils/klinePeriodSummary';

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

/** 保存拖拽后的自选股顺序，失败时提示（store 内部已回滚） */
async function handleReorderStocks(orderedIds: number[]) {
  try {
    await store.reorderStocks(orderedIds);
  } catch (error) {
    console.error('Failed to save stock order:', error);
    showToast('顺序保存失败，已恢复原顺序', 'error', 3000);
  }
}

/** 处理下载K线按钮点击，打开下载对话框 */
function handleDownloadKline(stockCode: string) {
  const stock = sortedStocks.value.find(s => s.stockCode === stockCode);
  if (stock) {
    klineDownloadStock.value = { stockCode: stock.stockCode, stockName: stock.stockName };
    showKlineDialog.value = true;
  }
}

/** 处理K线下载确认（多周期：按周期展示各复权类型条数） */
async function handleKlineDownload(payload: {
  stockCode: string;
  startDate: string;
  endDate: string;
  adjustTypes: ('' | 'qfq')[];
  periods: KlinePeriod[];
}) {
  const result = await store.downloadKline(
    payload.stockCode,
    payload.startDate,
    payload.endDate,
    payload.adjustTypes,
    payload.periods
  );

  if (result.success) {
    // 多周期结果按「日线 …；周线 …」展示，使用完整文案（Toast 不截断）
    const { full } = formatPeriodCounts(result.byPeriod);
    showToast(`下载完成：${full}`, 'success', 3000);
  } else {
    // 按周期列出失败原因，保留成功周期的条数便于用户判断
    const failedPeriods = (result.byPeriod ?? []).filter(item => !item.success);
    const errorMessage = failedPeriods.length > 0
      ? failedPeriods
        .map(item => `${KLINE_PERIOD_LABELS[item.period]}：${item.error || '未获取到K线数据'}`)
        .join('；')
      : (result.error || '未知错误');
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
  periods: KlinePeriod[];
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
  <div class="page watchlist-view">
    <header class="page-header">
      <h2 class="page-title">自选股</h2>
      <div class="header-actions">
        <span v-if="lastRefreshTime" class="last-refresh">
          最后刷新: {{ new Date(lastRefreshTime).toLocaleString() }}
        </span>
        <RefreshButton @refresh="store.refreshPrices" :loading="isRefreshing" />
        <button
          class="btn btn-secondary"
          :disabled="sortedStocks.length === 0 || store.isBatchDownloading"
          @click="handleOpenBatchDownload"
        >
          下载K线
        </button>
        <button class="btn btn-primary" @click="handleAddStock">添加股票</button>
      </div>
    </header>

    <StockList
      :stocks="sortedStocks"
      :reordering="store.isReordering"
      @reorder="handleReorderStocks"
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
      <button class="btn btn-primary" @click="handleAddStock">添加第一只股票</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
// 页面骨架、按钮与空状态由全局基础类提供
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.last-refresh {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.empty-state p {
  font-size: var(--font-size-md);
}
</style>
