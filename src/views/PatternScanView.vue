<script setup lang="ts">
/**
 * 形态扫描页面
 *
 * 布局（PRD §6.1）：
 *   ┌────────────────────────────────────────────────┐
 *   │ [股票选择器] [复权: 前复权/不复权] [检测]         │
 *   ├────────────────────────────────────────────────┤
 *   │ 筛选: [日期] [方向] [形态]                       │
 *   ├────────────────────────────────────────────────┤
 *   │ 结果列表（形态 | 日期 | 方向 | 强度 | 趋势前提）   │
 *   ├────────────────────────────────────────────────┤
 *   │ 内嵌 K 线图（useKlineChart，形态标记）           │
 *   └────────────────────────────────────────────────┘
 *
 * 交互：
 * - 切换股票/复权 → store 自动拉取 K 线并检测（无需再次点击"检测"）
 * - "检测"按钮用于同条件下手动重跑 detectPatterns
 * - 列表行点击 → focusHit → K 线图 scrollToIndex + marker 重绘
 * - 错误/空态/数据不足 三态分支提示
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { REGISTRY } from '../../shared/patterns';
import type { CandlestickPatternCode, KlineData, PatternDirection, PatternHit, TradeRecord } from '../../shared/types';
import { useKlineChart, type TooltipInfo } from '../composables/useKlineChart';
import { useToast } from '../composables/useToast';
import { usePatternScanStore, type PatternScanAdjustType } from '../stores/patternScan';
import { useWatchlistStore } from '../stores/watchlist';

defineOptions({
  name: 'PatternScanView',
});

const store = usePatternScanStore();
const watchlistStore = useWatchlistStore();
const { showToast } = useToast();

/** Canvas 引用 */
const canvasRef = ref<HTMLCanvasElement | null>(null);
/** K 线图 composable 实例 */
const klineChart = useKlineChart(canvasRef);
/** 当前 tooltip（用于叠加层展示形态名/交易信息） */
const tooltipInfo = ref<TooltipInfo>({
  visible: false,
  x: 0,
  y: 0,
  tradeType: '',
  tradePrice: 0,
  tradeCount: 0,
  holdingCount: 0,
});

/** 形态筛选下拉使用的形态清单（按 candleCount 分组便于展示） */
const patternOptions = computed(() => {
  return REGISTRY.map(def => ({
    code: def.code as CandlestickPatternCode,
    name: def.name,
    direction: def.direction,
    candleCount: def.candleCount,
  }));
});

/** 当前已加载形态命中的方向选项（仅展示已出现方向） */
const directionOptions: Array<{ value: PatternDirection | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'bullish', label: '看涨' },
  { value: 'bearish', label: '看跌' },
  { value: 'warning', label: '转折预警' },
];

/** 日期窗口快捷选项（PRD §2：默认近 30 日） */
const dateWindowPresets: Array<{ label: string; days: number | null }> = [
  { label: '近 7 日', days: 7 },
  { label: '近 30 日', days: 30 },
  { label: '近 90 日', days: 90 },
  { label: '全部', days: null },
];

/**
 * 当前选中的快捷日期窗口（key 为 preset 索引，-1 表示自定义或全部）
 * 注意：仅做 UI 记录；实际日期窗口由 store.dateWindow 决定
 */
const activeDatePresetIndex = ref<number>(1);

/** 列表排序：默认按 strength 降序；store 内已为 (endIndex desc, strength desc) */
const sortedHits = computed(() => store.filteredHits);

/** 工具：方向 → 中文标签 */
function directionLabel(dir: PatternDirection): string {
  if (dir === 'bullish') return '看涨';
  if (dir === 'bearish') return '看跌';
  return '转折预警';
}

/** 工具：趋势方向 → 中文 */
function trendLabel(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '上涨后';
  if (trend === 'down') return '下跌后';
  return '横盘';
}

