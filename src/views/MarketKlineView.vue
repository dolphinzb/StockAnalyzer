<script setup lang="ts">
/**
 * K线查看页：从全市场行情库 market_data.db 读取任意证券的历史 K 线。
 * 只调用 market:securities:list（选股）与 market:kline:query（图表），不触发行情同步。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useKlineChart } from '../composables/useKlineChart';
import { useNavigation } from '../composables/useNavigation';
import { getPricePrecision } from '../utils/formatPrice';
import type {
  KlineData,
  KlinePeriod,
  MarketDataAPI,
  MarketKlineAdjust,
  MarketKlineBar,
  MarketKlinePeriod,
  SecuritiesDirectoryItem,
} from '../../shared/types';

defineOptions({
  name: 'MarketKlineView',
});

declare global {
  interface Window {
    marketDataAPI?: MarketDataAPI;
  }
}

const periodOptions: Array<{ value: MarketKlinePeriod; label: string }> = [
  { value: 'd', label: '日线' },
  { value: 'w', label: '周线' },
  { value: 'm', label: '月线' },
];

const adjustOptions: Array<{ value: MarketKlineAdjust; label: string }> = [
  { value: 'none', label: '不复权' },
  { value: 'qfq', label: '前复权' },
  { value: 'hfq', label: '后复权' },
];

const { marketKlineStockCode } = useNavigation();

const keywordInput = ref('');
const candidates = ref<SecuritiesDirectoryItem[]>([]);
const showCandidates = ref(false);
const selected = ref<SecuritiesDirectoryItem | null>(null);

const period = ref<MarketKlinePeriod>('d');
const adjust = ref<MarketKlineAdjust>('qfq');
const loading = ref(false);
const error = ref<string | null>(null);
const hasChart = ref(false);
const isEmpty = ref(false);

const canvasRef = ref<HTMLCanvasElement | null>(null);
const klineChart = useKlineChart(canvasRef);
/** 顶层引用供模板自动解包（ composable 内部 ref 不会在嵌套对象上自动解包） */
const klineTooltipInfo = klineChart.klineTooltipInfo;

const pricePrecision = computed(() =>
  selected.value ? getPricePrecision(selected.value.code) : 2
);

let searchSeq = 0;
let klineSeq = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function formatPrice(value: number): string {
  return value.toFixed(pricePrecision.value);
}

function formatChange(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(pricePrecision.value)}`;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(pricePrecision.value)}%`;
}

/** 主进程返回的统一结构映射为现有 Canvas 图表所需结构 */
function toKlineData(bars: MarketKlineBar[], stockCode: string): KlineData[] {
  return bars.map((bar, index) => ({
    id: index + 1,
    stockCode,
    tradeDate: bar.tradeDate,
    // 占位值：仅用于满足图表类型约束，图表实际只依赖 stockCode 决定价格精度
    adjustType: '',
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    amount: bar.amount,
    amplitude: bar.amplitude,
    changePercent: bar.changePercent,
    changeAmount: bar.changeAmount,
    turnoverRate: bar.turnoverRate,
    createdAt: '',
    updatedAt: '',
  }));
}

function onKeywordInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  keywordInput.value = value;
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void searchSecurities(value.trim());
  }, 300);
}

async function searchSecurities(keyword: string): Promise<void> {
  const api = window.marketDataAPI;
  if (!api) {
    showCandidates.value = false;
    return;
  }
  const seq = ++searchSeq;
  try {
    const result = await api.listSecurities({ keyword, status: 'all', page: 1, pageSize: 20 });
    if (seq !== searchSeq) {
      return;
    }
    candidates.value = result.items;
    showCandidates.value = result.items.length > 0;
  } catch {
    if (seq !== searchSeq) {
      return;
    }
    candidates.value = [];
    showCandidates.value = false;
  }
}

function selectSecurity(item: SecuritiesDirectoryItem): void {
  selected.value = item;
  keywordInput.value = item.name;
  showCandidates.value = false;
  candidates.value = [];
  void loadKline();
}

