<template>
  <div class="index-status-bar">
    <!-- 上证指数（左侧） -->
    <div class="index-item left">
      <template v-if="shIndex">
        <span class="index-name">{{ shIndex.name }}</span>
        <span class="index-price" :class="getPriceClass(shIndex.direction)">
          {{ formatPrice(shIndex.price) }}
        </span>
        <span class="index-change" :class="getPriceClass(shIndex.direction)">
          <AppIcon v-if="shIndex.direction === 'up'" name="arrow-up" :size="16" class="arrow" />
          <AppIcon v-if="shIndex.direction === 'down'" name="arrow-up" :size="16" class="arrow is-down" />
          {{ formatChange(shIndex.change) }}
        </span>
        <span class="index-change-percent" :class="getPriceClass(shIndex.direction)">
          ({{ formatChangePercent(shIndex.changePercent) }})
        </span>
      </template>
      <template v-else>
        <span class="placeholder">--</span>
      </template>
    </div>

    <!-- 科创50指数（中间） -->
    <div class="index-item center">
      <template v-if="kc50Index">
        <span class="index-name">{{ kc50Index.name }}</span>
        <span class="index-price" :class="getPriceClass(kc50Index.direction)">
          {{ formatPrice(kc50Index.price) }}
        </span>
        <span class="index-change" :class="getPriceClass(kc50Index.direction)">
          <AppIcon v-if="kc50Index.direction === 'up'" name="arrow-up" :size="16" class="arrow" />
          <AppIcon v-if="kc50Index.direction === 'down'" name="arrow-up" :size="16" class="arrow is-down" />
          {{ formatChange(kc50Index.change) }}
        </span>
        <span class="index-change-percent" :class="getPriceClass(kc50Index.direction)">
          ({{ formatChangePercent(kc50Index.changePercent) }})
        </span>
      </template>
      <template v-else>
        <span class="placeholder">--</span>
      </template>
    </div>

    <!-- 深成指数（右侧） -->
    <div class="index-item right">
      <template v-if="szIndex">
        <span class="index-name">{{ szIndex.name }}</span>
        <span class="index-price" :class="getPriceClass(szIndex.direction)">
          {{ formatPrice(szIndex.price) }}
        </span>
        <span class="index-change" :class="getPriceClass(szIndex.direction)">
          <AppIcon v-if="szIndex.direction === 'up'" name="arrow-up" :size="16" class="arrow" />
          <AppIcon v-if="szIndex.direction === 'down'" name="arrow-up" :size="16" class="arrow is-down" />
          {{ formatChange(szIndex.change) }}
        </span>
        <span class="index-change-percent" :class="getPriceClass(szIndex.direction)">
          ({{ formatChangePercent(szIndex.changePercent) }})
        </span>
      </template>
      <template v-else>
        <span class="placeholder">--</span>
      </template>
    </div>

    <!-- 错误提示（栏内右侧紧凑标签，不遮挡指数项） -->
    <span v-if="hasError" class="error-indicator" :title="errorText">{{ errorText }}</span>
  </div>
</template>

<script setup lang="ts">
import AppIcon from './ui/AppIcon.vue';
import { computed } from 'vue';
import type { IndexData, IndexDataState, IndexDirection } from '../types';

const props = defineProps<{
  indexDataState: IndexDataState;
}>();

// 从指数数据状态中提取上证指数和深成指数
const shIndex = computed<IndexData | null>(() => {
  return props.indexDataState.indices.find(i => i.code === 'sh000001') || null;
});

const szIndex = computed<IndexData | null>(() => {
  return props.indexDataState.indices.find(i => i.code === 'sz399001') || null;
});

const kc50Index = computed<IndexData | null>(() => {
  return props.indexDataState.indices.find(i => i.code === 'sh000688') || null;
});

// 是否有错误状态
const hasError = computed(() => {
  return props.indexDataState.status === 'error';
});

// 错误提示文案
const errorText = computed(() => props.indexDataState.errorMessage || '数据更新失败');

// 根据涨跌方向获取CSS类名
function getPriceClass(direction: IndexDirection): string {
  switch (direction) {
    case 'up':
      return 'price-up';
    case 'down':
      return 'price-down';
    case 'flat':
      return 'price-flat';
    default:
      return '';
  }
}

// 格式化指数价格（保留2位小数）
function formatPrice(price: number): string {
  return price.toFixed(2);
}

// 格式化涨跌值（带正负号，保留2位小数）
function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
}

// 格式化涨跌幅百分比（带正负号，保留2位小数）
function formatChangePercent(percent: number): string {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
}
</script>

<style scoped>
.index-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 2.25rem;
  padding: 0 var(--space-4);
  background-color: var(--title-bar-bg);
  border-top: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
  font-family: 'Courier New', monospace;
}

.index-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}

.index-item.right {
  justify-content: flex-end;
}

.index-item.center {
  justify-content: center;
}

.index-name {
  color: var(--text-primary);
  font-weight: 500;
}

.index-price {
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.index-change {
  font-size: var(--font-size-xs);
}

.index-change-percent {
  font-size: var(--font-size-xs);
}

.arrow {
  display: inline-block;
  vertical-align: middle;
}

/* 下跌方向由同一图标旋转 180 度表达 */
.arrow.is-down {
  transform: rotate(180deg);
}

/* 上涨样式 - 红色 */
.price-up {
  color: var(--color-profit);
}

/* 下跌样式 - 绿色 */
.price-down {
  color: var(--color-loss);
}

/* 持平样式 - 常规正文色 */
.price-flat {
  color: var(--text-primary);
}

.placeholder {
  color: var(--text-secondary);
}

/* 错误提示：栏内右侧紧凑标签 */
.error-indicator {
  flex: 0 0 auto;
  margin-left: var(--space-2);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  background-color: var(--bg-warning-subtle);
  border: 1px solid var(--color-warning);
  color: var(--color-warning);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-tight);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
}
</style>
