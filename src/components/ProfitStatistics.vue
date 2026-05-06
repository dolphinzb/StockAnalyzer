<template>
  <div class="profit-statistics">
    <h2>盈利统计</h2>

    <!-- 日期范围选择器 -->
    <DateRangePicker v-model="dateRange" @change="handleDateChange" />

    <!-- 加载状态 -->
    <div v-if="store.isLoading" class="loading-state">
      <p>计算中...</p>
    </div>

    <!-- 统计结果 -->
    <div v-else-if="store.profitStatistics" class="statistics-cards">
      <div class="stat-card">
        <div class="stat-label">转入总额</div>
        <div class="stat-value positive">¥{{ formatAmount(store.profitStatistics.totalIn) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">转出总额</div>
        <div class="stat-value negative">¥{{ formatAmount(store.profitStatistics.totalOut) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">账户余额</div>
        <div class="stat-value">¥{{ formatAmount(store.profitStatistics.accountBalance) }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">当前持仓</div>
        <div class="stat-value">¥{{ formatAmount(store.profitStatistics.currentHoldings) }}</div>
      </div>
      <div class="stat-card highlight">
        <div class="stat-label">盈利金额</div>
        <div class="stat-value" :class="getProfitClass(store.profitStatistics.profit)">
          ¥{{ formatAmount(store.profitStatistics.profit) }}
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <p>请选择日期范围查看盈利统计</p>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.error" class="error-message">
      <p>{{ store.error }}</p>
      <button @click="store.clearError">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import DateRangePicker from './DateRangePicker.vue';
import { useFundManagementStore } from '../stores/fundManagement';

const store = useFundManagementStore();

const dateRange = ref({
  startDate: '',
  endDate: '',
});

// 处理日期范围变化
const handleDateChange = async (value: { startDate: string; endDate: string }) => {
  if (value.startDate && value.endDate) {
    await store.calculateProfit(value.startDate, value.endDate);
  }
};

// 格式化金额
const formatAmount = (amount: number): string => {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// 获取盈利颜色类名
const getProfitClass = (profit: number): string => {
  if (profit > 0) {
    return 'positive'; // 红色
  } else if (profit < 0) {
    return 'negative'; // 绿色
  } else {
    return 'zero'; // 黑色
  }
};

// 组件挂载时自动加载历史统计和账户余额
onMounted(async () => {
  await store.fetchAccountBalance();
  await store.calculateProfit();
});
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

.loading-state,
.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  font-size: 16px;
}

.statistics-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 20px;
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
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
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