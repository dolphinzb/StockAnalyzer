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
  <div class="pattern-scan-view">
    <!-- 顶部：标题 + 股票选择 + 复权 + 检测 -->
    <header class="scan-header">
      <h2>形态检测</h2>
      <div class="header-controls">
        <label class="control-label">
          <span>股票</span>
          <select :value="store.currentStock?.stockCode ?? ''" @change="handleStockChange">
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

        <button class="run-btn" :disabled="!store.currentStock || store.isDetecting" @click="handleRunDetection">
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
          <select :value="store.filters.direction" @change="handleDirectionChange">
            <option v-for="opt in directionOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </label>

        <label class="control-label">
          <span>形态</span>
          <select :value="store.filters.patternCodes" multiple size="1" @change="handlePatternChange">
            <option value="">全部形态</option>
            <option v-for="opt in patternOptions" :key="opt.code" :value="opt.code">
              {{ opt.name }}（{{ opt.candleCount }}根 · {{ directionLabel(opt.direction) }}）
            </option>
          </select>
        </label>

        <button class="reset-btn" @click="handleResetFilters">重置筛选</button>
      </div>
    </section>

    <!-- 结果列表 -->
    <section class="result-section">
      <div v-if="store.currentStock === null" class="empty-state">
        <p>请先在上方选择一只股票开始形态检测</p>
      </div>

      <div v-else-if="store.isDetecting" class="empty-state">
        <span class="spinner"></span>
        <span>正在加载 K 线并检测形态…</span>
      </div>

      <div v-else-if="store.errorMessage" class="empty-state error">
        <p>检测失败：{{ store.errorMessage }}</p>
      </div>

      <div v-else-if="store.isInsufficientState" class="empty-state">
        <p>数据不足，无法检测</p>
        <p class="hint">当前 K 线根数 {{ store.klines.length }}，至少需要 20 根才能完成形态识别（MA10 计算）。</p>
      </div>

      <div v-else-if="store.isEmptyState" class="empty-state">
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
        <div v-if="sortedHits.length === 0 && store.hasEnoughKlines" class="empty-state inline">
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
.pattern-scan-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  gap: 0.75rem;
  overflow: auto;
}

/* 顶部栏 */
.scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.control-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);

  select {
    min-width: 120px;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: white;
    font-size: 13px;
  }
}

.adjust-switcher {
  display: flex;
  gap: 4px;
}

.adjust-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.run-btn {
  padding: 6px 18px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;

  &:hover:not(:disabled) {
    background: var(--color-primary-dark);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

/* 筛选区 */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.date-presets {
  display: flex;
  gap: 4px;
}

.preset-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: white;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: white;
  }
}

.reset-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: white;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
}

/* 结果列表 */
.result-section {
  flex-shrink: 0;
}

.result-table-wrapper {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead {
    position: sticky;
    top: 0;
    background: var(--bg-secondary);
    z-index: 1;
  }

  th,
  td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border-color);
  }

  th {
    font-weight: 600;
    color: var(--text-secondary);
    font-size: 12px;
  }

  tbody tr {
    cursor: pointer;
    transition: background 0.1s;

    &:hover {
      background: var(--hover-bg);
    }

    &.focused {
      background: var(--active-bg);
    }
  }
}

.col-strength {
  width: 180px;
}

.dir-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;

  &.dir-bullish {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }
  &.dir-bearish {
    background: rgba(244, 63, 94, 0.15);
    color: #f43f5e;
  }
  &.dir-warning {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }
}

.strength-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.strength-bar {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}

.strength-fill {
  display: block;
  height: 100%;
  border-radius: 3px;

  &.dir-bullish { background: #10b981; }
  &.dir-bearish { background: #f43f5e; }
  &.dir-warning { background: #f59e0b; }
}

.strength-num {
  width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  font-size: 12px;
}

/* 空态 */
.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 2rem;
  color: var(--text-secondary);
  gap: 0.5rem;

  &.error p {
    color: var(--error-color);
  }

  &.inline {
    padding: 1rem;
  }

  .hint {
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.8;
  }
}

.spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* K 线图区 */
.chart-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 320px;
}

.chart-container {
  position: relative;
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: white;
  overflow: hidden;
  min-height: 320px;
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
  color: var(--text-secondary);
  font-size: 14px;
}

.chart-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

/* 形态 Tooltip */
.pattern-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  /* 默认显示在标注上方（锚定元素底边）；由 placement-* 类切换方向 */
  transform: translate(-50%, calc(-100% - 14px));

  /* 标注位于画布上半区时改为下方弹出，避免被容器顶部裁剪 */
  &.placement-bottom {
    transform: translate(-50%, 14px);
  }

  .tooltip-name {
    font-weight: 600;
    margin-bottom: 4px;

    &.dir-bullish { color: #10b981; }
    &.dir-bearish { color: #f43f5e; }
    &.dir-warning { color: #f59e0b; }
  }

  .tooltip-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: #d1d5db;
  }
}
</style>
