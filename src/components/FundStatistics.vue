<template>
  <div class="fund-statistics">
    <h2>资金统计</h2>

    <!-- 加载状态 -->
    <div v-if="store.isLoadingOverview || store.isLoadingMonthlyFund" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-message">{{ loadError }}</p>
      <button class="btn-retry" @click="loadData">重试</button>
    </div>

    <!-- 数据展示 -->
    <div v-else class="statistics-content">
      <!-- 数值卡片区域 -->
      <div class="cards-row">
        <div class="stat-card">
          <div class="stat-label">账户余额</div>
          <div class="stat-value balance">¥{{ formatAmount(store.fundOverview?.currentAccountBalance ?? 0) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">持仓市值</div>
          <div class="stat-value holdings">¥{{ formatAmount(store.fundOverview?.currentHoldingsMarketValue ?? 0) }}</div>
        </div>
        <div class="stat-card highlight">
          <div class="stat-label">总资产</div>
          <div class="stat-value total">¥{{ formatAmount(store.fundOverview?.totalAssets ?? 0) }}</div>
        </div>
      </div>

      <!-- 饼图区域 -->
      <div class="chart-section">
        <h3 class="section-title">资产分布</h3>
        <div class="chart-container">
          <canvas
            ref="pieCanvasRef"
            class="pie-canvas"
            style="width: 100%; height: 300px;"
          ></canvas>
        </div>
        <!-- 饼图图例 -->
        <div class="pie-legend">
          <div class="legend-item">
            <span class="legend-color" style="background-color: #3b82f6;"></span>
            <span class="legend-label">账户余额</span>
          </div>
          <div class="legend-item">
            <span class="legend-color" style="background-color: #f97316;"></span>
            <span class="legend-label">持仓市值</span>
          </div>
        </div>
      </div>

      <!-- 折线图区域 -->
      <div class="chart-section">
        <h3 class="section-title">历史趋势（过去60个月）</h3>
        <div class="chart-container">
          <canvas
            ref="lineCanvasRef"
            class="line-canvas"
            style="width: 100%; height: 350px;"
          ></canvas>
        </div>
      </div>

      <!-- 饼图 Tooltip -->
      <div
        v-if="pieTooltip.visible"
        class="chart-tooltip"
        :style="{ left: pieTooltip.x + 12 + 'px', top: pieTooltip.y - 10 + 'px' }"
      >
        {{ pieTooltip.label }}
      </div>

      <!-- 折线图 Tooltip -->
      <div
        v-if="lineTooltip.visible"
        class="chart-tooltip line-tooltip"
        :style="{ left: lineTooltip.x + 12 + 'px', top: lineTooltip.y - 10 + 'px' }"
      >
        <div class="tooltip-content" v-html="lineTooltip.labelHtml"></div>
      </div>
    </div>

    <!-- 无数据状态 -->
    <div v-if="!store.isLoadingOverview && !loadError && !store.fundOverview" class="empty-state">
      <p>暂无资金数据，请先添加资金明细记录</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useProfitChart } from '../composables/useProfitChart';
import { useFundManagementStore } from '../stores/fundManagement';

const store = useFundManagementStore();

// Canvas引用
const pieCanvasRef = ref<HTMLCanvasElement | null>(null);
const lineCanvasRef = ref<HTMLCanvasElement | null>(null);

// 错误状态
const loadError = ref<string | null>(null);

// 饼图Tooltip
const pieTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  label: '',
});

// 折线图Tooltip
const lineTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  labelHtml: '',
});

// Composable实例（饼图和折线图各一个）
let pieChartInstance: ReturnType<typeof useProfitChart> | null = null;
let lineChartInstance: ReturnType<typeof useProfitChart> | null = null;

/**
 * 格式化金额显示
 * 保留两位小数，添加千分位分隔符
 * @param amount 金额数值
 * @returns 格式化后的金额字符串
 */
