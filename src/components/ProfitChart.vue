<template>
  <div class="profit-chart">
    <!-- 年度盈亏图表 -->
    <div class="chart-container">
      <h3>年度盈亏</h3>
      <canvas ref="annualCanvasRef"></canvas>
      <!-- Tooltip -->
      <div
        v-if="annualTooltip.visible"
        class="tooltip"
        :style="{
          left: annualTooltip.x + 'px',
          top: annualTooltip.y + 'px',
        }"
      >
        <div>{{ annualTooltip.label }}</div>
        <div :class="annualTooltip.value >= 0 ? 'positive' : 'negative'">
          ¥{{ formatAmount(annualTooltip.value) }}
        </div>
      </div>
      <div v-if="store.isLoadingAnnual" class="loading-overlay">加载中...</div>
    </div>

    <!-- 月度盈亏图表 -->
    <div class="chart-container">
      <h3>月度盈亏（过去24个月）</h3>
      <canvas ref="monthlyCanvasRef"></canvas>
      <!-- Tooltip -->
      <div
        v-if="monthlyTooltip.visible"
        class="tooltip"
        :style="{
          left: monthlyTooltip.x + 'px',
          top: monthlyTooltip.y + 'px',
        }"
      >
        <div>{{ monthlyTooltip.label }}</div>
        <div :class="monthlyTooltip.value >= 0 ? 'positive' : 'negative'">
          ¥{{ formatAmount(monthlyTooltip.value) }}
        </div>
      </div>
      <div v-if="store.isLoadingMonthly" class="loading-overlay">加载中...</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watchEffect } from 'vue';
import { useFundManagementStore } from '../stores/fundManagement';
import { useProfitChart } from '../composables/useProfitChart';

const store = useFundManagementStore();

/** Canvas高度常量 */
const CANVAS_HEIGHT = 300;

/**
 * 格式化金额
 */
