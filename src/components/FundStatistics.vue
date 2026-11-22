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
      <button class="btn btn-secondary" @click="loadData">重试</button>
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

      <!-- 资产分布：左侧饼图按标的拆分，右侧持仓明细表格 -->
      <div class="chart-section">
        <h3 class="section-title">资产分布</h3>
        <div class="distribution-layout">
          <!-- 饼图区域 -->
          <div class="pie-panel">
            <div class="chart-container">
              <canvas
                ref="pieCanvasRef"
                class="pie-canvas"
                style="width: 100%; height: 300px;"
              ></canvas>
            </div>
          </div>

          <!-- 持仓明细表格区域 -->
          <div class="holdings-panel">
            <div class="holdings-header">
              <h4 class="holdings-title">持仓明细</h4>
              <span class="holdings-subtitle">占比按总资产计算</span>
            </div>

            <!-- 空状态：无持仓时不渲染表格 -->
            <div v-if="holdingsRows.length === 0" class="holdings-empty">
              暂无持仓
            </div>

            <template v-else>
              <div class="holdings-table-wrapper">
                <table class="holdings-table">
                  <thead>
                    <tr>
                      <th class="col-name">标的</th>
                      <th class="col-num">持仓数量</th>
                      <th class="col-num">最新价</th>
                      <th class="col-num">持仓市值</th>
                      <th class="col-percent">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in holdingsRows"
                      :key="row.stockCode"
                      :class="{ 'missing-data': !row.hasKlineData }"
                    >
                      <td class="col-name">
                        <span class="row-color" :style="{ backgroundColor: row.color }"></span>
                        <span class="name-text">
                          <span class="stock-name">{{ row.stockName || row.stockCode }}</span>
                          <span class="stock-code">{{ row.stockCode }}</span>
                        </span>
                      </td>
                      <td class="col-num">{{ formatCount(row.holdingCount) }}</td>
                      <td class="col-num">
                        {{ row.hasKlineData ? formatPrice(row.closePrice, row.stockCode) : '—' }}
                      </td>
                      <td class="col-num">
                        {{ row.hasKlineData ? `¥${formatAmount(row.marketValue)}` : '—' }}
                      </td>
                      <td class="col-percent">
                        <template v-if="row.percentage !== null">
                          <span class="percent-value">{{ row.percentage.toFixed(2) }}%</span>
                          <span class="percent-bar">
                            <span
                              class="percent-bar-inner"
                              :style="{ width: row.barWidth + '%', backgroundColor: row.color }"
                            ></span>
                          </span>
                        </template>
                        <span v-else class="missing-value">—</span>
                      </td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colspan="3">持仓合计</td>
                      <td class="col-num">¥{{ formatAmount(store.fundOverview?.currentHoldingsMarketValue ?? 0) }}</td>
                      <td class="col-percent">
                        {{ holdingsTotalPercentage === null ? '—' : holdingsTotalPercentage.toFixed(2) + '%' }}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <!-- 缺少行情数据的降级提示 -->
              <p v-if="missingKlineCount > 0" class="holdings-hint">
                {{ missingKlineCount }} 只标的因缺少行情数据未计入持仓总市值
              </p>
            </template>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useProfitChart } from '../composables/useProfitChart';
import { useFundManagementStore } from '../stores/fundManagement';
import { formatPrice } from '../utils/formatPrice';
import { buildHoldingsRows } from '../utils/holdings';
import { token } from '../utils/designTokens';

const store = useFundManagementStore();

// Canvas引用
const pieCanvasRef = ref<HTMLCanvasElement | null>(null);
const lineCanvasRef = ref<HTMLCanvasElement | null>(null);

// 错误状态
const loadError = ref<string | null>(null);

/**
 * 持仓明细展示行
 * 与饼图共用同一份排序结果和颜色映射，保证左右对应
 */
const holdingsRows = computed(() => {
  return buildHoldingsRows(
    store.fundOverview?.holdings ?? [],
    store.fundOverview?.totalAssets ?? 0
  );
});

/** 缺少行情数据、未计入总市值的标的数量 */
const missingKlineCount = computed(() => {
  return holdingsRows.value.filter((row) => !row.hasKlineData).length;
});

/** 持仓总市值占总资产的百分比（总资产为 0 时为 null） */
const holdingsTotalPercentage = computed<number | null>(() => {
  const totalAssets = store.fundOverview?.totalAssets ?? 0;
  if (totalAssets <= 0) return null;
  return ((store.fundOverview?.currentHoldingsMarketValue ?? 0) / totalAssets) * 100;
});

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
 * 格式化持仓数量显示
 * 整数展示并添加千分位分隔符
 * @param count 持仓数量
 * @returns 格式化后的数量字符串
 */