function formatAmount(amount: number): string {
  return amount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 加载资金统计数据
 * 并行加载资金概览和月度数据
 */
async function loadData(): Promise<void> {
  loadError.value = null;
  try {
    // 并行加载资金概览和月度数据
    await Promise.all([
      store.fetchFundOverview(),
      store.fetchMonthlyFundData(),
    ]);

    // 等待DOM更新后绘制图表
    await nextTick();
    drawPieChart();
    drawLineChart();
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : '加载资金统计数据失败';
    console.error('[FundStatistics] loadData error:', err);
  }
}

/**
 * 绘制饼图
 * 将资金概览数据转换为饼图格式并绘制
 */
function drawPieChart(): void {
  if (!pieCanvasRef.value || !store.fundOverview) return;

  // 初始化composable（如果尚未初始化）
  if (!pieChartInstance) {
    pieChartInstance = useProfitChart(pieCanvasRef.value);
  }

  const overview = store.fundOverview;

  // 准备饼图数据
  const pieData = [
    {
      label: '账户余额',
      value: overview.currentAccountBalance,
      color: '#3b82f6',
    },
    {
      label: '持仓市值',
      value: overview.currentHoldingsMarketValue,
      color: '#f97316',
    },
  ];

  // 绘制饼图
  pieChartInstance.drawPieChart(pieData, {
    showLabels: true,
    showPercentages: true,
  });

  // 同步tooltip信息
  watch(
    () => pieChartInstance?.tooltipInfo.value,
    (info) => {
      if (info) {
        pieTooltip.value = {
          visible: info.visible,
          x: info.x,
          y: info.y,
          label: info.label,
        };
      }
    },
    { immediate: true, deep: true }
  );
}

/**
 * 绘制折线图
 * 将月度资金数据转换为折线图格式并绘制
 */
function drawLineChart(): void {
  if (!lineCanvasRef.value || store.monthlyFundData.length === 0) return;

  // 初始化composable（如果尚未初始化）
  if (!lineChartInstance) {
    lineChartInstance = useProfitChart(lineCanvasRef.value);
  }

  // 将月度数据转换为折线图格式
  const lineData = store.monthlyFundData.map((item: { month: string; endOfMonthAccountBalance: number; endOfMonthHoldingsMarketValue: number; endOfMonthTotalAssets: number }) => ({
    month: item.month,
    accountBalance: item.endOfMonthAccountBalance,
    holdingsValue: item.endOfMonthHoldingsMarketValue,
    totalAssets: item.endOfMonthTotalAssets,
  }));

  // 绘制折线图
  lineChartInstance.drawMultiLineChart(lineData, {
    title: '',
    lineColorBalance: '#3b82f6',
    lineColorHoldings: '#f97316',
    lineColorTotal: '#10b981',
  });

  // 同步tooltip信息
  watch(
    () => lineChartInstance?.tooltipInfo.value,
    (info) => {
      if (info) {
        // 将换行符转换为HTML换行
        const labelHtml = info.label.replace(/\n/g, '<br>');
        lineTooltip.value = {
          visible: info.visible,
          x: info.x,
          y: info.y,
          labelHtml,
        };
      }
    },
    { deep: true }
  );
}

onMounted(() => {
  loadData();
});

onUnmounted(() => {
  if (pieChartInstance) {
    pieChartInstance.cleanup();
  }
  if (lineChartInstance) {
    lineChartInstance.cleanup();
  }
});
</script>

<style scoped lang="scss">
.fund-statistics {
  padding: 16px;

  h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .loading-state,
  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    color: #9ca3af;
    font-size: 14px;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    gap: 12px;

    .error-message {
      color: #ef4444;
      font-size: 14px;
      margin: 0;
    }

    .btn-retry {
      padding: 8px 16px;
      background-color: #3b82f6;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;

      &:hover {
        background-color: #2563eb;
      }
    }
  }

  .statistics-content {
    .cards-row {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;

      .stat-card {
        flex: 1;
        padding: 16px;
        background-color: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        text-align: center;

        .stat-label {
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 8px;
        }

        .stat-value {
          font-size: 20px;
          font-weight: 700;

          &.balance {
            color: #3b82f6;
          }

          &.holdings {
            color: #f97316;
          }

          &.total {
            color: #1f2937;
          }
        }

        &.highlight {
          background-color: #eff6ff;
          border-color: #bfdbfe;
        }
      }
    }

    .chart-section {
      margin-top: 24px;

      .section-title {
        font-size: 15px;
        font-weight: 600;
        color: #374151;
        margin: 0 0 12px 0;
      }

      .chart-container {
        background-color: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
      }

      .pie-canvas,
      .line-canvas {
        display: block;
      }

      .pie-legend {
        display: flex;
        justify-content: center;
        gap: 24px;
        margin-top: 12px;

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;

          .legend-color {
            width: 14px;
            height: 14px;
            border-radius: 3px;
            display: inline-block;
          }

          .legend-label {
            font-size: 13px;
            color: #6b7280;
          }
        }
      }
    }
  }

  .chart-tooltip {
    position: fixed;
    background-color: rgba(31, 41, 55, 0.9);
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    z-index: 1000;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    &.line-tooltip {
      white-space: pre-line;
      line-height: 1.6;

      .tooltip-content {
        :deep(br) {
          display: block;
          content: '';
          margin-top: 2px;
        }
      }
    }
  }
}
</style>