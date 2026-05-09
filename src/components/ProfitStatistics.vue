<template>
  <div class="profit-statistics">
    <h2>盈亏统计</h2>

    <!-- 日期范围选择器 + 计算按钮 + 重置按钮 -->
    <div class="query-bar">
      <DateRangePicker v-model="dateRange" />
      <button
        class="btn-calculate"
        :disabled="!canCalculate || store.isLoading"
        @click="handleCalculate"
      >
        {{ store.isLoading ? '计算中...' : '计算' }}
      </button>
      <button
        class="btn-reset"
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
        </div>
        <div class="stat-card">
          <div class="stat-label">期末账户余额</div>
          <div class="stat-value">¥{{ formatAmount(store.profitStatistics.closingAccountBalance) }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">期末持仓市值</div>
          <div class="stat-value">¥{{ formatAmount(store.profitStatistics.closingHoldingsValue) }}</div>
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
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #111827;
  }
}

.query-bar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.btn-calculate {
  padding: 8px 24px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  height: 36px;

  &:hover:not(:disabled) {
    background-color: #2563eb;
  }

  &:active:not(:disabled) {
    background-color: #1d4ed8;
  }

  &:disabled {
    background-color: #9ca3af;
    cursor: not-allowed;
  }
}

.btn-reset {
  padding: 8px 24px;
  background-color: white;
  color: #6b7280;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  height: 36px;

  &:hover {
    background-color: #f9fafb;
    border-color: #9ca3af;
  }

  &:active {
    background-color: #f3f4f6;
  }
}

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-top: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #e5e7eb;
}

.cards-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 8px;

  &.six-cards {
    grid-template-columns: repeat(6, 1fr);
  }
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  transition: all 0.2s;

  &:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }

  &.highlight {
    border-color: #3b82f6;
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  }
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 6px;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #111827;

  &.positive {
    color: #ef4444; // 红色 - 盈利
  }

  &.negative {
    color: #10b981; // 绿色 - 亏损
  }

  &.zero {
    color: #111827; // 黑色 - 持平
  }
}

.stat-formula {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 6px;
}

.error-message {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: #fee2e2;
  color: #991b1b;
  padding: 12px 16px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 12px;

  p {
    margin: 0;
    font-size: 14px;
  }

  button {
    background: none;
    border: none;
    color: #991b1b;
    cursor: pointer;
    font-size: 14px;
    text-decoration: underline;

    &:hover {
      color: #7f1d1d;
    }
  }
}
</style>
