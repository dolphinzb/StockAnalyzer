<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import IndexStatusBar from './components/IndexStatusBar.vue'
import SideNav from './components/SideNav.vue'
import TitleBar from './components/TitleBar.vue'
import ToastNotification from './components/ToastNotification.vue'
import { useNavigation, type ViewId } from './composables/useNavigation'
import { useWatchlistStore } from './stores/watchlist'
import GridView from './views/GridView.vue'
import GridSimulationView from './views/GridSimulationView.vue'
import HistoricalTradesView from './views/HistoricalTradesView.vue'
import LogPage from './views/LogPage.vue'
import PositionView from './views/PositionView.vue'
import SettingsView from './views/SettingsView.vue'
import WatchlistView from './views/WatchlistView.vue'
import FundManagementView from './views/FundManagementView.vue'
import PatternScanView from './views/PatternScanView.vue'
import MarketDataView from './views/MarketDataView.vue'

const { currentViewId, navigate } = useNavigation()
const watchlistStore = useWatchlistStore()

const viewComponents = {
  watchlist: WatchlistView,
  position: PositionView,
  grid: GridView,
  'grid-simulation': GridSimulationView,
  'historical-trades': HistoricalTradesView,
  'fund-management': FundManagementView,
  'pattern-scan': PatternScanView,
  'market-data': MarketDataView,
  settings: SettingsView,
  log: LogPage
}

const currentComponent = computed(() => {
  return viewComponents[currentViewId.value]
})

const handleNavigate = (viewId: ViewId) => {
  navigate(viewId)
}

let cleanupWatchlist: (() => void) | null = null;

onMounted(() => {
  cleanupWatchlist = watchlistStore.setupEventListeners();
  void watchlistStore.refreshPrices();
});

onUnmounted(() => {
  if (cleanupWatchlist) {
    cleanupWatchlist();
  }
});
</script>

<template>
  <div class="app">
    <TitleBar />
    <div class="app-body">
      <SideNav :current-view-id="currentViewId" @navigate="handleNavigate" />
      <div class="content-area">
        <main class="main-content">
          <component :is="currentComponent" />
        </main>
        <!-- 指数状态栏：主内容区底部常驻，左边缘与主内容区对齐 -->
        <IndexStatusBar :index-data-state="watchlistStore.indexDataState" />
      </div>
    </div>
    <ToastNotification />
  </div>
</template>

<style scoped lang="scss">
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.content-area {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background-color: var(--bg-primary);
}
</style>
