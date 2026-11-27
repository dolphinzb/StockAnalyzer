<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ViewId } from '../composables/useNavigation';

defineProps<{
  currentViewId: ViewId
}>()

const emit = defineEmits<{
  navigate: [viewId: ViewId]
}>()

// 版本号来自主进程 app.getVersion()，获取失败时保持为空（不显示，不阻塞导航）
const appVersion = ref('')
const appIsDev = ref(false)

onMounted(async () => {
  try {
    const info = await window.electronAPI?.getAppInfo()
    if (info) {
      appVersion.value = info.version
      appIsDev.value = info.isDev
    }
  } catch {
    // 降级：拿不到版本就不显示
  }
})

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
    id: 'grid-simulation',
    label: '网格仿真',
    iconPath: 'M3 13h4l2-6 4 12 2-6h6'
  },
  {
    id: 'historical-trades',
    label: '历史开仓',
    iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  {
    id: 'fund-management',
    label: '资金管理',
    iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  },
  {
    id: 'pattern-scan',
    label: '形态检测',
    // 蜡烛图形态标记图标：菱形 + 上下三角（看涨 ▲ 看跌 ▼ 转折 ◆）
    iconPath: 'M12 2l3 3-3 3-3-3 3-3zM7 14l-3 3 3 3 3-3-3-3zM17 14l-3 3 3 3 3-3-3-3zM12 10l-4 4h8l-4-4z'
  },
  {
    id: 'securities-directory',
    label: '股票列表',
    // 证券名录/列表图标：带行号的清单
    iconPath: 'M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11'
  },
  {
    id: 'market-data',
    label: '行情库',
    // 数据库/存储图标：三层数据盘
    iconPath: 'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 12c0 1.66 4.03 3 9 3s9-1.34 9-3M3 6v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6'
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

    <div v-if="appVersion" class="app-version" :title="`v${appVersion}${appIsDev ? ' (dev)' : ''}`">
      <span class="version-line">v{{ appVersion }}</span>
      <span v-if="appIsDev" class="version-line">(dev)</span>
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
  padding: var(--space-2) 0;
  gap: var(--space-1);
  // 允许收缩：否则 min-height:auto 会把底部版本块顶出可视区
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.app-version {
  // 侧边栏仅 56px，版本号允许折成两行（v1.0.0 / (dev)），不裁切
  flex-shrink: 0;
  padding: var(--space-1) 2px var(--space-2);
  text-align: center;
  font-size: var(--font-size-xs);
  line-height: 1.2;
  color: var(--text-secondary);
  word-break: break-all;
  user-select: text;
}

.version-line {
  display: block;
}

.nav-item {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: all 0.15s ease;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background-color: var(--bg-active);
    color: var(--color-primary);
  }
}

// 导航图标尺寸与 AppIcon 的 20px 规格对齐
.nav-icon {
  width: 1.25rem;
  height: 1.25rem;
}
</style>
