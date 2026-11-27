<script setup lang="ts">
/**
 * 股票列表页：浏览本地行情库 market_data.db 的证券名录（不含实时行情）。
 * 数据只经 market:securities:list 获取；加入自选复用 StockEditor 填写阈值。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import StockEditor from '../components/StockEditor.vue';
import { useNavigation } from '../composables/useNavigation';
import { useWatchlistStore } from '../stores/watchlist';
import type { AddStockInput } from '../types';
import type {
  MarketDataAPI,
  SecuritiesDirectoryItem,
  SecuritiesExchangeFilter,
  SecuritiesStatusFilter,
} from '../../shared/types';

defineOptions({
  name: 'SecuritiesDirectoryView',
});

declare global {
  interface Window {
    marketDataAPI?: MarketDataAPI;
  }
}

const { navigate } = useNavigation();
const watchlistStore = useWatchlistStore();

const keywordInput = ref('');
const keyword = ref('');
const exchange = ref<SecuritiesExchangeFilter>('ALL');
const status = ref<SecuritiesStatusFilter>('active');
const page = ref(1);
const pageSize = ref(50);
const jumpPage = ref<number | null>(null);

const items = ref<SecuritiesDirectoryItem[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref<string | null>(null);
const saveError = ref<string | null>(null);
const hasLoaded = ref(false);

let requestSeq = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const hasFilters = computed(
  () => keyword.value.trim() !== '' || exchange.value !== 'ALL' || status.value !== 'active'
);
const showEmpty = computed(
  () => hasLoaded.value && !error.value && !loading.value && total.value === 0
);
const showUnsynced = computed(() => showEmpty.value && !hasFilters.value);
const showNoMatch = computed(() => showEmpty.value && hasFilters.value);

const watchlistCodes = computed(
  () => new Set(watchlistStore.stocks.map((stock) => normalizeCode(stock.stockCode)))
);

const editorVisible = ref(false);
const editorCode = ref('');
const editorName = ref('');

function normalizeCode(code: string): string {
  return code.replace(/^(sh|sz|bj)/i, '').trim();
}

function inWatchlist(code: string): boolean {
  return watchlistCodes.value.has(normalizeCode(code));
}

function dateOrDash(value: string | null): string {
  return value || '—';
}

function exchangeLabel(value: SecuritiesDirectoryItem['exchange']): string {
  if (value === 'SH') {
    return '沪';
  }
  if (value === 'SZ') {
    return '深';
  }
  return '北';
}

async function loadPage(): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  error.value = null;
  const api = window.marketDataAPI;
  if (!api) {
    error.value = '行情库 API 不可用';
    loading.value = false;
    hasLoaded.value = true;
    return;
  }
  try {
    const result = await api.listSecurities({
      keyword: keyword.value,
      exchange: exchange.value,
      status: status.value,
      page: page.value,
      pageSize: pageSize.value,
    });
    if (seq !== requestSeq) {
      return;
    }
    items.value = result.items;
    total.value = result.total;
    hasLoaded.value = true;
    jumpPage.value = null;
  } catch (caught) {
    if (seq !== requestSeq) {
      return;
    }
    error.value = caught instanceof Error ? caught.message : String(caught);
    hasLoaded.value = true;
  } finally {
    if (seq === requestSeq) {
      loading.value = false;
    }
  }
}

function onKeywordInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  keywordInput.value = value;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    keyword.value = value.trim();
    page.value = 1;
    void loadPage();
  }, 300);
}

function onExchangeChange(event: Event): void {
  exchange.value = (event.target as HTMLSelectElement).value as SecuritiesExchangeFilter;
  page.value = 1;
  void loadPage();
}

function onStatusChange(event: Event): void {
  status.value = (event.target as HTMLSelectElement).value as SecuritiesStatusFilter;
  page.value = 1;
  void loadPage();
}

function onPageSizeChange(event: Event): void {
  pageSize.value = Number((event.target as HTMLSelectElement).value);
  page.value = 1;
  void loadPage();
}

function goToPage(target: number): void {
  if (target < 1 || target > totalPages.value || target === page.value) {
    return;
  }
  page.value = target;
  void loadPage();
}

function jumpToPage(): void {
  const target = Number(jumpPage.value);
  if (!Number.isFinite(target)) {
    return;
  }
  goToPage(Math.min(totalPages.value, Math.max(1, Math.trunc(target))));
}

function clearFilters(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  keywordInput.value = '';
  keyword.value = '';
  exchange.value = 'ALL';
  status.value = 'active';
  page.value = 1;
  void loadPage();
}

function openEditor(item: SecuritiesDirectoryItem): void {
  editorCode.value = item.code;
  editorName.value = item.name;
  editorVisible.value = true;
}

async function handleEditorSave(input: AddStockInput): Promise<void> {
  saveError.value = null;
  try {
    await watchlistStore.addStock(input);
    editorVisible.value = false;
  } catch (caught) {
    saveError.value = caught instanceof Error ? caught.message : String(caught);
  }
}

function goToMarketData(): void {
  navigate('market-data');
}

onMounted(() => {
  void loadPage();
});

onUnmounted(() => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});
</script>

<template>
  <div class="page securities-directory-view">
    <header class="page-header">
      <div class="title-block">
        <h1 class="page-title">股票列表</h1>
        <span class="page-subtitle">本地行情库中的全市场证券名录</span>
      </div>
      <div class="header-actions">
        <span v-if="hasLoaded && !error" class="result-count">共 {{ total }} 只证券</span>
        <button class="btn btn-secondary" :disabled="loading" @click="loadPage">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <section class="toolbar">
      <label class="filter-field filter-keyword">
        <span class="filter-label">关键字</span>
        <input
          class="search-input"
          type="search"
          placeholder="代码或名称，如 600519 / 银行"
          :value="keywordInput"
          @input="onKeywordInput"
        />
      </label>
      <label class="filter-field">
        <span class="filter-label">交易所</span>
        <select class="select" :value="exchange" @change="onExchangeChange">
          <option value="ALL">全部交易所</option>
          <option value="SH">沪市</option>
          <option value="SZ">深市</option>
          <option value="BJ">北交所</option>
        </select>
      </label>
      <label class="filter-field">
        <span class="filter-label">状态</span>
        <select class="select" :value="status" @change="onStatusChange">
          <option value="active">仅在市</option>
          <option value="all">含退市</option>
        </select>
      </label>
      <span v-if="loading" class="loading-hint">加载中…</span>
    </section>

    <p v-if="error || saveError" class="alert alert-danger">
      <span>{{ error ? `查询失败：${error}` : `加入自选失败：${saveError}` }}</span>
      <button class="btn btn-secondary" @click="error ? loadPage() : (saveError = null)">
        {{ error ? '重试' : '关闭' }}
      </button>
    </p>

    <div v-else-if="showUnsynced" class="empty-state">
      <h2>行情库尚未同步</h2>
      <p>证券名录为空。请先在「行情库」页执行全量回填，完成后即可在此浏览股票列表。</p>
      <button class="btn btn-primary" @click="goToMarketData">前往行情库</button>
    </div>

    <div v-else-if="showNoMatch" class="empty-state">
      <h2>无匹配证券</h2>
      <p>当前关键字或筛选条件下没有结果，试试放宽条件。</p>
      <button class="btn btn-secondary" @click="clearFilters">清空筛选</button>
    </div>

    <section v-else class="panel table-panel">
      <table class="result-table">
        <thead>
          <tr>
            <th>代码</th>
            <th>名称</th>
            <th>交易所</th>
            <th>上市日期</th>
            <th>退市日期</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.code">
            <td class="code-cell">{{ item.code }}</td>
            <td>{{ item.name }}</td>
            <td>{{ exchangeLabel(item.exchange) }}</td>
            <td>{{ dateOrDash(item.listDate) }}</td>
            <td>{{ dateOrDash(item.delistDate) }}</td>
            <td>
              <span class="status-badge" :class="item.isActive ? 'status-active' : 'status-delisted'">
                {{ item.isActive ? '在市' : '已退市' }}
              </span>
            </td>
            <td>
              <button
                class="btn btn-secondary btn-small"
                :disabled="inWatchlist(item.code)"
                @click="openEditor(item)"
              >
                {{ inWatchlist(item.code) ? '已在自选' : '加入自选' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="items.length === 0 && loading" class="empty">加载中…</p>
    </section>

    <footer v-if="!error && !showUnsynced && !showNoMatch" class="pagination">
      <button class="btn btn-secondary" :disabled="page <= 1 || loading" @click="goToPage(page - 1)">
        上一页
      </button>
      <span class="page-indicator">第 {{ page }} / {{ totalPages }} 页</span>
      <button
        class="btn btn-secondary"
        :disabled="page >= totalPages || loading"
        @click="goToPage(page + 1)"
      >
        下一页
      </button>
      <span class="jump-block">
        跳至
        <input
          v-model.number="jumpPage"
          class="jump-input"
          type="number"
          min="1"
          :max="totalPages"
          @keyup.enter="jumpToPage"
        />
        页
        <button class="btn btn-secondary btn-small" :disabled="loading" @click="jumpToPage">跳转</button>
      </span>
      <span class="page-size-block">
        每页
        <select class="select select-small" :value="pageSize" @change="onPageSizeChange">
          <option :value="20">20</option>
          <option :value="50">50</option>
          <option :value="100">100</option>
        </select>
        条
      </span>
    </footer>

    <StockEditor
      v-if="editorVisible"
      :stock-id="null"
      :stock="null"
      :initial-stock-code="editorCode"
      :initial-stock-name="editorName"
      @save="handleEditorSave"
      @close="editorVisible = false"
    />
  </div>
</template>

<style scoped lang="scss">
.securities-directory-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  min-height: 100%;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.title-block {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);

  h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
  }
}

.page-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.result-count {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: var(--space-2);
}

.search-input,
.select,
.jump-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-size: var(--font-size-sm);
}

// 全局 .select 固定高 36px，上下 padding 过大会挤压文字行高导致底部裁切
.select {
  padding: 0 var(--space-2);
}

.filter-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.filter-label {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.search-input {
  flex: 0 0 260px;
  width: 260px;
}

.loading-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);

  &.alert-danger {
    color: var(--color-danger-dark);
    background-color: var(--bg-danger-subtle);
    border: 1px solid var(--color-danger);
  }
}

.panel {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: auto;
}

.table-panel {
  padding: 0;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xs);

  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--border-color-light);
    white-space: nowrap;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    color: var(--text-secondary);
    font-weight: 500;
    background-color: var(--bg-tertiary);
  }

  tbody tr:hover {
    background-color: var(--bg-hover);
  }
}

.code-cell {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.status-badge {
  padding: 2px var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);

  &.status-active {
    color: #237804;
    background-color: var(--bg-success-subtle);
  }

  &.status-delisted {
    color: var(--text-tertiary);
    background-color: var(--bg-tertiary);
  }
}

.btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all 0.15s ease;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.btn-primary {
  color: var(--text-on-color);
  background-color: var(--color-primary);

  &:not(:disabled):hover {
    background-color: var(--color-primary-dark);
  }
}

.btn-secondary {
  color: var(--text-primary);
  background-color: var(--bg-primary);
  border-color: var(--border-color-strong);

  &:not(:disabled):hover {
    background-color: var(--bg-hover);
  }
}

.btn-small {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
}

.page-size-block {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.select-small {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  border: 1px dashed var(--border-color-strong);
  border-radius: var(--radius-lg);
  text-align: center;

  h2 {
    margin: 0;
    font-size: var(--font-size-lg);
  }

  p {
    margin: 0;
    max-width: 480px;
    font-size: var(--font-size-xs);
    line-height: 1.6;
    color: var(--text-secondary);
  }
}

.empty {
  margin: 0;
  padding: var(--space-4);
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.pagination {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.page-indicator {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.jump-block {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.jump-input {
  width: 72px;
  padding: var(--space-1) var(--space-2);
}
</style>
