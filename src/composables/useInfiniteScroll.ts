import { ref, onMounted, onUnmounted } from 'vue';

/**
 * 无限滚动Composable
 * 使用Intersection Observer API实现无限滚动加载
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void>,
  hasMore: () => boolean,
  isLoading: () => boolean
) {
  const sentinelRef = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;

  const handleIntersect = async (entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    
    // 当哨兵元素进入视口且还有更多数据且未正在加载时，加载更多
    if (entry.isIntersecting && hasMore() && !isLoading()) {
      await loadMore();
    }
  };

  onMounted(() => {
    if (!sentinelRef.value) return;

    // 创建Intersection Observer
    observer = new IntersectionObserver(handleIntersect, {
      root: null, // 使用viewport作为根
      rootMargin: '100px', // 提前100px开始加载
      threshold: 0.1, // 10%可见时触发
    });

    observer.observe(sentinelRef.value);
  });

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
    }
  });

  return {
    sentinelRef,
  };
}
