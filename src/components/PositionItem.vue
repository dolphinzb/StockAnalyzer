<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Position } from '../types';
import TradeRecordItem from './TradeRecordItem.vue';

const props = defineProps<{
  position: Position;
  isExpanded: boolean;
  refreshKey?: number;
}>();

const emit = defineEmits<{
  toggle: [stockCode: string];
  editRecord: [record: any];
  deleteRecord: [id: number];
}>();

const tradeRecords = ref<any[]>([]);
const isLoadingRecords = ref(false);

watch(() => props.isExpanded, async (expanded) => {
  if (expanded && tradeRecords.value.length === 0) {
    await loadTradeRecords();
  }
});

watch(() => props.refreshKey, async () => {
  if (props.isExpanded) {
    await loadTradeRecords();
  }
});

async function loadTradeRecords() {
  isLoadingRecords.value = true;
  try {
    tradeRecords.value = await window.positionApi.getTradeRecords(props.position.stockCode);
  } catch (error) {
    console.error('Failed to load trade records:', error);
  } finally {
    isLoadingRecords.value = false;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '-';
  return price.toFixed(3);
}

function formatProfitAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '-';
  const prefix = amount >= 0 ? '+' : '';
  return prefix + amount.toFixed(2);
}

function formatProfitRatio(ratio: number | null): string {
  if (ratio === null || ratio === undefined) return '-';
  const prefix = ratio >= 0 ? '+' : '';
  return prefix + ratio.toFixed(2) + '%';
}

function getProfitClass(amount: number | null): string {
  if (amount === null || amount === undefined) return '';
  if (amount > 0) return 'profit-positive';
  if (amount < 0) return 'profit-negative';
  return '';
}

function handleToggle() {
  emit('toggle', props.position.stockCode);
}
</script>

<template>
  <div class="position-item">
    <div class="position-summary" @click="handleToggle">
      <span class="col-code">{{ position.stockCode }}</span>
      <span class="col-name">{{ position.stockName }}</span>
      <span class="col-date">{{ formatDate(position.lastTradeDate) }}</span>
      <span class="col-count">{{ position.holdingCount }}</span>
      <span class="col-cost">{{ formatPrice(position.holdingPrice) }}</span>
      <span class="col-current">{{ formatPrice(position.currentPrice) }}</span>
      <span class="col-profit" :class="getProfitClass(position.profitAmount)">{{ formatProfitAmount(position.profitAmount) }}</span>
      <span class="col-ratio" :class="getProfitClass(position.profitAmount)">{{ formatProfitRatio(position.profitRatio) }}</span>
      <span class="col-arrow" :class="{ expanded: isExpanded }">▼</span>
    </div>

    <div v-if="isExpanded" class="trade-records">
      <div v-if="isLoadingRecords" class="loading">加载中...</div>
      <div v-else-if="tradeRecords.length === 0" class="empty-records">暂无交易记录</div>
      <div v-else class="records-list">
        <div class="record-header">
          <span>股票代码</span>
          <span>股票名称</span>
          <span>交易类型</span>
          <span>交易日期</span>
          <span>交易价格</span>
          <span>交易数量</span>
          <span>持仓数量</span>
          <span>持仓均价</span>
          <span>操作</span>
        </div>
        <TradeRecordItem
          v-for="record in tradeRecords"
          :key="record.id"
          :record="record"
          @edit="emit('editRecord', $event)"
          @delete="emit('deleteRecord', $event)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.position-item {
  border-bottom: 1px solid var(--border-color);

  &:last-child {
    border-bottom: none;
  }
}

.position-summary {
  display: grid;
  grid-template-columns: 80px 90px 80px 70px 80px 80px 90px 70px 40px;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  align-items: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--hover-bg);
  }
}

.col-code {
  font-weight: 500;
  font-family: monospace;
}

.col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-date {
  font-size: 0.85rem;
}

.col-count,
.col-cost,
.col-current,
.col-profit,
.col-ratio {
  text-align: right;
  font-family: monospace;
}

.col-arrow {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
  transition: transform 0.2s;

  &.expanded {
    transform: rotate(180deg);
  }
}

.profit-positive {
  color: #e53935;
}

.profit-negative {
  color: #43a047;
}

.trade-records {
  padding: 0.5rem;
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.loading,
.empty-records {
  padding: 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.record-header {
  display: grid;
  grid-template-columns: 80px 90px 80px 100px 90px 90px 90px 100px 60px;
  gap: 0.5rem;
  padding: 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;

  span:nth-child(3),
  span:nth-child(5),
  span:nth-child(6),
  span:nth-child(7) {
    text-align: center;
  }

  span:nth-child(8) {
    text-align: right;
  }

  span:nth-child(9) {
    text-align: center;
  }
}
</style>