async function loadKline(): Promise<void> {
  const security = selected.value;
  if (!security) {
    return;
  }

  const seq = ++klineSeq;
  loading.value = true;
  error.value = null;
  const api = window.marketDataAPI;
  if (!api) {
    error.value = '行情库 API 不可用';
    loading.value = false;
    return;
  }

  try {
    const bars = await api.queryKline({
      stockCode: security.code,
      period: period.value,
      adjust: adjust.value,
    });
    if (seq !== klineSeq) {
      return;
    }
    isEmpty.value = bars.length === 0;
    if (bars.length === 0) {
      hasChart.value = false;
      klineChart.destroy();
      return;
    }
    await nextTick();
    klineChart.setData(toKlineData(bars, security.code), [], period.value as KlinePeriod);
    hasChart.value = true;
  } catch (caught) {
    if (seq !== klineSeq) {
      return;
    }
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    if (seq === klineSeq) {
      loading.value = false;
    }
  }
}

function switchPeriod(next: MarketKlinePeriod): void {
  period.value = next;
}

function switchAdjust(next: MarketKlineAdjust): void {
  adjust.value = next;
}

function handleMouseMove(event: MouseEvent): void {
  klineChart.onMouseMove(event);
}

/** 从其他页面带代码进入时，按代码解析证券名称并自动加载 */
watch(
  marketKlineStockCode,
  async (code) => {
    if (!code) {
      return;
    }
    const api = window.marketDataAPI;
    if (!api) {
      error.value = '行情库 API 不可用';
      return;
    }
    try {
      const result = await api.listSecurities({ keyword: code, status: 'all', page: 1, pageSize: 20 });
      const matched = result.items.find(item => item.code === code) ?? result.items[0];
      selected.value = matched ?? {
        code,
        name: code,
        exchange: 'SH',
        listDate: null,
        delistDate: null,
        isActive: true,
        codeSource: 'manual',
      };
      keywordInput.value = selected.value.name;
      await loadKline();
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught);
    }
  },
  { immediate: true }
);

watch([period, adjust], () => {
  if (!selected.value) {
    return;
  }
  // switchPeriod / switchAdjust 已主动触发加载，这里仅覆盖程序化变更
  void loadKline();
});

onBeforeUnmount(() => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  klineChart.destroy();
});
</script>

