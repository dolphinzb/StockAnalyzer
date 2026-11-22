<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';
import { getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import type { Position } from '../types';
import TradeRecordItem from './TradeRecordItem.vue';

/** 每页加载的记录条数 */
const PAGE_SIZE = 20;
/** 哨兵距离可视区底部的触发余量（px） */
const LOAD_MORE_THRESHOLD = 80;

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
/** 记录列表所在的滚动容器（持仓列表主体） */
let scrollRoot: HTMLElement | null = null;
/** 组件实例：getCurrentInstance 只能在 setup 同步阶段取到，需提前缓存 */
const instance = getCurrentInstance();

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
 * 取当前实例渲染出来的哨兵元素
 * 记录列表随展开状态在 v-else 分支重建，直接从组件根元素内查询最可靠
 */
function currentSentinel(): HTMLElement | null {
  const root = instance?.vnode.el as HTMLElement | null;
  return root?.querySelector<HTMLElement>('.load-more-tip') ?? null;
}

/**
 * 哨兵滚入可视区时追加下一页（FR-015）
 * 交易记录随持仓列表统一滚动，不再有第二层滚动容器
 */
function checkLoadMore() {
  if (!props.isExpanded) return;
  if (!hasMore.value || isLoadingMore.value) return;

  const sentinel = currentSentinel();
  if (!sentinel) return;

  // 首次触发时再绑定滚动容器，避免依赖挂载时机
  if (!scrollRoot) {
    scrollRoot = (instance?.vnode.el as HTMLElement | null)?.closest('.list-body') ?? null;
    scrollRoot?.addEventListener('scroll', checkLoadMore, { passive: true });
  }
  if (!scrollRoot) return;

  const rootRect = scrollRoot.getBoundingClientRect();
  const sentinelRect = sentinel.getBoundingClientRect();
  if (sentinelRect.top - rootRect.bottom > LOAD_MORE_THRESHOLD) return;

  loadTradeRecords(currentPage.value + 1);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return dateStr.split('T')[0];
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '-';
  // 最多显示4位小数，去掉末尾的0
  return parseFloat(price.toFixed(4)).toString();
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

onMounted(() => {
  // 记录列表随持仓列表统一滚动：监听最近的列表主体容器
  scrollRoot = (instance?.vnode.el as HTMLElement | null)?.closest('.list-body') ?? null;
  scrollRoot?.addEventListener('scroll', checkLoadMore, { passive: true });
});

onUnmounted(() => {
  scrollRoot?.removeEventListener('scroll', checkLoadMore);
  scrollRoot = null;
});

/** 展开或记录条数变化后检查一次，记录不足一屏时也能继续补齐 */
watch([() => props.isExpanded, () => tradeRecords.value.length], async () => {
  await nextTick();
  checkLoadMore();
});
</script>

<template>
  <div class="position-item">
    <div class="position-summary" @click="handleToggle">
      <span class="col-code">{{ position.stockCode }}</span>
      <span class="col-name" :title="position.stockName">{{ position.stockName }}</span>
      <span class="col-date">{{ formatDate(position.lastTradeDate) }}</span>
      <span class="col-count">{{ position.holdingCount }}</span>
      <span class="col-cost">{{ formatPrice(position.holdingPrice) }}</span>
      <span class="col-current">{{ formatPrice(position.currentPrice) }}</span>
      <span class="col-profit" :class="getProfitClass(position.profitAmount)">{{ formatProfitAmount(position.profitAmount) }}</span>
      <span class="col-ratio" :class="getProfitClass(position.profitAmount)">{{ formatProfitRatio(position.profitRatio) }}</span>
      <span class="col-arrow" :class="{ expanded: isExpanded }">
        <AppIcon name="chevron-down" :size="16" />
      </span>
    </div>

    <div v-if="isExpanded" class="trade-records">
      <!-- 首次加载中 -->
      <div v-if="isLoadingRecords" class="loading">加载中...</div>
      <!-- 无交易记录 -->
      <div v-else-if="tradeRecords.length === 0" class="empty-records">暂无交易记录</div>
      <!-- 交易记录列表（随持仓列表统一滚动，末尾哨兵触发分页加载） -->
      <div v-else class="records-container">
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
        <!-- 加载更多哨兵与提示：滚入可视区时自动加载下一页（FR-015） -->
        <div class="load-more-tip">
          <template v-if="isLoadingMore">加载中...</template>
          <template v-else-if="!hasMore">已加载全部</template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/position-grid' as *;

.position-item {
  border-bottom: 1px solid var(--border-color);

  &:last-child {
    border-bottom: none;
  }
}

.position-summary {
  display: grid;
  grid-template-columns: $position-summary-columns;
  gap: var(--space-2);
  padding: var(--space-2);
  cursor: pointer;
  align-items: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--bg-hover);
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
  text-align: right;
  font-family: monospace;
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
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  transition: transform 0.2s;

  &.expanded {
    transform: rotate(180deg);
  }
}

.profit-positive {
  color: var(--color-profit);
}

.profit-negative {
  color: var(--color-loss);
}

.trade-records {
  padding: var(--space-2);
  background-color: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
}

.loading,
.empty-records {
  padding: var(--space-4);
  text-align: center;
  color: var(--text-secondary);
}

/* 交易记录容器：不再单独滚动，随持仓列表统一滚动，避免出现双层滚动条 */
.records-container {
  min-width: 0;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* 加载更多提示样式（FR-016） */
.load-more-tip {
  padding: var(--space-2);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}

.record-header {
  display: grid;
  grid-template-columns: $position-record-columns;
  gap: var(--space-2);
  padding: var(--space-2);
  font-size: var(--font-size-xs);
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
