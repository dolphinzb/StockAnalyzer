import { ref, onUnmounted, nextTick, type Ref } from 'vue';

/**
 * 无限滚动Composable
 * 使用Intersection Observer API实现无限滚动加载
 */
export function useInfiniteScroll(
  loadMore: () => Promise<void>,
  hasMore: () => boolean,
  isLoading: () => boolean,
  scrollContainerRef?: Ref<HTMLElement | null> // 可选的滚动容器ref
) {
  const sentinelRef = ref<HTMLElement | null>(null);
  let observer: IntersectionObserver | null = null;

  const handleIntersect = async (entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    
    console.log('IntersectionObserver triggered:', {
      isIntersecting: entry.isIntersecting,
      hasMore: hasMore(),
      isLoading: isLoading()
    });
    
    // 当哨兵元素进入视口且还有更多数据且未正在加载时，加载更多
    if (entry.isIntersecting && hasMore() && !isLoading()) {
      console.log('Loading more records...');
      await loadMore();
    }
  };

  const setupObserver = async () => {
    // 等待DOM更新
    await nextTick();
    
    if (!sentinelRef.value) {
      console.warn('sentinelRef is null, cannot setup IntersectionObserver');
      return;
    }

    // 如果已经有observer，先断开
    if (observer) {
      observer.disconnect();
    }

    // 获取滚动容器的实际DOM元素
    const container = scrollContainerRef?.value || null;
    console.log('Setting up IntersectionObserver:', {
      sentinelElement: sentinelRef.value,
      container: container,
      rootMargin: '100px',
      threshold: 0.1
    });

    // 创建Intersection Observer
    observer = new IntersectionObserver(handleIntersect, {
      root: container, // 使用指定的滚动容器或viewport
      rootMargin: '100px', // 提前100px开始加载
      threshold: 0.1, // 10%可见时触发
    });

    observer.observe(sentinelRef.value);
    console.log('IntersectionObserver setup complete');
  };

  onUnmounted(() => {
    if (observer) {
      observer.disconnect();
    }
  });

  return {
    sentinelRef,
    setupObserver,
  };
}
