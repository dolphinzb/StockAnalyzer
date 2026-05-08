<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import IndexStatusBar from '../components/IndexStatusBar.vue';
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

/** 处理K线下载确认 */
async function handleKlineDownload(payload: { stockCode: string; startDate: string; endDate: string }) {
  const result = await store.downloadKline(payload.stockCode, payload.startDate, payload.endDate);
  if (result.success) {
    showToast(`下载完成，共获取 ${result.count} 条K线数据`, 'success', 3000);
  } else {
    showToast(`下载失败：${result.error}`, 'error', 0);
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
