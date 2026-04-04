<script setup lang="ts">
import { computed } from 'vue'
import SideNav from './components/SideNav.vue'
import TitleBar from './components/TitleBar.vue'
import { useNavigation, type ViewId } from './composables/useNavigation'
import GridView from './views/GridView.vue'
import PositionView from './views/PositionView.vue'
import SettingsView from './views/SettingsView.vue'
import WatchlistView from './views/WatchlistView.vue'

const { currentViewId, navigate } = useNavigation()

const viewComponents = {
  watchlist: WatchlistView,
  position: PositionView,
  grid: GridView,
  settings: SettingsView
}

const currentComponent = computed(() => {
  return viewComponents[currentViewId.value]
})

const handleNavigate = (viewId: ViewId) => {
  navigate(viewId)
}
</script>

<template>
  <div class="app">
    <TitleBar />
    <div class="app-body">
      <SideNav :current-view-id="currentViewId" @navigate="handleNavigate" />
      <main class="main-content">
        <component :is="currentComponent" />
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
}

.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow: auto;
  background-color: var(--bg-color);
}
</style>
