import { ref } from 'vue'

export type ViewId = 'watchlist' | 'position' | 'grid' | 'grid-simulation' | 'historical-trades' | 'fund-management' | 'pattern-scan' | 'securities-directory' | 'market-kline' | 'market-data' | 'settings' | 'log'

const currentViewId = ref<ViewId>('watchlist')

/** K 线查看页当前选中的证券代码（供其他页面带代码跳转） */
const marketKlineStockCode = ref('')

export function useNavigation() {
  const navigate = (viewId: ViewId) => {
    currentViewId.value = viewId
  }

  const navigateToMarketKline = (stockCode: string) => {
    marketKlineStockCode.value = stockCode
    navigate('market-kline')
  }

  return {
    currentViewId,
    navigate,
    marketKlineStockCode,
    navigateToMarketKline
  }
}
