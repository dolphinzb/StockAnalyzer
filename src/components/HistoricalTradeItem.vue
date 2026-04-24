<script setup lang="ts">
import { ref, watch } from 'vue';
import type { HistoricalTradeRecord, TradeDetail } from '../types';
import HistoricalTradeDetail from './HistoricalTradeDetail.vue';

/**
 * 单条历史记录项组件
 * 展示一只股票从开仓到清仓的完整交易周期统计数据
 * 支持展开/收起查看交易明细
 */
const props = defineProps<{
  /** 历史开仓记录 */
  record: HistoricalTradeRecord;
  /** 是否展开 */
  isExpanded: boolean;
}>();

const emit = defineEmits<{
  /** 展开/收起事件 */
  toggle: [recordId: string];
}>();

/** 交易明细数据 */
const details = ref<TradeDetail[]>([]);
/** 是否正在加载明细 */
const isLoadingDetails = ref(false);

/**
 * 格式化金额，保留两位小数
 */
function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * 格式化盈利比例，保留两位小数并添加百分号
 */
function formatProfitRatio(ratio: number): string {
  return `${ratio >= 0 ? '+' : ''}${ratio.toFixed(2)}%`;
}

/**
 * 获取盈利颜色：正数红色，负数绿色，零默认颜色
 */
function getProfitColor(profit: number): string {
  if (profit > 0) return 'var(--color-profit)';
  if (profit < 0) return 'var(--color-loss)';
  return 'var(--text-color)';
}

/**
 * 切换展开/收起状态
 */
function handleToggle(): void {
  emit('toggle', props.record.id);
}

/**
 * 监听展开状态，加载交易明细
 */
watch(
  () => props.isExpanded,
  async (expanded) => {
    if (expanded && details.value.length === 0) {
      await loadDetails();
    }
  }
);

/**
 * 加载交易明细数据
 */
async function loadDetails(): Promise<void> {
  isLoadingDetails.value = true;
  try {
    details.value = await window.historicalTradeAPI.getCycleDetails(props.record.id);
  } catch (err) {
    console.error('Failed to load trade details:', err);
    details.value = [];
  } finally {
    isLoadingDetails.value = false;
  }
}
</script>

<template>
  <div class="historical-trade-item">
    <div class="trade-header" @click="handleToggle">
      <div class="stock-info">
        <span class="stock-code">{{ record.stockCode }}</span>
        <span class="stock-name">{{ record.stockName }}</span>
      </div>
      <div class="header-right">
        <div class="trade-period">
          <span class="period-label">周期:</span>
          <span class="period-dates">{{ record.openTime }} ~ {{ record.closeTime }}</span>
        </div>
        <span class="expand-icon" :class="{ expanded: isExpanded }">
          {{ isExpanded ? '▼' : '▶' }}
        </span>
      </div>
    </div>

    <div class="trade-stats">
      <div class="stat-group">
        <span class="stat-label">买入次数</span>
        <span class="stat-value">{{ record.totalBuyCount }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">卖出次数</span>
        <span class="stat-value">{{ record.totalSellCount }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">交易股数</span>
        <span class="stat-value">{{ record.totalShares }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">买入金额</span>
        <span class="stat-value">¥{{ formatAmount(record.totalBuyAmount) }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">卖出金额</span>
        <span class="stat-value">¥{{ formatAmount(record.totalSellAmount) }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">分红金额</span>
        <span class="stat-value">¥{{ formatAmount(record.totalDividendAmount) }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">手续费</span>
        <span class="stat-value">¥{{ formatAmount(record.totalFees) }}</span>
      </div>
      <div class="stat-group">
        <span class="stat-label">总盈利</span>
        <span class="stat-value profit-value" :style="{ color: getProfitColor(record.totalProfit) }">
          {{ record.totalProfit >= 0 ? '+' : '' }}{{ formatAmount(record.totalProfit) }}
        </span>
      </div>
      <div class="stat-group">
        <span class="stat-label">盈利比例</span>
        <span class="stat-value profit-value" :style="{ color: getProfitColor(record.totalProfit) }">
          {{ formatProfitRatio(record.profitRatio) }}
        </span>
      </div>
    </div>

    <div v-if="isExpanded" class="detail-section">
      <div v-if="isLoadingDetails" class="loading-details">加载明细中...</div>
      <HistoricalTradeDetail v-else :details="details" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.historical-trade-item {
  border-bottom: 1px solid var(--border-color);
  transition: background-color 0.2s ease;

  &:hover {
    background-color: var(--hover-bg);
  }
}

.trade-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  cursor: pointer;
  user-select: none;

  &:hover {
    background-color: rgba(0, 0, 0, 0.02);
  }
}

.stock-info {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.stock-code {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.stock-name {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.trade-period {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.period-label {
  font-weight: 500;
}

.period-dates {
  font-family: monospace;
}

.expand-icon {
  font-size: 0.75rem;
  color: var(--text-secondary);
  transition: transform 0.2s ease;

  &.expanded {
    transform: rotate(0deg);
  }
}

.trade-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  padding: 0 1rem 1rem 1rem;
}

.stat-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color);
}

.profit-value {
  font-weight: 600;
}

.detail-section {
  border-top: 1px solid var(--border-color);
}

.loading-details {
  padding: 1rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}
</style>
