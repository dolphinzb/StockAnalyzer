<script setup lang="ts">
import type { TradeDetail } from '../types';

/**
 * 展开的交易明细组件
 * 展示交易周期内的所有交易明细，按交易日期正序排列
 */
defineProps<{
  /** 交易明细数组 */
  details: TradeDetail[];
}>();

/**
 * 格式化金额，保留两位小数
 */
function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

/**
 * 获取交易类型的中文标签
 */
function getTradeTypeLabel(type: 'BUY' | 'SELL' | 'DIVIDEND'): string {
  const labels = {
    BUY: '买入',
    SELL: '卖出',
    DIVIDEND: '股息',
  };
  return labels[type];
}

/**
 * 获取交易类型的样式类
 */
function getTradeTypeClass(type: 'BUY' | 'SELL' | 'DIVIDEND'): string {
  return `trade-type-${type.toLowerCase()}`;
}

/**
 * 计算成交金额
 * 买入为负数（资金流出），卖出和股息为正数（资金流入）
 * 股息成交金额 = trade_price × holding_count × 0.9
 */
function getSignedAmount(detail: TradeDetail): number {
  if (detail.tradeType === 'BUY') {
    const amount = detail.tradePrice * Math.abs(detail.tradeCount);
    return -amount;
  } else if (detail.tradeType === 'DIVIDEND') {
    return detail.tradePrice * detail.holdingCount * 0.9;
  }
  return detail.tradePrice * Math.abs(detail.tradeCount);
}
</script>

<template>
  <div class="historical-trade-detail">
    <div class="detail-header">
      <h4>交易明细</h4>
      <span class="detail-count">共 {{ details.length }} 笔交易</span>
    </div>

    <div class="detail-table">
      <div class="table-header">
        <div class="col-date">交易日期</div>
        <div class="col-type">交易类型</div>
        <div class="col-price">交易价格</div>
        <div class="col-count">交易数量</div>
        <div class="col-amount">成交金额</div>
        <div class="col-fee">手续费</div>
      </div>

      <div
        v-for="(detail, index) in details"
        :key="index"
        class="table-row"
      >
        <div class="col-date">{{ detail.tradeDate }}</div>
        <div class="col-type" :class="getTradeTypeClass(detail.tradeType)">
          {{ getTradeTypeLabel(detail.tradeType) }}
        </div>
        <div class="col-price">{{ formatAmount(detail.tradePrice) }}</div>
        <div class="col-count">{{ detail.tradeCount }}</div>
        <div class="col-amount">{{ formatAmount(getSignedAmount(detail)) }}</div>
        <div class="col-fee">{{ formatAmount(detail.fee) }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.historical-trade-detail {
  padding: 1rem;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;

  h4 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
}

.detail-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.detail-table {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.table-header {
  display: grid;
  grid-template-columns: 100px 70px 80px 70px 90px 70px;
  background-color: var(--bg-tertiary);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

.table-row {
  display: grid;
  grid-template-columns: 100px 70px 80px 70px 90px 70px;
  padding: 0.5rem;
  font-size: 0.875rem;
  border-bottom: 1px solid var(--border-color);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: var(--hover-bg);
  }
}

.col-date {
  font-family: monospace;
}

.col-type {
  font-weight: 500;

  &.trade-type-buy {
    color: var(--color-buy);
  }

  &.trade-type-sell {
    color: var(--color-sell);
  }

  &.trade-type-dividend {
    color: var(--color-dividend);
  }
}

.col-price,
.col-count,
.col-amount,
.col-fee {
  text-align: right;
  font-family: monospace;
}
</style>
