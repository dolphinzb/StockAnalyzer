<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { Position } from '../types';
import TradeRecordItem from './TradeRecordItem.vue';

/** 每页加载的记录条数 */
const PAGE_SIZE = 20;

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

/** 交易记录列表 */
const tradeRecords = ref<any[]>([]);
/** 是否正在加载记录 */
const isLoadingRecords = ref(false);
/** 当前页码，从1开始 */
const currentPage = ref(1);
/** 是否还有更多记录可加载 */
const hasMore = ref(false);
/** 是否正在加载更多记录（追加加载） */
const isLoadingMore = ref(false);
/** 交易记录列表容器的引用，用于监听滚动事件 */
const recordsListRef = ref<HTMLElement | null>(null);
/** 交易记录列表的动态最大高度（px） */
const scrollContainerMaxHeight = ref('400px');

/**
 * 监听展开/收起状态变化
 * 展开时加载第一页数据，收起时重置分页状态（FR-017）
 */
watch(() => props.isExpanded, async (expanded) => {
  if (expanded) {
    // 切换股票时重置分页状态，从第一页重新加载
    resetAndLoad();
  }
});

/**
 * 监听 refreshKey 变化，刷新当前展开的交易记录
 * 用于新增、编辑、删除交易记录后自动刷新列表
 */
watch(() => props.refreshKey, async () => {
  if (props.isExpanded) {
    await resetAndLoad();
  }
});

/**
 * 重置分页状态并重新加载第一页数据
 * 切换展开股票时调用（FR-017）
 */
async function resetAndLoad() {
  currentPage.value = 1;
  tradeRecords.value = [];
  hasMore.value = false;
  await loadTradeRecords(1);
}

/**
 * 加载交易记录
 * @param page 要加载的页码
 */
async function loadTradeRecords(page: number) {
  if (page === 1) {
    isLoadingRecords.value = true;
  } else {
    isLoadingMore.value = true;
  }

  try {
    const result = await window.positionApi.getTradeRecords(
      props.position.stockCode,
      page,
      PAGE_SIZE
    );

    if (page === 1) {
      // 第一页：替换所有记录
      tradeRecords.value = result.records;
    } else {
      // 后续页：追加记录
      tradeRecords.value = [...tradeRecords.value, ...result.records];
    }

    currentPage.value = page;
    hasMore.value = result.hasMore;
  } catch (error) {
    console.error('Failed to load trade records:', error);
  } finally {
    isLoadingRecords.value = false;
    isLoadingMore.value = false;
  }
}

/**
 * 处理交易记录列表容器的滚动事件
 * 当滚动到底部且还有更多记录时，自动加载下一页（FR-015）
 */
function handleScroll(event: Event) {
  const container = event.target as HTMLElement;
  if (!container || !hasMore.value || isLoadingMore.value) {
    return;
  }

  // 判断是否滚动到底部（距离底部不超过50px时触发加载）
  const { scrollTop, scrollHeight, clientHeight } = container;
  if (scrollHeight - scrollTop - clientHeight <= 50) {
    loadTradeRecords(currentPage.value + 1);
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

/**
 * 根据窗口高度动态计算交易记录列表的最大高度
 * 计算方式：窗口高度 - 页面顶部预留区域（标题栏+表头+边距等约180px）- 持仓摘要行高度（约40px）- 列表底部边距（约20px）
 * 最小高度限制为200px，确保至少能显示几条记录
 */
function updateScrollContainerMaxHeight() {
  const reservedHeight = 200;
  const minHeight = 200;
  const availableHeight = window.innerHeight - reservedHeight;
  const calculatedHeight = Math.max(availableHeight, minHeight);
  scrollContainerMaxHeight.value = `${calculatedHeight}px`;
}

onMounted(() => {
  updateScrollContainerMaxHeight();
  window.addEventListener('resize', updateScrollContainerMaxHeight);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateScrollContainerMaxHeight);
});
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
      <!-- 首次加载中 -->
      <div v-if="isLoadingRecords" class="loading">加载中...</div>
      <!-- 无交易记录 -->
      <div v-else-if="tradeRecords.length === 0" class="empty-records">暂无交易记录</div>
      <!-- 交易记录列表（支持无限滚动） -->
      <div v-else class="records-scroll-container" ref="recordsListRef" :style="{ maxHeight: scrollContainerMaxHeight }" @scroll="handleScroll">
        <div class="records-list">
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
        <!-- 加载更多提示（FR-016） -->
        <div v-if="isLoadingMore" class="load-more-tip">加载中...</div>
        <div v-else-if="!hasMore" class="load-more-tip">已加载全部</div>
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

/* 交易记录滚动容器：设置纵向滚动条，最大高度通过JS动态计算（FR-015） */
.records-scroll-container {
  overflow-y: auto;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

/* 加载更多提示样式（FR-016） */
.load-more-tip {
  padding: 0.5rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85rem;
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
