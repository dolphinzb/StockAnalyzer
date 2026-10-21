<script setup lang="ts">
/**
 * K线弹窗组件
 *
 * 功能：
 * - 复用 Modal 组件包裹
 * - 顶部显示股票名称和复权方式切换控件（前复权/不复权，默认前复权）
 * - 中间区域放置 Canvas 元素渲染K线图
 * - 底部显示"暂无K线数据，请先下载"空状态提示
 * - 弹窗关闭时释放 Canvas 资源
 * - 交易标注悬停显示 tooltip
 * - K线数据悬停显示 tooltip（日期/开高低收/涨跌额/涨跌幅）
 */

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Modal from './Modal.vue';
import { useKlineChart, type KlineTooltipInfo, type TooltipInfo } from '../composables/useKlineChart';
import { getPricePrecision } from '../utils/formatPrice';
import type { KlineData, TradeRecord } from '../types';

const props = defineProps<{
  /** 是否显示弹窗 */
  modelValue: boolean;
  /** 股票代码 */
  stockCode: string;
  /** 股票名称 */
  stockName: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

/** 价格显示精度（基金3位小数，股票2位小数），tooltip与价格轴统一使用 */
const pricePrecision = computed(() => getPricePrecision(props.stockCode));

/** Canvas 元素引用 */
const canvasRef = ref<HTMLCanvasElement | null>(null);
/** 当前复权方式 */
const adjustType = ref<'' | 'qfq'>('qfq');
/** 是否正在加载数据 */
const isLoading = ref(false);
/** 是否无数据 */
const isEmpty = ref(false);
/** 加载错误信息 */
const errorMsg = ref('');
/** K线图 composable */
const klineChart = useKlineChart(canvasRef);
/** tooltip 信息 */
const tooltipInfo = ref<TooltipInfo>({
  visible: false,
  x: 0,
  y: 0,
  tradeType: '',
  tradePrice: 0,
  tradeCount: 0,
  holdingCount: 0,
});
/** K线数据 tooltip 信息 */
const klineTooltipInfo = ref<KlineTooltipInfo>({
  visible: false,
  x: 0,
  y: 0,
  placement: 'top',
  date: '',
  open: 0,
  close: 0,
  high: 0,
  low: 0,
  changeAmount: null,
  changePercent: null,
  trend: 'flat',
});

/**
 * 加载K线数据和交易记录
 */
async function loadChartData(showEmptyMsg = true): Promise<void> {
  if (!props.stockCode) return;

  isLoading.value = true;
  if (showEmptyMsg) {
    isEmpty.value = false;
    errorMsg.value = '';
  }

  try {
    // 并行获取K线数据和交易记录
    const [klines, trades]: [KlineData[], TradeRecord[]] = await Promise.all([
      window.klineAPI.getChartData(props.stockCode, adjustType.value),
      window.klineAPI.getTradeRecords(props.stockCode),
    ]);

    if (klines.length === 0) {
      isEmpty.value = true;
      if (showEmptyMsg) {
        errorMsg.value = `暂无${adjustType.value === 'qfq' ? '前复权' : '不复权'}数据，请先下载`;
      }
    } else {
      isEmpty.value = false;
      errorMsg.value = '';
      // 等待 DOM 更新后设置数据并绘制
      await nextTick();
      klineChart.setData(klines, trades);
    }
  } catch (error) {
    isEmpty.value = true;
    if (showEmptyMsg) {
      errorMsg.value = error instanceof Error ? error.message : '加载数据失败';
    }
  } finally {
    isLoading.value = false;
  }
}

/**
 * 切换复权方式
 */
async function switchAdjustType(type: '' | 'qfq'): Promise<void> {
  if (adjustType.value === type) return;
  
  // 保存当前状态
  const previousAdjustType = adjustType.value;
  const wasEmpty = isEmpty.value;
  
  // 尝试加载新数据
  adjustType.value = type;
  await loadChartData(false); // 不显示空状态消息，保持当前视图
  
  // 如果新数据为空，恢复之前的状态并显示提示
  if (isEmpty.value && !wasEmpty) {
    adjustType.value = previousAdjustType;
    isEmpty.value = false; // 恢复到有数据的状态
    errorMsg.value = `暂无${type === 'qfq' ? '前复权' : '不复权'}数据，请先下载`;
    // 重新绘制当前数据
    await nextTick();
    klineChart.drawChart();
  }
}
function handleClose(): void {
  klineChart.destroy();
  emit('update:modelValue', false);
}

/**
 * tooltip 信息同步
 */
function syncTooltip(info: TooltipInfo): void {
  tooltipInfo.value = { ...info };
}

/**
 * K线数据tooltip信息同步
 */
function syncKlineTooltip(info: KlineTooltipInfo): void {
  klineTooltipInfo.value = { ...info };
}

/**
 * 鼠标移动事件处理：悬停检测 + 同步两类tooltip
 */
function handleMouseMove(e: MouseEvent): void {
  klineChart.onMouseMove(e);
  syncTooltip(klineChart.tooltipInfo.value);
  syncKlineTooltip(klineChart.klineTooltipInfo.value);
}

/**
 * 格式化价格显示：精度随证券类型（基金3位小数，股票2位小数）
 */
function formatPrice(value: number): string {
  return value.toFixed(pricePrecision.value);
}

/**
 * 格式化涨跌额：带方向符号（+/-），精度随证券类型；平盘无符号
 */
function formatChange(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(pricePrecision.value)}`;
}

/**
 * 格式化涨跌幅：带方向符号（+/-）与百分号，精度随证券类型；平盘无符号
 */
function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(pricePrecision.value)}%`;
}

