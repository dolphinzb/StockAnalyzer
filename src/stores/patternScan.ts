import { detectPatterns } from '@shared/patterns';
import type { KlineData, PatternDirection, PatternHit } from '@shared/types';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { WatchlistStock } from '../types';

/**
 * 复权类型枚举（与 KlineData.adjustType 对齐）
 * - 'none': 不复权
 * - 'qfq': 前复权
 */
export type PatternScanAdjustType = '' | 'qfq';

/**
 * 日期窗口（YYYY-MM-DD 格式字符串）
 * - start: 起始日期（含）
 * - end: 结束日期（含）
 */
export interface DateWindow {
  start: string;
  end: string;
}

/**
 * 形态检测结果筛选条件
 * - direction: 方向筛选（'all' 表示不过滤）
 * - patternCodes: 形态编码白名单（空数组表示不过滤）
 */
export interface PatternScanFilters {
  direction: PatternDirection | 'all';
  patternCodes: string[];
}

/**
 * 形态检测 Pinia store
 *
 * 设计目标：
 * - 状态统一收口于本 store，PatternScanView 仅消费，不持有检测逻辑。
 * - selectStock / setAdjustType / setDateWindow 修改输入后自动触发拉取并检测。
 * - "检测" 按钮复用 runDetection() 手动触发同条件下重算。
 * - filteredHits 派生自 allHits + filters，列表展示无重复数据源。
 *
 * 数据通路（与既有 K 线一致，不新增 IPC）：
 *   window.klineAPI.getChartData(stockCode, adjustType)
 *     → shared/patterns/detectPatterns(klines)
 *     → allHits (过滤前全集)
 *     → filteredHits (computed)
 */
