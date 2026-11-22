<script setup lang="ts">
import { computed } from 'vue';
import { ICON_PATHS, type IconName } from './icons';

/**
 * 通用功能图标组件（零依赖，手写路径）
 *
 * 规格：viewBox 0 0 24 24、stroke currentColor、stroke-width 2、圆角端点
 * 尺寸：只允许 16 / 20
 * 颜色：继承父级 color，不在组件内定义
 * 无障碍：装饰性图标，默认 aria-hidden；需要语义时由调用方在按钮上提供 aria-label
 */
const props = withDefaults(
  defineProps<{
    name: IconName;
    size?: 16 | 20;
  }>(),
  {
    size: 16,
  }
);

const paths = computed(() => ICON_PATHS[props.name] ?? []);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="app-icon"
  >
    <path v-for="(d, index) in paths" :key="index" :d="d" />
  </svg>
</template>

<style scoped>
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
