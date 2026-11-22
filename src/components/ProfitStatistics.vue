<template>
  <div class="profit-statistics">
    <h2>盈亏统计</h2>

    <!-- 日期范围选择器 + 快捷按钮 + 计算按钮 + 重置按钮 -->
    <div class="query-bar">
      <DateRangePicker v-model="dateRange" />
      <div class="shortcuts-group">
        <button class="btn btn-secondary btn-sm" @click="handleSetThisYear">今年</button>
        <button class="btn btn-secondary btn-sm" @click="handleSetLastYear">去年</button>
        <button class="btn btn-secondary btn-sm" @click="handleSetLastYearStart">去年开始</button>
      </div>
      <button
        class="btn btn-primary"
        :disabled="!canCalculate || store.isLoading"
        @click="handleCalculate"
      >
        {{ store.isLoading ? '计算中...' : '计算' }}
      </button>
      <button
        class="btn btn-secondary"
        @click="handleReset"
      >
        重置
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="store.isLoading" class="loading-state">
      <p>计算中...</p>
    </div>

    <!-- 统计结果 -->
    <div v-else-if="store.profitStatistics" class="statistics-cards">
      <!-- 六项数据面板 -->
      <div class="cards-row six-cards">
        <div class="stat-card">
          <div class="stat-label">期初账户余额</div>
          <div class="stat-value">¥{{ formatAmount(store.profitStatistics.openingAccountBalance) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">期初持仓市值</div>
          <div class="stat-value">¥{{ formatAmount(store.profitStatistics.openingHoldingsValue) }}</div>
          <div class="stat-sub">持仓 {{ formatShares(store.profitStatistics.openingHoldingsCount) }} 股</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">期末账户余额</div>
          <div class="stat-value">¥{{ formatAmount(store.profitStatistics.closingAccountBalance) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">期末持仓市值</div>
          <div class="stat-value">¥{{ formatAmount(store.profitStatistics.closingHoldingsValue) }}</div>
          <div class="stat-sub">持仓 {{ formatShares(store.profitStatistics.closingHoldingsCount) }} 股</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">转入总额</div>
          <div class="stat-value positive">¥{{ formatAmount(store.profitStatistics.totalIn) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">转出总额</div>
          <div class="stat-value negative">¥{{ formatAmount(store.profitStatistics.totalOut) }}</div>
        </div>
      </div>

      <!-- 盈亏结果 -->
      <!-- <div class="section-title">盈亏结果</div> -->
      <div class="cards-row">
        <div class="stat-card highlight">
          <div class="stat-label">盈亏金额</div>
          <div class="stat-value" :class="getProfitClass(store.profitStatistics.profit)">
            ¥{{ formatAmount(store.profitStatistics.profit) }}
          </div>
          <div class="stat-formula">
            = (期末余额 + 期末持仓) - (期初余额 + 期初持仓) + (转出 - 转入)
          </div>
        </div>
      </div>

      <!-- 图表区域 -->
      <ProfitChart />
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <p>点击计算按钮查看盈亏统计（不选日期则统计所有历史）</p>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.error" class="error-message">
      <p>{{ store.error }}</p>
      <button @click="store.clearError">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useFundManagementStore } from '../stores/fundManagement';
import DateRangePicker from './DateRangePicker.vue';
import ProfitChart from './ProfitChart.vue';

const store = useFundManagementStore();

const dateRange = ref({
  startDate: '',
  endDate: '',
});

/**
 * 判断是否可以执行计算
 * 未选日期时允许计算（统计所有历史），选了日期时需开始日期不晚于结束日期
 */
const canCalculate = computed(() => {
  const { startDate, endDate } = dateRange.value;
  // 两个日期都未选，允许计算所有历史
  if (!startDate && !endDate) {
    return true;
  }
  // 只选了一个日期，不允许
  if (!startDate || !endDate) {
    return false;
  }
  return startDate <= endDate;
});

/**
 * 点击计算按钮，执行盈亏统计计算
 * 未选择日期时统计所有历史记录
 */
const handleCalculate = async () => {
  const { startDate, endDate } = dateRange.value;
  if (!startDate && !endDate) {
    // 未选日期，计算所有历史
    await store.calculateProfit();
  } else if (startDate && endDate) {
    await store.calculateProfit(startDate, endDate);
  }
};

/**
 * 重置日期选择，清除日期和统计结果
 */
const handleReset = () => {
  dateRange.value = { startDate: '', endDate: '' };
};

/**
 * 获取今年的日期范围（今年1月1日到今天）
 * @returns 日期范围对象
 */
const getThisYearRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const startDate = `${year}-01-01`;
  const endDate = now.toISOString().split('T')[0];
  return { startDate, endDate };
};

/**
 * 获取去年的日期范围（去年1月1日到去年12月31日）
 * @returns 日期范围对象
 */
const getLastYearRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const startDate = `${lastYear}-01-01`;
  const endDate = `${lastYear}-12-31`;
  return { startDate, endDate };
};

/**
 * 获取从去年开始的日期范围（去年1月1日到今天）
 * @returns 日期范围对象
 */
const getLastYearStartRange = (): { startDate: string; endDate: string } => {
  const now = new Date();
  const lastYear = now.getFullYear() - 1;
  const startDate = `${lastYear}-01-01`;
  const endDate = now.toISOString().split('T')[0];
  return { startDate, endDate };
};

/**
 * 设置今年日期范围并自动计算
 */
const handleSetThisYear = async () => {
  dateRange.value = getThisYearRange();
  await handleCalculate();
};

/**
 * 设置去年日期范围并自动计算
 */
const handleSetLastYear = async () => {
  dateRange.value = getLastYearRange();
  await handleCalculate();
};

/**
 * 设置从去年开始的日期范围并自动计算
 */
const handleSetLastYearStart = async () => {
  dateRange.value = getLastYearStartRange();
  await handleCalculate();
};

/**
 * 页面初始化时自动计算历史盈亏统计
 */
onMounted(async () => {
  await store.calculateProfit();
});

/**
 * 格式化金额为千分位显示
 * @param amount 金额数值
 * @returns 格式化后的金额字符串
 */
const formatAmount = (amount: number): string => {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * 格式化持仓股数为千分位整数显示
 * @param count 股数数值
 * @returns 格式化后的股数字符串
 */
const formatShares = (count: number): string => {
  return Math.round(count).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

/**
 * 根据盈亏值返回对应的CSS类名
 * @param profit 盈亏金额
 * @returns CSS类名字符串
 */
const getProfitClass = (profit: number): string => {
  if (profit > 0) {
    return 'positive'; // 红色 - 盈利
  } else if (profit < 0) {
    return 'negative'; // 绿色 - 亏损
  } else {
    return 'zero'; // 黑色 - 持平
  }
};
</script>

<style scoped lang="scss">
.profit-statistics {
  padding: var(--space-5);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);

  h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--text-primary);
  }
}

.query-bar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.shortcuts-group {
  display: flex;
  gap: var(--space-2);
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: var(--font-size-md);
}

.section-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin-top: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--border-color-light);
}

.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-2);

  &.six-cards {
    grid-template-columns: repeat(6, 1fr);
  }
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  text-align: center;
  transition: all 0.2s;

  &:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  &.highlight {
    border-color: var(--color-info);
    background: linear-gradient(135deg, var(--bg-info-subtle) 0%, var(--bg-info-subtle) 100%);
  }
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.stat-value {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--text-primary);

  &.positive {
    color: var(--color-profit); // 红色 - 盈利
  }

  &.negative {
    color: var(--color-loss); // 绿色 - 亏损
  }

  &.zero {
    color: var(--text-primary); // 黑色 - 持平
  }
}

.stat-formula {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: var(--space-2);
}

.stat-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: var(--space-1);
}

.error-message {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: var(--bg-danger-subtle);
  color: var(--color-danger-dark);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  gap: var(--space-3);

  p {
    margin: 0;
    font-size: var(--font-size-sm);
  }

  button {
    background: none;
    border: none;
    color: var(--color-danger-dark);
    cursor: pointer;
    font-size: var(--font-size-sm);
    text-decoration: underline;

    &:hover {
      color: var(--color-danger-dark);
    }
  }
}
</style>