<template>
  <div class="page market-kline-view">
    <header class="page-header">
      <div class="title-block">
        <h1 class="page-title">K线查看</h1>
        <span class="page-subtitle">全市场历史 K 线 · 日/周/月 · 三种复权口径</span>
      </div>
      <div class="header-actions">
        <span v-if="selected" class="selected-security">{{ selected.name }}（{{ selected.code }}）</span>
        <button v-if="selected" class="btn btn-secondary" :disabled="loading" @click="loadKline">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <section class="toolbar">
      <div class="search-block">
        <label class="filter-field filter-keyword">
          <span class="filter-label">证券</span>
          <input
            class="input"
            type="search"
            placeholder="代码或名称，如 600519 / 银行"
            :value="keywordInput"
            @input="onKeywordInput"
            @keydown.esc="showCandidates = false"
          />
        </label>
        <div v-if="showCandidates && candidates.length" class="candidate-list">
          <button
            v-for="item in candidates"
            :key="item.code"
            class="candidate-item btn btn-ghost btn-sm"
            @click="selectSecurity(item)"
          >
            <span class="candidate-code">{{ item.code }}</span>
            <span>{{ item.name }}</span>
            <span class="candidate-exchange">{{ item.exchange }}</span>
          </button>
        </div>
      </div>

      <div class="adjust-switcher">
        <span class="adjust-label">周期：</span>
        <button
          v-for="option in periodOptions"
          :key="option.value"
          class="btn btn-sm"
          :class="period === option.value ? 'btn-primary' : 'btn-secondary'"
          @click="switchPeriod(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="adjust-switcher">
        <span class="adjust-label">复权：</span>
        <button
          v-for="option in adjustOptions"
          :key="option.value"
          class="btn btn-sm"
          :class="adjust === option.value ? 'btn-primary' : 'btn-secondary'"
          @click="switchAdjust(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <span v-if="loading" class="loading-hint">加载中…</span>
    </section>

    <p v-if="error" class="alert alert-danger">
      <span>加载失败：{{ error }}</span>
      <button class="btn btn-secondary" @click="loadKline">重试</button>
    </p>

    <div class="chart-container">
      <div v-if="loading" class="chart-overlay">
        <span class="spinner-large"></span>
        <span>加载中…</span>
      </div>
      <div v-else-if="!error && !selected" class="chart-overlay chart-empty">
        <span>请先搜索并选择一只证券</span>
      </div>
      <div v-else-if="!error && isEmpty" class="chart-overlay chart-empty">
        <span>暂无该周期/复权 K 线数据</span>
      </div>

      <canvas
        v-show="hasChart && !isEmpty && !error"
        ref="canvasRef"
        class="kline-canvas"
        @mousedown="klineChart.onMouseDown"
        @mousemove="handleMouseMove"
        @mouseup="klineChart.onMouseUp"
        @mouseleave="klineChart.onMouseLeave"
        @wheel="klineChart.onWheel"
      ></canvas>

      <div
        v-if="klineTooltipInfo.visible"
        class="kline-tooltip"
        :class="[`placement-${klineTooltipInfo.placement}`, `trend-${klineTooltipInfo.trend}`]"
        :style="{ left: klineTooltipInfo.x + 'px', top: klineTooltipInfo.y + 'px' }"
      >
        <div class="tooltip-date">{{ klineTooltipInfo.date }}</div>
        <div class="tooltip-row"><span>最高价</span><span>{{ formatPrice(klineTooltipInfo.high) }}</span></div>
        <div class="tooltip-row"><span>最低价</span><span>{{ formatPrice(klineTooltipInfo.low) }}</span></div>
        <div class="tooltip-row"><span>开盘价</span><span>{{ formatPrice(klineTooltipInfo.open) }}</span></div>
        <div class="tooltip-row"><span>收盘价</span><span>{{ formatPrice(klineTooltipInfo.close) }}</span></div>
        <div class="tooltip-row">
          <span>涨跌幅</span>
          <span class="trend-value">
            {{ klineTooltipInfo.changePercent == null ? '—' : formatPercent(klineTooltipInfo.changePercent) }}
          </span>
        </div>
        <div class="tooltip-row">
          <span>涨跌额</span>
          <span class="trend-value">
            {{ klineTooltipInfo.changeAmount == null ? '—' : formatChange(klineTooltipInfo.changeAmount) }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="hasChart && !isEmpty && !error" class="chart-hint">滚轮缩放 | 拖动平移</div>
  </div>
</template>

<style scoped lang="scss">
.market-kline-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.search-block {
  position: relative;
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

.filter-keyword {
  width: 18rem;
}

.adjust-switcher {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.adjust-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.candidate-list {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  width: 100%;
  max-height: 15rem;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.candidate-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  width: 100%;
  height: auto;
  padding: var(--space-2) var(--space-3);
  border-radius: 0;
  border-bottom: 1px solid var(--border-color-light);
  text-align: left;

  &:last-child {
    border-bottom: none;
  }
}

.candidate-code {
  font-family: monospace;
  color: var(--text-secondary);
}

.candidate-exchange {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.selected-security {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
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

.chart-container {
  position: relative;
  flex: 1;
  min-height: 0;
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  overflow: hidden;
}

.kline-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.chart-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  background: var(--bg-primary);
}

.chart-empty {
  color: var(--text-tertiary);
}

.spinner-large {
  display: inline-block;
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color-light);
  border-top-color: var(--color-info);
  border-radius: var(--radius-circle);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.kline-tooltip {
  position: absolute;
  background: var(--chart-tooltip-bg);
  color: var(--text-on-color);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  transform: translate(-50%, calc(-100% - 14px));

  &.placement-bottom {
    transform: translate(-50%, 14px);
  }

  .tooltip-date {
    font-weight: 600;
    margin-bottom: var(--space-1);
    color: var(--bg-tertiary);
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    font-size: var(--font-size-xs);
    line-height: 1.7;
    color: var(--border-color-strong);
  }

  &.trend-up .trend-value { color: var(--color-profit); }
  &.trend-down .trend-value { color: var(--color-loss); }
  &.trend-flat .trend-value { color: var(--text-tertiary); }
}

.chart-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-align: center;
}
</style>
