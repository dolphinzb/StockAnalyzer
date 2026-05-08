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
 */

import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Modal from './Modal.vue';
import { useKlineChart, type TooltipInfo } from '../composables/useKlineChart';
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

/** Canvas 元素引用 */
const canvasRef = ref<HTMLCanvasElement | null>(null);
/** 当前复权方式 */
const adjustType = ref<'qfq' | ''>('qfq');
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

/**
 * 加载K线数据和交易记录
 */
async function loadChartData(): Promise<void> {
  if (!props.stockCode) return;

  isLoading.value = true;
  isEmpty.value = false;
  errorMsg.value = '';

  try {
    // 并行获取K线数据和交易记录
    const [klines, trades]: [KlineData[], TradeRecord[]] = await Promise.all([
      window.klineAPI.getChartData(props.stockCode, adjustType.value),
      window.klineAPI.getTradeRecords(props.stockCode),
    ]);

    if (klines.length === 0) {
      isEmpty.value = true;
    } else {
      isEmpty.value = false;
      // 等待 DOM 更新后设置数据并绘制
      await nextTick();
      klineChart.setData(klines, trades);
    }
  } catch (error) {
    errorMsg.value = error instanceof Error ? error.message : '加载数据失败';
    isEmpty.value = true;
  } finally {
    isLoading.value = false;
  }
}

/**
 * 切换复权方式
 */
async function switchAdjustType(type: 'qfq' | ''): Promise<void> {
  if (adjustType.value === type) return;
  adjustType.value = type;
  await loadChartData();
}

/**
 * 关闭弹窗
 */
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
          @mousemove="(e: MouseEvent) => { klineChart.onMouseMove(e); syncTooltip(klineChart.tooltipInfo.value); }"
          @mouseup="klineChart.onMouseUp"
          @mouseleave="klineChart.onMouseLeave"
        ></canvas>

        <!-- 交易标注 Tooltip -->
        <div
          v-if="tooltipInfo.visible"
          class="trade-tooltip"
          :style="{ left: tooltipInfo.x + 'px', top: tooltipInfo.y + 'px' }"
        >
          <div class="tooltip-type" :class="'type-' + tooltipInfo.tradeType.toLowerCase()">
            {{ tooltipInfo.tradeType === 'BUY' ? '买入' : tooltipInfo.tradeType === 'SELL' ? '卖出' : '分红' }}
          </div>
          <div class="tooltip-detail">
            <span>价格：{{ tooltipInfo.tradePrice.toFixed(2) }}</span>
            <span>数量：{{ tooltipInfo.tradeCount }}</span>
            <span>持仓：{{ tooltipInfo.holdingCount }}</span>
          </div>
        </div>
      </div>

      <!-- 操作提示 -->
      <div class="chart-hint">
        💡 按住鼠标左键左右拖动可查看不同日期范围的数据
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
  transform: translateX(-50%);

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

/* 操作提示 */
.chart-hint {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}
</style>