/** 工具：强度 → 百分比字符串（保留整数） */
function strengthPercent(strength: number): string {
  return `${Math.round(strength * 100)}%`;
}

/** 工具：强度 → 进度条宽度 */
function strengthBarWidth(strength: number): string {
  return `${Math.round(strength * 100)}%`;
}

/** 工具：根据 hit.endIndex 获取对应日期字符串 */
function hitTradeDate(hit: PatternHit): string {
  const kline = store.klines[hit.endIndex];
  return kline?.tradeDate ?? '—';
}

/**
 * 切换股票
 * - 若与当前相同则不重复触发
 */
async function handleStockChange(event: Event): Promise<void> {
  const target = event.target as HTMLSelectElement;
  const stockCode = target.value;
  if (!stockCode) {
    await store.selectStock(null);
    return;
  }
  const stock = watchlistStore.stocks.find(s => s.stockCode === stockCode) ?? null;
  await store.selectStock(stock);
}

/**
 * 切换复权类型
 */
async function handleAdjustTypeChange(type: PatternScanAdjustType): Promise<void> {
  await store.setAdjustType(type);
}

/**
 * 触发检测（手动重跑）
 */
function handleRunDetection(): void {
  if (!store.currentStock) {
    showToast('请先选择股票', 'info');
    return;
  }
  store.runDetection();
}

/**
 * 应用日期窗口预设
 */
function applyDatePreset(index: number): void {
  activeDatePresetIndex.value = index;
  const preset = dateWindowPresets[index];
  if (!preset || preset.days === null) {
    // 全部：清空窗口
    store.setDateWindow({ start: '', end: '' });
    return;
  }
  const klines = store.klines;
  if (klines.length === 0) {
    store.setDateWindow({ start: '', end: '' });
    return;
  }
  // 取最近 N 根 K 线的起止日期
  const tailStart = Math.max(0, klines.length - preset.days);
  store.setDateWindow({
    start: klines[tailStart]?.tradeDate ?? '',
    end: klines[klines.length - 1]?.tradeDate ?? '',
  });
}

/**
 * 切换方向筛选
 */
function handleDirectionChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  store.setDirectionFilter(target.value as PatternDirection | 'all');
}

/**
 * 切换形态筛选
 */
function handlePatternChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  const values = Array.from(target.selectedOptions).map(o => o.value);
  store.setPatternFilter(values);
}

/**
 * 重置筛选
 */
function handleResetFilters(): void {
  store.resetFilters();
  activeDatePresetIndex.value = 1; // 默认回到"近 30 日"
  applyDatePreset(1);
}

/**
 * 点击结果行：聚焦命中并让 K 线图滚动到该位置
 */
function handleRowClick(hit: PatternHit): void {
  store.focusHit(hit);
  klineChart.scrollToIndex(hit.endIndex);
}

/**
 * 同步 tooltip（useKlineChart 内部维护 tooltipInfo，模板需要同步显示）
 */
function syncTooltip(info: TooltipInfo): void {
  tooltipInfo.value = { ...info };
}

/**
 * 加载 K 线 + 交易记录到图表
 * - 形态扫描页面不展示交易记录（PRD §6.2 仅要求形态标记）
 * - 渲染时不阻塞：detection 已由 store 完成
 */
function refreshChart(): void {
  const klines: KlineData[] = store.klines;
  if (klines.length === 0) return;
  // 形态扫描页不展示交易标注，传入空数组即可
  const trades: TradeRecord[] = [];
  klineChart.setData(klines, trades);
  klineChart.setPatternMarkers(sortedHits.value);
}

/**
 * 监听 store.klines / filteredHits 变化，触发图表重绘
 * - 切换股票/复权/筛选都会改变这两个值
 */
watch(
  [() => store.klines, sortedHits],
  async () => {
    await nextTick();
    if (store.klines.length > 0) {
      refreshChart();
    } else {
      klineChart.clearPatternMarkers();
    }
  },
  { deep: false },
);

