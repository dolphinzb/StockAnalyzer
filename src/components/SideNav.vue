<script setup lang="ts">
import type { ViewId } from '../composables/useNavigation';

defineProps<{
  currentViewId: ViewId
}>()

const emit = defineEmits<{
  navigate: [viewId: ViewId]
}>()

interface NavItem {
  id: ViewId
  label: string
  iconPath: string
}

const navItems: NavItem[] = [
  {
    id: 'watchlist',
    label: '自选股',
    iconPath: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
  },
  {
    id: 'position',
    label: '持仓',
    iconPath: 'M3 3v18h18M7 16l4-8 4 5 5-9'
  },
  {
    id: 'grid',
    label: '网格',
    iconPath: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'
  },
  {
    id: 'settings',
    label: '设置',
    iconPath: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z'
  },
  {
    id: 'log',
    label: '日志',
    iconPath: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8'
  }
]

const handleClick = (viewId: ViewId) => {
  emit('navigate', viewId)
}
</script>

<template>
  <nav class="side-nav">
    <div class="nav-items">
      <button
        v-for="item in navItems"
        :key="item.id"
        class="nav-item"
        :class="{ active: currentViewId === item.id }"
        @click="handleClick(item.id)"
        :title="item.label"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path :d="item.iconPath" />
        </svg>
      </button>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.side-nav {
  width: 56px;
  height: 100%;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-items {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.nav-item {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s ease;

  &:hover {
    background-color: var(--hover-bg);
    color: var(--text-color);
  }

  &.active {
    background-color: var(--active-bg);
    color: var(--primary-color);
  }
}

.nav-icon {
  width: 22px;
  height: 22px;
}
</style>
