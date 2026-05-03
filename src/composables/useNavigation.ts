import { ref } from 'vue'

export type ViewId = 'watchlist' | 'position' | 'grid' | 'historical-trades' | 'fund-management' | 'settings' | 'log'

const currentViewId = ref<ViewId>('watchlist')

export function useNavigation() {
  const navigate = (viewId: ViewId) => {
    currentViewId.value = viewId
  }

  return {
    currentViewId,
    navigate
  }
}