function formatCount(count: number): string {
  return count.toLocaleString('zh-CN');
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
 * 将账户余额与逐只持仓明细转换为饼图扇区并绘制
 * 扇区颜色、顺序与右侧「持仓明细」表格完全一致
 */
function drawPieChart(): void {
  if (!pieCanvasRef.value || !store.fundOverview) return;

  // 初始化composable（如果尚未初始化）
  if (!pieChartInstance) {
    pieChartInstance = useProfitChart(pieCanvasRef.value);
  }

  const overview = store.fundOverview;

  // 逐只持仓扇区：仅绘制有行情数据且市值大于 0 的标的
  const holdingSlices = holdingsRows.value
    .filter((row) => row.hasKlineData && row.marketValue > 0)
    .map((row) => ({
      label: row.stockName || row.stockCode,
      value: row.marketValue,
      color: row.color,
    }));

  // 准备饼图数据：逐只持仓 + 账户余额（余额为 0 时不绘制扇区）
  const pieData = [
    ...holdingSlices,
    ...(overview.currentAccountBalance > 0
      ? [{ label: '账户余额', value: overview.currentAccountBalance, color: token('--color-info') }]
      : []),
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
  // 折线颜色由 useProfitChart 的默认值（令牌 --color-info / --color-warning / --color-success）提供
  lineChartInstance.drawMultiLineChart(lineData, {
    title: '',
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
  padding: var(--space-4);

  h2 {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--text-primary);
  }

  .loading-state,
  .empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    color: var(--text-tertiary);
    font-size: var(--font-size-sm);
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    gap: var(--space-3);

    .error-message {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-danger);
    }

  }

  .statistics-content {
    .cards-row {
      display: flex;
      gap: var(--space-4);
      margin-bottom: var(--space-5);

      .stat-card {
        flex: 1;
        padding: var(--space-4);
        background-color: var(--bg-secondary);
        border: 1px solid var(--border-color-light);
        border-radius: var(--radius-lg);
        text-align: center;

        .stat-label {
          font-size: var(--font-size-sm);
          color: var(--text-secondary);
          margin-bottom: var(--space-2);
        }

        .stat-value {
          font-size: var(--font-size-xl);
          font-weight: 700;

          &.balance {
            color: var(--color-info);
          }

          &.holdings {
            color: var(--color-warning);
          }

          &.total {
            color: var(--text-primary);
          }
        }

        &.highlight {
          background-color: var(--bg-info-subtle);
          border-color: var(--bg-info-subtle);
        }
      }
    }

    .chart-section {
      margin-top: var(--space-5);

      .section-title {
        font-size: var(--font-size-md);
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 var(--space-3) 0;
      }

      .chart-container {
        background-color: var(--bg-primary);
        border: 1px solid var(--border-color-light);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
      }

      .pie-canvas,
      .line-canvas {
        display: block;
      }

      // 资产分布：左侧饼图 + 右侧持仓明细表格
      .distribution-layout {
        display: flex;
        gap: var(--space-4);
        align-items: stretch;

        .pie-panel {
          flex: 1 1 48%;
          min-width: 320px;
        }

        .holdings-panel {
          flex: 1 1 52%;
          min-width: 420px;
          display: flex;
          flex-direction: column;
          background-color: var(--bg-primary);
          border: 1px solid var(--border-color-light);
          border-radius: var(--radius-lg);
          padding: var(--space-4);
        }
      }

      // 窄窗口下改为上下布局，避免表格被压缩
      @media (max-width: 1100px) {
        .distribution-layout {
          flex-direction: column;

          .pie-panel,
          .holdings-panel {
            min-width: 0;
          }
        }
      }

      .holdings-header {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        margin-bottom: var(--space-3);

        .holdings-title {
          margin: 0;
          font-size: var(--font-size-sm);
          font-weight: 600;
          color: var(--text-primary);
        }

        .holdings-subtitle {
          font-size: var(--font-size-xs);
          color: var(--text-tertiary);
        }
      }

      .holdings-empty {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 220px;
        color: var(--text-tertiary);
        font-size: var(--font-size-sm);
      }

      .holdings-table-wrapper {
        // 标的较多时表格内部滚动，避免撑高整页
        max-height: 300px;
        overflow: auto;
      }

      .holdings-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--font-size-xs);
        white-space: nowrap;

        th,
        td {
          padding: var(--space-2) var(--space-3);
          border-bottom: 1px solid var(--bg-tertiary);
          text-align: left;
        }

        th {
          // 滚动时表头吸顶
          position: sticky;
          top: 0;
          z-index: 1;
          background-color: var(--bg-secondary);
          color: var(--text-secondary);
          font-weight: 600;
        }

        tbody tr:hover {
          background-color: var(--bg-secondary);
        }

        .col-num,
        .col-percent {
          text-align: right;
        }

        // 表格行内的颜色标识，与饼图扇区颜色一致
        .row-color {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: var(--radius-sm);
          margin-right: var(--space-2);
          vertical-align: middle;
        }

        .name-text {
          display: inline-flex;
          flex-direction: column;
          vertical-align: middle;
          line-height: 1.3;
        }

        .stock-name {
          color: var(--text-primary);
          font-weight: 500;
        }

        .stock-code {
          color: var(--text-tertiary);
          font-size: var(--font-size-xs);
        }

        .percent-value {
          color: var(--text-primary);
        }

        // 占比进度条
        .percent-bar {
          display: block;
          height: 4px;
          margin-top: var(--space-1);
          background-color: var(--bg-tertiary);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }

        .percent-bar-inner {
          display: block;
          height: 100%;
          border-radius: var(--radius-sm);
        }

        // 缺少行情数据的行整体置灰
        .missing-data {
          .stock-name {
            color: var(--text-tertiary);
          }
        }

        .missing-value {
          color: var(--text-tertiary);
        }

        tfoot td {
          border-top: 1px solid var(--border-color-light);
          border-bottom: none;
          background-color: var(--bg-secondary);
          color: var(--text-primary);
          font-weight: 600;
        }
      }

      .holdings-hint {
        margin: var(--space-2) 0 0 0;
        font-size: var(--font-size-xs);
        color: var(--color-warning);
      }
    }
  }

  .chart-tooltip {
    position: fixed;
    background-color: var(--chart-tooltip-bg);
    color: var(--text-on-color);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    pointer-events: none;
    z-index: 1000;
    white-space: nowrap;
    box-shadow: var(--shadow-md);

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