// 监听弹窗打开，加载数据
watch(() => props.modelValue, async (visible) => {
  if (visible) {
    // 重置状态
    adjustType.value = 'qfq';
    isEmpty.value = false;
    errorMsg.value = '';
    await nextTick();
    await loadChartData();
  }
});

// 组件卸载时清理
onBeforeUnmount(() => {
  klineChart.destroy();
});
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="`${stockName} (${stockCode}) - K线图`"
    :close-on-overlay-click="true"
    @update:model-value="handleClose"
  >
    <div class="kline-chart-dialog">
      <!-- 复权方式切换控件 -->
      <div class="adjust-switcher">
        <span class="adjust-label">复权方式：</span>
        <button
          class="adjust-btn"
          :class="{ active: adjustType === 'qfq' }"
          @click="switchAdjustType('qfq')"
        >
          前复权
        </button>
        <button
          class="adjust-btn"
          :class="{ active: adjustType === '' }"
          @click="switchAdjustType('')"
        >
          不复权
        </button>
      </div>

      <!-- K线图 Canvas 区域 -->
      <div class="chart-container">
        <!-- 加载中状态 -->
        <div v-if="isLoading" class="chart-loading">
          <span class="spinner-large"></span>
          <span>加载中...</span>
        </div>

        <!-- 空数据/错误状态 -->
        <div v-else-if="isEmpty" class="chart-empty">
          <span v-if="errorMsg" class="error-msg">{{ errorMsg }}</span>
          <span v-else>暂无K线数据，请先下载</span>
        </div>

        <!-- Canvas 渲染区域 -->
        <canvas
          v-show="!isLoading && !isEmpty"
          ref="canvasRef"
          class="kline-canvas"
          @mousedown="klineChart.onMouseDown"
          @mousemove="handleMouseMove"
          @mouseup="klineChart.onMouseUp"
          @mouseleave="klineChart.onMouseLeave"
          @wheel="klineChart.onWheel"
        ></canvas>

        <!-- 交易标注 Tooltip -->
        <div
          v-if="tooltipInfo.visible"
          class="trade-tooltip"
          :class="`placement-${tooltipInfo.placement ?? 'top'}`"
          :style="{ left: tooltipInfo.x + 'px', top: tooltipInfo.y + 'px' }"
        >
          <div class="tooltip-type" :class="'type-' + tooltipInfo.tradeType.toLowerCase()">
            {{ tooltipInfo.tradeType === 'BUY' ? '买入' : tooltipInfo.tradeType === 'SELL' ? '卖出' : '分红' }}
          </div>
          <div class="tooltip-detail">
            <span>价格：{{ formatPrice(tooltipInfo.tradePrice) }}</span>
            <span>数量：{{ tooltipInfo.tradeCount }}</span>
            <span>持仓：{{ tooltipInfo.holdingCount }}</span>
          </div>
        </div>

        <!-- K线数据 Tooltip（悬停某一交易日显示K线数据） -->
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

      <!-- 操作提示 -->
      <div v-if="!isEmpty" class="chart-hint">
        💡 悬停查看K线数据 | 滚轮缩放 | 拖动平移
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
.kline-chart-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 复权方式切换 */
.adjust-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
}

.adjust-label {
  font-size: 13px;
  color: #666;
}

.adjust-btn {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: white;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #3b82f6;
    color: #3b82f6;
  }

  &.active {
    background: #3b82f6;
    border-color: #3b82f6;
    color: white;
  }
}

/* K线图容器 */
.chart-container {
  position: relative;
  width: 100%;
  height: 450px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: white;
  overflow: hidden;
}

.kline-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
}

/* 加载状态 */
.chart-loading {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #6b7280;
  font-size: 14px;
}

.spinner-large {
  display: inline-block;
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 空数据状态 */
.chart-empty {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9ca3af;
  font-size: 14px;
}

.error-msg {
  color: #ef4444;
}

/* 交易标注 Tooltip */
.trade-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  /* 默认显示在锚点上方；由 placement-* 类切换方向（锚点为悬停蜡烛中心X + 鼠标Y） */
  transform: translate(-50%, calc(-100% - 14px));

  /* 鼠标位于画布上半区时改为下方弹出，避免被容器顶部裁剪 */
  &.placement-bottom {
    transform: translate(-50%, 14px);
  }

  .tooltip-type {
    font-weight: 600;
    margin-bottom: 4px;

    &.type-buy { color: #22c55e; }
    &.type-sell { color: #ef4444; }
    &.type-dividend { color: #3b82f6; }
  }

  .tooltip-detail {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: #d1d5db;
  }
}

/* K线数据 Tooltip（悬停某一交易日显示） */
.kline-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.85);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  pointer-events: none;
  z-index: 10;
  white-space: nowrap;
  /* 默认显示在锚点上方；由 placement-* 类切换方向 */
  transform: translate(-50%, calc(-100% - 14px));

  /* 鼠标位于画布上半区时改为下方弹出，避免被容器顶部裁剪 */
  &.placement-bottom {
    transform: translate(-50%, 14px);
  }

  .tooltip-date {
    font-weight: 600;
    margin-bottom: 4px;
    color: #f3f4f6;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 11px;
    line-height: 1.7;
    color: #d1d5db;
  }

  /* 涨跌着色（与K线涨跌色一致：涨红/跌绿/平灰） */
  &.trend-up .trend-value { color: #e53935; }
  &.trend-down .trend-value { color: #43a047; }
  &.trend-flat .trend-value { color: #9e9e9e; }
}

/* 操作提示 */
.chart-hint {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}
</style>