const formatAmount = (amount: number): string => {
  return amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Canvas 引用
const annualCanvasRef = ref<HTMLCanvasElement | null>(null);
const monthlyCanvasRef = ref<HTMLCanvasElement | null>(null);

// Tooltip 状态（响应式）
const annualTooltip = ref({ visible: false, x: 0, y: 0, label: '', value: 0 });
const monthlyTooltip = ref({ visible: false, x: 0, y: 0, label: '', value: 0 });

// 使用 composable（在 onMounted 中初始化）
let annualChart: ReturnType<typeof useProfitChart>;
let monthlyChart: ReturnType<typeof useProfitChart>;

/**
 * 加载并绘制年度图表
 */
const loadAnnualChart = async () => {
  try {
    console.log('[ProfitChart] 开始加载年度图表数据...');
    await store.fetchAnnualProfitData();
    console.log('[ProfitChart] 年度数据:', store.annualProfitData);
    
    if (!store.annualProfitData || store.annualProfitData.length === 0) {
      console.warn('[ProfitChart] 年度数据为空，无法绘制图表');
      return;
    }
    
    const data = store.annualProfitData.map(item => ({
      label: String(item.year),
      value: item.profit,
    }));

    console.log('[ProfitChart] 年度图表数据:', data);
    // 正负柱颜色由 useProfitChart 的默认值（令牌 --color-profit / --color-loss）提供，此处不再重复指定
    annualChart.drawChart(data, {
      title: '年度盈亏',
    });
    console.log('[ProfitChart] 年度图表绘制完成');
  } catch (error) {
    console.error('[ProfitChart] 加载年度图表失败:', error);
  }
};

/**
 * 加载并绘制月度图表
 */
const loadMonthlyChart = async () => {
  try {
    console.log('[ProfitChart] 开始加载月度图表数据...');
    await store.fetchMonthlyProfitData();
    console.log('[ProfitChart] 月度数据:', store.monthlyProfitData);
    
    if (!store.monthlyProfitData || store.monthlyProfitData.length === 0) {
      console.warn('[ProfitChart] 月度数据为空，无法绘制图表');
      return;
    }
    
    const data = store.monthlyProfitData.map(item => ({
      label: item.month, // 显示完整的 YYYY-MM 格式
      value: item.profit,
    }));

    console.log('[ProfitChart] 月度图表数据:', data);
    // 正负柱颜色由 useProfitChart 的默认值（令牌 --color-profit / --color-loss）提供，此处不再重复指定
    monthlyChart.drawChart(data, {
      title: '月度盈亏',
    });
    console.log('[ProfitChart] 月度图表绘制完成');
  } catch (error) {
    console.error('[ProfitChart] 加载月度图表失败:', error);
  }
};

/**
 * 处理窗口resize
 */
let resizeTimer: number | null = null;
const handleResize = () => {
  // 防抖处理：等待200ms后再执行resize
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = window.setTimeout(() => {
    annualChart.resize();
    monthlyChart.resize();
    resizeTimer = null;
  }, 200);
};

onMounted(() => {
  // 初始化 composable
  annualChart = useProfitChart(annualCanvasRef.value);
  monthlyChart = useProfitChart(monthlyCanvasRef.value);

  console.log('ProfitChart mounted, canvas refs:', {
    annual: annualCanvasRef.value,
    monthly: monthlyCanvasRef.value
  });

  // 同步 tooltip 状态到组件级别响应式数据
  const syncAnnualTooltip = () => {
    annualTooltip.value = { ...annualChart.tooltipInfo.value };
  };
  const syncMonthlyTooltip = () => {
    monthlyTooltip.value = { ...monthlyChart.tooltipInfo.value };
  };

  // 监听 tooltip 变化（使用 watchEffect）
  watchEffect(() => {
    syncAnnualTooltip();
  });
  watchEffect(() => {
    syncMonthlyTooltip();
  });

  // 初始化画布大小（考虑高分辨率屏幕）
  const dpr = window.devicePixelRatio || 1;
  
  if (annualCanvasRef.value) {
    const canvas = annualCanvasRef.value;
    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = CANVAS_HEIGHT + 'px';
      console.log('Annual canvas size:', canvas.width, 'x', canvas.height);
    }
  }

  if (monthlyCanvasRef.value) {
    const canvas = monthlyCanvasRef.value;
    const parent = canvas.parentElement;
    if (parent) {
      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = CANVAS_HEIGHT + 'px';
      console.log('Monthly canvas size:', canvas.width, 'x', canvas.height);
    }
  }

  // 加载数据
  loadAnnualChart();
  loadMonthlyChart();

  // 监听resize
  window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
  // 清理事件监听
  window.removeEventListener('resize', handleResize);
  
  // 清除resize定时器
  if (resizeTimer) {
    clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  
  // 清理资源（检查是否已初始化）
  if (annualChart) {
    annualChart.cleanup();
  }
  if (monthlyChart) {
    monthlyChart.cleanup();
  }
});
</script>

<style scoped lang="scss">
.profit-chart {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
  margin-top: var(--space-5);
}

.chart-container {
  position: relative;
  background: var(--bg-primary);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  height: 340px;
  box-sizing: border-box;
  overflow: hidden;

  h3 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--text-primary);
    word-break: break-word;
    overflow-wrap: anywhere;
    white-space: normal;
    line-height: 1.4;
  }

  canvas {
    width: 100%;
    height: 300px;
  }
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--chart-tooltip-bg-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.tooltip {
  position: fixed;
  background: var(--chart-tooltip-bg);
  color: var(--text-on-color);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  pointer-events: none;
  z-index: 1000;
  transform: translate(-50%, -100%);
  margin-top: -var(--space-3);
  box-shadow: var(--shadow-md);

  div:first-child {
    margin-bottom: var(--space-1);
    font-weight: 500;
  }

  .positive {
    color: var(--color-profit);
    font-weight: 600;
  }

  .negative {
    color: var(--color-loss);
    font-weight: 600;
  }
}
</style>