export const usePatternScanStore = defineStore('patternScan', () => {
  // ----------------- State -----------------

  /** 当前选中股票（null 表示未选） */
  const currentStock = ref<WatchlistStock | null>(null);

  /** 复权类型 */
  const adjustType = ref<PatternScanAdjustType>('qfq');

  /** 当前股票当前复权下加载的 K 线（按 tradeDate 升序） */
  const klines = ref<KlineData[]>([]);

  /** 全量形态命中（无任何筛选） */
  const allHits = ref<PatternHit[]>([]);

  /** 检测状态（用于 UI 状态分支） */
  const isDetecting = ref(false);

  /** 最近一次错误（用于 UI 错误提示；null 表示无错误） */
  const errorMessage = ref<string | null>(null);

  /** 筛选条件 */
  const filters = ref<PatternScanFilters>({
    direction: 'all',
    patternCodes: [],
  });

  /** 日期窗口（默认全量；空字符串表示不限定） */
  const dateWindow = ref<DateWindow>({ start: '', end: '' });

  /** 当前聚焦的形态命中（列表行点击 → 图表滚动定位用） */
  const focusedHit = ref<PatternHit | null>(null);

  // ----------------- Computed -----------------

  /**
   * 根据 filters + dateWindow 过滤后的命中列表
   * - 方向过滤 + 形态白名单 + 日期窗口
   * - 日期窗口通过 hit.endIndex → klines[endIndex].tradeDate 匹配（YYYYMMDD 字符串字典序比较即可）
   * - 默认按 strength 降序（同 allHits 顺序，无需再排）
   * - 空字符串表示该端不限定
   */
  const filteredHits = computed<PatternHit[]>(() => {
    const dir = filters.value.direction;
    const codes = filters.value.patternCodes;
    const start = dateWindow.value.start;
    const end = dateWindow.value.end;
    return allHits.value.filter(hit => {
      if (dir !== 'all' && hit.direction !== dir) return false;
      if (codes.length > 0 && !codes.includes(hit.code)) return false;
      // 日期窗口过滤（仅在 K 线已加载时生效；空端跳过该端比较）
      if ((start || end) && hit.endIndex >= 0 && hit.endIndex < klines.value.length) {
        const tradeDate = klines.value[hit.endIndex]?.tradeDate ?? '';
        if (start && tradeDate < start) return false;
        if (end && tradeDate > end) return false;
      }
      return true;
    });
  });

  /**
   * 当前 K 线数据是否足够（detectPatterns 要求 >= 20 根）
   * 与 shared/patterns/index.ts 入口的 < 20 直接返回 [] 行为保持一致
   */
  const hasEnoughKlines = computed(() => klines.value.length >= 20);

  /**
   * 是否处于"未发现形态信号"空态（数据足够 + allHits 为空 + 无错误）
   */
  const isEmptyState = computed(() => hasEnoughKlines.value && allHits.value.length === 0 && !errorMessage.value);

  /**
   * 是否处于"数据不足"空态
   */
  const isInsufficientState = computed(() => klines.value.length > 0 && !hasEnoughKlines.value);

  // ----------------- Actions -----------------

  /**
   * 选择股票：写入 currentStock，拉取该股 K 线并自动触发检测
   * @param stock 自选股对象（null 表示清空选择）
   */
  async function selectStock(stock: WatchlistStock | null): Promise<void> {
    currentStock.value = stock;
    focusedHit.value = null;
    if (!stock) {
      // 清空选择：重置 K 线与命中，但保留筛选条件
      klines.value = [];
      allHits.value = [];
      errorMessage.value = null;
      return;
    }
    await loadAndDetect(stock.stockCode, adjustType.value);
  }

  /**
   * 设置复权类型并重新拉取 + 检测
   * @param t '' 不复权 / 'qfq' 前复权
   */
  async function setAdjustType(t: PatternScanAdjustType): Promise<void> {
    if (adjustType.value === t) return;
    adjustType.value = t;
    focusedHit.value = null;
    if (currentStock.value) {
      await loadAndDetect(currentStock.value.stockCode, t);
    }
  }

  /**
   * 设置日期窗口（仅影响 filteredHits，不重新拉数据）
   * - 空字符串表示不限定该端
   * @param win 起始/结束日期
   */
  function setDateWindow(win: DateWindow): void {
    dateWindow.value = { ...win };
  }

  /**
   * 设置方向筛选
   * @param d 'all' / 'bullish' / 'bearish' / 'warning'
   */
  function setDirectionFilter(d: PatternDirection | 'all'): void {
    filters.value.direction = d;
  }

  /**
   * 设置形态白名单（形态 code 数组）
   * - 空数组表示不过滤
   * @param codes 形态 code 列表
   */
  function setPatternFilter(codes: string[]): void {
    filters.value.patternCodes = [...codes];
  }

  /**
   * 重置全部筛选条件为默认（不影响股票选择与复权）
   */
  function resetFilters(): void {
    filters.value = { direction: 'all', patternCodes: [] };
    dateWindow.value = { start: '', end: '' };
  }

  /**
   * 触发检测：使用当前 klines 重新跑 detectPatterns 并写入 allHits
   * - K 线 < 20 → 设置空态（allHits 置空，errorMessage 置 null）
   * - 异常 → 设置 errorMessage（保留 klines 以便 UI 仍可显示）
   */
  function runDetection(): void {
    errorMessage.value = null;
    if (klines.value.length < 20) {
      allHits.value = [];
      return;
    }
    isDetecting.value = true;
    try {
      allHits.value = detectPatterns(klines.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : '形态检测失败';
      errorMessage.value = message;
      // 检测异常时不清空 allHits，保留上一次成功结果便于用户对照
      console.error('[patternScan] detectPatterns failed:', err);
    } finally {
      isDetecting.value = false;
    }
  }

  /**
   * 聚焦某个命中（由列表行点击触发）
   * - 写入 focusedHit，PatternScanView 监听后驱动 K 线图滚动定位
   * - 同一命中重复点击不重复触发副作用，组件侧可据此判断
   * @param hit 命中的形态（null 表示清除聚焦）
   */
  function focusHit(hit: PatternHit | null): void {
    focusedHit.value = hit;
  }

  /**
   * 重新拉取当前股票 K 线并检测（保留股票选择与筛选条件）
   * - 供 K 线更新事件（kline:updated）及手动刷新复用
   */
  async function reload(): Promise<void> {
    const stock = currentStock.value;
    if (!stock) return;
    await loadAndDetect(stock.stockCode, adjustType.value);
  }

  // ----------------- K 线更新事件订阅 -----------------

  /** kline:updated 事件取消订阅函数（订阅后置位，避免重复订阅/泄漏） */
  let klineUpdateUnsub: (() => void) | null = null;

  /**
   * 订阅 K 线更新事件：当更新的是当前选中股票时，自动重新拉取并检测。
   * 解决"更新 K 线后形态检测仍使用首次加载老数据"的问题。
   * 由 PatternScanView 在挂载时调用，卸载时调用 disposeKlineUpdateListener。
   */
  function setupKlineUpdateListener(): void {
    if (klineUpdateUnsub) return; // 防止重复订阅
    klineUpdateUnsub = window.klineAPI.onKlineUpdated(payload => {
      const stock = currentStock.value;
      if (!stock) return;
      if (payload.stockCode === stock.stockCode) {
        void reload();
      }
    });
  }

  /**
   * 取消 K 线更新事件订阅（组件卸载时调用，避免内存泄漏）
   */
  function disposeKlineUpdateListener(): void {
    if (klineUpdateUnsub) {
      klineUpdateUnsub();
      klineUpdateUnsub = null;
    }
  }

  // ----------------- Internal -----------------

  /**
   * 拉取指定股票 K 线并立即执行检测
   * - 拉取失败：设置 errorMessage，不清空已有数据（避免破坏用户先前选择）
   * - 拉取成功：覆盖 klines，触发 runDetection
   * @param stockCode 股票代码
   * @param adj 复权类型
   */
  async function loadAndDetect(stockCode: string, adj: PatternScanAdjustType): Promise<void> {
    isDetecting.value = true;
    errorMessage.value = null;
    try {
      const data = await window.klineAPI.getChartData(stockCode, adj);
      klines.value = data ?? [];
      runDetection();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'K 线数据拉取失败';
      errorMessage.value = message;
      console.error('[patternScan] loadAndDetect failed:', err);
    } finally {
      isDetecting.value = false;
    }
  }

  return {
    // state
    currentStock,
    adjustType,
    klines,
    allHits,
    isDetecting,
    errorMessage,
    filters,
    dateWindow,
    focusedHit,
    // computed
    filteredHits,
    hasEnoughKlines,
    isEmptyState,
    isInsufficientState,
    // actions
    selectStock,
    setAdjustType,
    setDateWindow,
    setDirectionFilter,
    setPatternFilter,
    resetFilters,
    runDetection,
    focusHit,
    reload,
    setupKlineUpdateListener,
    disposeKlineUpdateListener,
  };
});