/**
 * 监听聚焦命中变化：若新的 focusedHit 与上一次不同则滚动定位
 * - 同一命中重复点击不重复触发副作用（store.focusHit 不变）
 */
watch(
  () => store.focusedHit,
  hit => {
    if (hit) {
      klineChart.scrollToIndex(hit.endIndex);
    }
  },
);

/**
 * 监听错误：检测失败时通过 Toast 提示
 */
watch(
  () => store.errorMessage,
  msg => {
    if (msg) {
      showToast(`形态检测失败：${msg}`, 'error', 5000);
    }
  },
);

/**
 * 挂载时订阅 K 线更新事件，确保更新 K 线后形态检测自动刷新
 */
onMounted(() => {
  store.setupKlineUpdateListener();
});

/**
 * 卸载时清理图表资源与事件订阅，避免内存泄漏
 */
onBeforeUnmount(() => {
  store.disposeKlineUpdateListener();
  klineChart.destroy();
});
</script>

<template>
  <div class="page pattern-scan-view">
    <!-- 顶部：标题 + 股票选择 + 复权 + 检测 -->
    <header class="page-header">
      <h2 class="page-title">形态检测</h2>
      <div class="header-controls">
        <label class="control-label">
          <span>股票</span>
          <select class="select" :value="store.currentStock?.stockCode ?? ''" @change="handleStockChange">
            <option value="" disabled>请选择股票</option>
            <option v-for="stock in watchlistStore.stocks" :key="stock.id" :value="stock.stockCode">
              {{ stock.stockName }} ({{ stock.stockCode }})
            </option>
          </select>
        </label>

        <div class="adjust-switcher">
          <button
            class="adjust-btn"
            :class="{ active: store.adjustType === 'qfq' }"
            :disabled="!store.currentStock"
            @click="handleAdjustTypeChange('qfq')"
          >
            前复权
          </button>
          <button
            class="adjust-btn"
            :class="{ active: store.adjustType === '' }"
            :disabled="!store.currentStock"
            @click="handleAdjustTypeChange('')"
          >
            不复权
          </button>
        </div>

        <button class="btn btn-primary" :disabled="!store.currentStock || store.isDetecting" @click="handleRunDetection">
          {{ store.isDetecting ? '检测中…' : '检测' }}
        </button>
      </div>
    </header>

    <!-- 筛选区 -->
    <section class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">日期窗口</span>
        <div class="date-presets">
          <button
            v-for="(preset, idx) in dateWindowPresets"
            :key="preset.label"
            class="preset-btn"
            :class="{ active: activeDatePresetIndex === idx }"
            @click="applyDatePreset(idx)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="filter-group">
        <label class="control-label">
          <span>方向</span>
          <select class="select" :value="store.filters.direction" @change="handleDirectionChange">
            <option v-for="opt in directionOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="control-label">
          <span>形态</span>
          <select class="select" :value="store.filters.patternCodes" multiple size="1" @change="handlePatternChange">
            <option value="">全部形态</option>
            <option v-for="opt in patternOptions" :key="opt.code" :value="opt.code">
              {{ opt.name }}（{{ opt.candleCount }}根 · {{ directionLabel(opt.direction) }}）
            </option>
          </select>
        </label>

        <button class="btn btn-ghost btn-sm" @click="handleResetFilters">重置筛选</button>
      </div>
    </section>

    <!-- 结果列表 -->
    <section class="result-section">
      <div v-if="store.currentStock === null" class="result-empty">
        <p>请先在上方选择一只股票开始形态检测</p>
      </div>

      <div v-else-if="store.isDetecting" class="result-empty">
        <span class="spinner"></span>
        <span>正在加载 K 线并检测形态…</span>
      </div>

      <div v-else-if="store.errorMessage" class="result-empty is-error">
        <p>检测失败：{{ store.errorMessage }}</p>
      </div>

      <div v-else-if="store.isInsufficientState" class="result-empty">
        <p>数据不足，无法检测</p>
        <p class="hint">当前 K 线根数 {{ store.klines.length }}，至少需要 20 根才能完成形态识别（MA10 计算）。</p>
      </div>

      <div v-else-if="store.isEmptyState" class="result-empty">
        <p>近期未发现蜡烛图形态信号</p>
        <p class="hint">可尝试切换复权类型、调整日期窗口或放宽筛选。</p>
      </div>

      <div v-else class="result-table-wrapper">
        <table class="result-table">
          <thead>
            <tr>
              <th>形态</th>
              <th>日期</th>
              <th>方向</th>
              <th class="col-strength">强度</th>
              <th>趋势前提</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="hit in sortedHits"
              :key="`${hit.code}@${hit.endIndex}`"
              :class="{ focused: store.focusedHit?.endIndex === hit.endIndex && store.focusedHit?.code === hit.code }"
              @click="handleRowClick(hit)"
            >
              <td>{{ hit.name }}</td>
              <td>{{ hitTradeDate(hit) }}</td>
              <td>
                <span class="dir-tag" :class="`dir-${hit.direction}`">{{ directionLabel(hit.direction) }}</span>
              </td>
              <td class="col-strength">
                <div class="strength-cell">
                  <span class="strength-bar">
                    <span class="strength-fill" :class="`dir-${hit.direction}`" :style="{ width: strengthBarWidth(hit.strength) }" />
                  </span>
                  <span class="strength-num">{{ strengthPercent(hit.strength) }}</span>
                </div>
              </td>
              <td>{{ trendLabel(hit.trendContext) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="sortedHits.length === 0 && store.hasEnoughKlines" class="result-empty is-inline">
          <p>当前筛选条件下无命中</p>
        </div>
      </div>
    </section>

    <!-- 内嵌 K 线图 -->
    <section class="chart-section">
      <div class="chart-container">
        <canvas
          v-show="store.klines.length > 0"
          ref="canvasRef"
          class="kline-canvas"
          @mousedown="klineChart.onMouseDown"
          @mousemove="(e: MouseEvent) => { klineChart.onMouseMove(e); syncTooltip(klineChart.tooltipInfo.value); }"
          @mouseup="klineChart.onMouseUp"
          @mouseleave="klineChart.onMouseLeave"
          @wheel="klineChart.onWheel"
        ></canvas>

        <!-- 空状态：在图表区域给出同步提示（与列表区呼应） -->
        <div v-if="store.klines.length === 0 && store.currentStock === null" class="chart-placeholder">
          <span>请先选择股票</span>
        </div>
        <div v-else-if="store.klines.length === 0 && store.currentStock !== null && !store.isDetecting" class="chart-placeholder">
          <span>暂无 K 线数据，请先下载 K 线</span>
        </div>

        <!-- 形态标注 Tooltip -->
        <div
          v-if="tooltipInfo.visible && tooltipInfo.patternCode"
          class="pattern-tooltip"
          :class="`placement-${tooltipInfo.placement ?? 'top'}`"
          :style="{ left: tooltipInfo.x + 'px', top: tooltipInfo.y + 'px' }"
        >
          <div class="tooltip-name" :class="`dir-${tooltipInfo.patternDirection}`">
            {{ tooltipInfo.patternName }}
          </div>
          <div class="tooltip-detail">
            <span>方向：{{ tooltipInfo.patternDirection === 'bullish' ? '看涨' : tooltipInfo.patternDirection === 'bearish' ? '看跌' : '转折预警' }}</span>
            <span>强度：{{ Math.round((tooltipInfo.patternStrength ?? 0) * 100) }}%</span>
          </div>
        </div>
      </div>
      <div v-if="store.klines.length > 0" class="chart-hint">
        💡 滚轮缩放 | 拖动平移 | 悬停形态标记查看详情
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
// 页面骨架、主操作按钮、重置按钮、下拉框均由全局基础类提供
.pattern-scan-view {
  gap: var(--space-3);
  overflow: auto;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.control-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);

  // 下拉框按内容宽度显示
  > .select {
    width: auto;
    min-width: 7.5rem;
  }
}

// 复权切换与日期预设属于分段选择控件，与操作按钮形态不同，保留自定义样式
.adjust-switcher,
.date-presets {
  display: flex;
  gap: var(--space-1);
}

.adjust-btn,
.preset-btn {
  padding: var(--space-1) var(--space-2);
  font-family: inherit;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;

  &:hover:not(:disabled) {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  &.active {
    color: var(--text-on-color);
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

/* 筛选区 */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.filter-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* 结果列表 */
.result-section {
  flex-shrink: 0;
}

.result-table-wrapper {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.result-table {
  width: 100%;
  font-size: var(--font-size-sm);
  border-collapse: collapse;

  thead {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--bg-secondary);
  }

  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
  }

  tbody tr {
    cursor: pointer;
    transition: background-color 0.1s ease;

    &:hover {
      background: var(--bg-hover);
    }

    &.focused {
      background: var(--bg-active);
    }
  }
}

.col-strength {
  width: 11.25rem; // 180px
}

.dir-tag {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-pill);

  &.dir-bullish {
    background: var(--bg-success-subtle);
    color: var(--color-success);
  }
  &.dir-bearish {
    background: var(--bg-danger-subtle);
    color: var(--color-danger);
  }
  &.dir-warning {
    background: var(--bg-warning-subtle);
    color: var(--color-warning);
  }
}

.strength-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.strength-bar {
  flex: 1;
  height: 6px;
  overflow: hidden;
  background: var(--border-color);
  border-radius: var(--radius-sm);
}

.strength-fill {
  display: block;
  height: 100%;
  border-radius: var(--radius-sm);

  &.dir-bullish {
    background: var(--color-success);
  }
  &.dir-bearish {
    background: var(--color-danger);
  }
  &.dir-warning {
    background: var(--color-warning);
  }
}

.strength-num {
  width: 2.5rem;
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--text-secondary);
}

/* 空态（本页结果区内嵌空态，与全局 .empty-state 的整页居中语义不同） */
.result-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-6);
  color: var(--text-secondary);

  &.is-error p {
    color: var(--color-danger);
  }

  &.is-inline {
    padding: var(--space-4);
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    opacity: 0.8;
  }
}

