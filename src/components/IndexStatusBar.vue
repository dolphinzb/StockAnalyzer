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
          <svg v-if="shIndex.direction === 'up'" class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-8 8h5v8h6v-8h5z"/>
          </svg>
          <svg v-if="shIndex.direction === 'down'" class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20l8-8h-5v-8h-6v8h-5z"/>
          </svg>
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

    <!-- 深成指数（右侧） -->
    <div class="index-item right">
      <template v-if="szIndex">
        <span class="index-name">{{ szIndex.name }}</span>
        <span class="index-price" :class="getPriceClass(szIndex.direction)">
          {{ formatPrice(szIndex.price) }}
        </span>
        <span class="index-change" :class="getPriceClass(szIndex.direction)">
          <svg v-if="szIndex.direction === 'up'" class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4l-8 8h5v8h6v-8h5z"/>
          </svg>
          <svg v-if="szIndex.direction === 'down'" class="arrow" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 20l8-8h-5v-8h-6v8h-5z"/>
          </svg>
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

    <!-- 错误提示 -->
    <div v-if="hasError" class="error-indicator">
      <span class="error-text">{{ indexDataState.errorMessage || '数据更新失败' }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
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

// 是否有错误状态
const hasError = computed(() => {
  return props.indexDataState.status === 'error';
});

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
  height: 30px;
  padding: 0 16px;
  background-color: #f5f5f5;
  border-top: 1px solid #e0e0e0;
  font-size: 13px;
  font-family: 'Courier New', monospace;
  position: relative;
}

.index-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.index-item.right {
  justify-content: flex-end;
}

.index-name {
  color: #333;
  font-weight: 500;
}

.index-price {
  font-weight: 600;
  font-size: clamp(12px, 1.2vw, 14px);
}

.index-change {
  font-size: clamp(11px, 1vw, 13px);
}

.index-change-percent {
  font-size: clamp(11px, 1vw, 13px);
}

.arrow {
  width: 12px;
  height: 12px;
  vertical-align: middle;
}

/* 上涨样式 - 红色 */
.price-up {
  color: #e53935;
}

/* 下跌样式 - 绿色 */
.price-down {
  color: #43a047;
}

/* 持平样式 - 黑色 */
.price-flat {
  color: #000000;
}

.placeholder {
  color: #999;
}

.error-indicator {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(255, 152, 0, 0.9);
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 11px;
  z-index: 10;
}

.error-text {
  white-space: nowrap;
}
</style>