.spinner {
  display: inline-block;
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid var(--border-color);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-circle);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* K 线图区 */
.chart-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 20rem; // 320px
}

.chart-container {
  position: relative;
  flex: 1;
  min-height: 20rem; // 320px
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.kline-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
}

.chart-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.chart-hint {
  margin-top: var(--space-2);
  font-size: var(--font-size-xs);
  text-align: center;
  color: var(--text-secondary);
}

/* 形态 Tooltip */
.pattern-tooltip {
  position: absolute;
  z-index: var(--z-dropdown);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--chart-tooltip-text);
  white-space: nowrap;
  pointer-events: none;
  background: var(--chart-tooltip-bg);
  border-radius: var(--radius-md);
  /* 默认显示在标注上方（锚定元素底边）；由 placement-* 类切换方向 */
  transform: translate(-50%, calc(-100% - 14px));

  /* 标注位于画布上半区时改为下方弹出，避免被容器顶部裁剪 */
  &.placement-bottom {
    transform: translate(-50%, 14px);
  }

  .tooltip-name {
    margin-bottom: var(--space-1);
    font-weight: var(--font-weight-semibold);

    &.dir-bullish {
      color: var(--color-success);
    }
    &.dir-bearish {
      color: var(--color-danger);
    }
    &.dir-warning {
      color: var(--color-warning);
    }
  }

  .tooltip-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--font-size-xs);
    color: var(--text-disabled);
  }
}
</style>
