/**
 * K线图 Canvas 渲染 composable
 *
 * 功能：
 * - 蜡烛图绘制（开高低收）
 * - 成交量柱状图绘制
 * - 坐标轴绘制（价格轴、日期轴）
 * - 交易标注绘制（B/S/D）
 * - 蜡烛图形态标注绘制（看涨/看跌/转折）
 * - 鼠标拖动查看不同日期范围
 * - 鼠标滚轮缩放查看不同时间段
 * - 交易标注 + 形态标注悬停检测与 tooltip
 * - requestAnimationFrame 节流重绘
 */

import { onUnmounted, ref, type Ref } from 'vue';
import type { KlineData, PatternDirection, PatternHit, TradeRecord } from '../../shared/types';

/** 绘制配置常量 */
const CHART_CONFIG = {
  /** 蜡烛图区域高度占比 */
  CANDLE_AREA_RATIO: 0.7,
  /** 成交量区域高度占比 */
  VOLUME_AREA_RATIO: 0.2,
  /** 日期轴区域高度占比 */
  DATE_AREA_RATIO: 0.1,
  /** 价格轴宽度（像素） */
  PRICE_AXIS_WIDTH: 70,
  /** 日期轴高度（像素） */
  DATE_AXIS_HEIGHT: 30,
  /** 蜡烛宽度（像素） */
  CANDLE_WIDTH: 7,
  /** 蜡烛间距（像素） */
  CANDLE_GAP: 3,
  /** 蜡烛总宽度（宽度+间距） */
  get CANDLE_STEP(): number { return this.CANDLE_WIDTH + this.CANDLE_GAP; },
  /** 上下内边距（像素） */
  PADDING_TOP: 20,
  PADDING_BOTTOM: 10,
  /** 交易标注字体大小 */
  MARKER_FONT_SIZE: 11,
  /** 买入标注颜色 */
  COLOR_BUY: '#22c55e',
  /** 卖出标注颜色 */
  COLOR_SELL: '#ef4444',
  /** 分红标注颜色 */
  COLOR_DIVIDEND: '#3b82f6',
  /** 涨（收盘>开盘）颜色 */
  COLOR_UP: '#e53935',
  /** 跌（收盘<开盘）颜色 */
  COLOR_DOWN: '#43a047',
  /** 平（收盘=开盘）颜色 */
  COLOR_FLAT: '#9e9e9e',
  /** 坐标轴和网格线颜色 */
  COLOR_AXIS: '#e0e0e0',
  /** 坐标轴文字颜色 */
  COLOR_AXIS_TEXT: '#666666',
  /** 成交量柱颜色（涨） */
  COLOR_VOLUME_UP: 'rgba(229, 57, 53, 0.5)',
  /** 成交量柱颜色（跌） */
  COLOR_VOLUME_DOWN: 'rgba(67, 160, 71, 0.5)',
  /** tooltip 背景颜色 */
  COLOR_TOOLTIP_BG: 'rgba(0, 0, 0, 0.8)',
  /** tooltip 文字颜色 */
  COLOR_TOOLTIP_TEXT: '#ffffff',
  /** 形态标注 - 看涨（绿色，置于蜡烛下方，远离 B 标注） */
  COLOR_PATTERN_BULLISH: '#10b981',
  /** 形态标注 - 看跌（红色，置于蜡烛上方，远离 S/D 标注） */
  COLOR_PATTERN_BEARISH: '#f43f5e',
  /** 形态标注 - 转折预警（琥珀色，置于蜡烛上方更高位置） */
  COLOR_PATTERN_WARNING: '#f59e0b',
  /** 拖动灵敏度（鼠标移动1px对应的数据偏移量） */
  DRAG_SENSITIVITY: 1,
};

/** tooltip 信息 */
export interface TooltipInfo {
  /** 是否可见 */
  visible: boolean;
  /** X 坐标 */
  x: number;
  /** Y 坐标 */
  y: number;
  /** 交易类型 */
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND' | '';
  /** 交易价格 */
  tradePrice: number;
  /** 交易数量 */
  tradeCount: number;
  /** 持仓数量 */
  holdingCount: number;
  /** 形态编码（命中形态标注时填充） */
  patternCode?: string;
  /** 形态中文名 */
  patternName?: string;
  /** 形态方向 */
  patternDirection?: PatternDirection;
  /** 形态信号强度 0~1 */
  patternStrength?: number;
  /**
   * 弹出方向：'top' 表示显示在标注上方，'bottom' 表示显示在标注下方。
   * 依据标注在画布中的纵向位置自动选择，避免 tooltip 被容器上/下边缘裁剪。
   */
  placement?: 'top' | 'bottom';
}

/**
 * K线图 Canvas 渲染 composable
 * @param canvasRef Canvas 元素引用
 * @returns 渲染控制方法和状态
 */
export function useKlineChart(canvasRef: Ref<HTMLCanvasElement | null>) {
  /** 当前偏移量（向左偏移的蜡烛数量，0表示最新数据在右侧） */
  const offsetX = ref(0);
  /** 缩放级别（1.0为默认，0.3-5.0范围） */
  const zoomLevel = ref(1.0);
  /** tooltip 信息 */
  const tooltipInfo = ref<TooltipInfo>({
    visible: false,
    x: 0,
    y: 0,
    tradeType: '',
    tradePrice: 0,
    tradeCount: 0,
    holdingCount: 0,
  });

  /** 当前K线数据 */
  let klineData: KlineData[] = [];
  /** 当前交易记录 */
  let tradeRecords: TradeRecord[] = [];
  /** 当前形态命中（来自 setPatternMarkers，独立于交易标注） */
  let patternHits: PatternHit[] = [];
  /** 拖动状态 */
  let isDragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  /** requestAnimationFrame ID */
  let rafId: number | null = null;
  /** 交易标注区域缓存（用于 tooltip 检测） */
  let markerAreas: { x: number; y: number; radius: number; record: TradeRecord }[] = [];
  /** 形态标注区域缓存（用于 tooltip 检测，独立于交易标注） */
  let patternMarkerAreas: { x: number; y: number; radius: number; hit: PatternHit }[] = [];

  /**
   * 设置数据并触发重绘
   * @param klines K线数据
   * @param trades 交易记录
   */
  function setData(klines: KlineData[], trades: TradeRecord[]): void {
    klineData = klines;
    tradeRecords = trades;
    // 默认显示最新数据（offsetX=0 表示最新数据在右侧）
    offsetX.value = 0;
    // 重置缩放级别为默认值
    zoomLevel.value = 1.0;
    markerAreas = [];
    patternMarkerAreas = [];
    requestRedraw();
  }

  /**
   * 设置形态标注并触发重绘
   * - 与交易标注互不冲突：交易标注用 B/S/D 字母，形态标注用图形（▲/▼/◆）
   * - 位于不同的纵向位置避免视觉重叠
   * - @param hits 形态命中数组（PatternHit.code / startIndex / endIndex / direction / strength）
   */
  function setPatternMarkers(hits: PatternHit[]): void {
    patternHits = hits;
    patternMarkerAreas = [];
    requestRedraw();
  }

  /**
   * 清除形态标注
   */
  function clearPatternMarkers(): void {
    patternHits = [];
    patternMarkerAreas = [];
    requestRedraw();
  }

  /**
   * 请求重绘（使用 requestAnimationFrame 节流）
   */
  function requestRedraw(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      drawChart();
      rafId = null;
    });
  }

  /**
   * 主绘制函数
   * 按顺序绘制：背景 → 坐标轴网格 → 蜡烛图 → 成交量 → 交易标注 → 坐标轴文字
   */
  function drawChart(): void {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 获取设备像素比，确保高清屏显示清晰
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // 清除画布
    ctx.clearRect(0, 0, width, height);

    // 无数据时显示提示
    if (klineData.length === 0) return;

    // 计算各区域尺寸
    const chartWidth = width - CHART_CONFIG.PRICE_AXIS_WIDTH;
    const candleAreaHeight = height * CHART_CONFIG.CANDLE_AREA_RATIO - CHART_CONFIG.PADDING_TOP;
    const volumeAreaTop = candleAreaHeight + CHART_CONFIG.PADDING_TOP;
    const volumeAreaHeight = height * CHART_CONFIG.VOLUME_AREA_RATIO;
    const dateAxisTop = height - CHART_CONFIG.DATE_AXIS_HEIGHT;

    // 计算可见范围内的K线数据（根据缩放级别动态调整）
    const baseVisibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP);
    // 根据缩放级别计算实际可见数量：zoomLevel越大，可见数量越少（放大）
    const actualVisibleCount = Math.max(5, Math.floor(baseVisibleCount / zoomLevel.value));
    const maxOffset = Math.max(0, klineData.length - actualVisibleCount);
    const currentOffset = Math.min(Math.max(0, offsetX.value), maxOffset);

    // 获取可见范围内的数据（从右向左展示，最新数据在右侧）
    const startIdx = klineData.length - actualVisibleCount - currentOffset;
    const endIdx = startIdx + actualVisibleCount;
    const visibleKlines = klineData.slice(Math.max(0, startIdx), endIdx);

    if (visibleKlines.length === 0) return;

    // 计算动态蜡烛步长（根据实际可见数量均分画布宽度）
    const dynamicCandleStep = chartWidth / actualVisibleCount;

    // 计算价格范围
    const priceMin = Math.min(...visibleKlines.map(k => k.low ?? 0));
    const priceMax = Math.max(...visibleKlines.map(k => k.high ?? 0));
    const priceRange = priceMax - priceMin || 1;
    const pricePadding = priceRange * 0.05; // 上下留5%空白
    const adjustedPriceMin = priceMin - pricePadding;
    const adjustedPriceMax = priceMax + pricePadding;
    const adjustedPriceRange = adjustedPriceMax - adjustedPriceMin;

    // 计算成交量范围
    const volumeMax = Math.max(...visibleKlines.map(k => k.volume ?? 0)) || 1;

    // 绘制坐标轴网格线
    drawGrid(ctx, chartWidth, candleAreaHeight, volumeAreaTop, dateAxisTop);

    // 绘制蜡烛图（使用动态步长）
    drawCandles(ctx, visibleKlines, candleAreaHeight, adjustedPriceMin, adjustedPriceRange, dynamicCandleStep);

    // 绘制成交量柱状图（使用动态步长）
    drawVolume(ctx, visibleKlines, volumeAreaTop, volumeAreaHeight, volumeMax, dynamicCandleStep);

    // 绘制交易标注（使用动态步长）
    drawTradeMarkers(ctx, visibleKlines, candleAreaHeight, adjustedPriceMin, adjustedPriceRange, dynamicCandleStep);

    // 绘制形态标注（独立图层，使用与交易标注不同的图形与纵向偏移，避免视觉冲突）
    drawPatternMarkers(ctx, visibleKlines, Math.max(0, startIdx), candleAreaHeight, adjustedPriceMin, adjustedPriceRange, dynamicCandleStep);

    // 绘制坐标轴文字（使用动态步长）
    drawAxisLabels(ctx, visibleKlines, chartWidth, height, candleAreaHeight, adjustedPriceMax, adjustedPriceRange, volumeAreaTop, volumeMax, dateAxisTop, dynamicCandleStep);
  }

  /**
   * 绘制坐标轴网格线
   */
  function drawGrid(
    ctx: CanvasRenderingContext2D,
    chartWidth: number,
    candleAreaHeight: number,
    volumeAreaTop: number,
    dateAxisTop: number
  ): void {
    ctx.strokeStyle = CHART_CONFIG.COLOR_AXIS;
    ctx.lineWidth = 0.5;

    // 价格区域水平网格线（5条）
    for (let i = 0; i <= 4; i++) {
      const y = CHART_CONFIG.PADDING_TOP + (candleAreaHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
    }

    // 成交量区域顶部分隔线
    ctx.beginPath();
    ctx.moveTo(0, volumeAreaTop);
    ctx.lineTo(chartWidth, volumeAreaTop);
    ctx.stroke();

    // 日期轴顶部分隔线
    ctx.beginPath();
    ctx.moveTo(0, dateAxisTop);
    ctx.lineTo(chartWidth, dateAxisTop);
    ctx.stroke();
  }

  /**
   * 绘制蜡烛图
   * @param dynamicCandleStep 动态蜡烛步长（根据缩放级别计算）
   */
  function drawCandles(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    candleAreaHeight: number,
    priceMin: number,
    priceRange: number,
    dynamicCandleStep: number
  ): void {
    // 根据动态步长计算蜡烛宽度（保持7:3比例）
    const dynamicCandleWidth = dynamicCandleStep * 0.7;

    for (let i = 0; i < visibleKlines.length; i++) {
      const kline = visibleKlines[i];
      const x = i * dynamicCandleStep + dynamicCandleStep / 2;
      const open = kline.open ?? 0;
      const close = kline.close ?? 0;
      const high = kline.high ?? 0;
      const low = kline.low ?? 0;

      // 判断涨跌
      const isUp = close >= open;
      const color = isUp ? CHART_CONFIG.COLOR_UP : CHART_CONFIG.COLOR_DOWN;

      // 计算Y坐标（价格越高Y越小）
      const openY = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - open) / priceRange) * candleAreaHeight;
      const closeY = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - close) / priceRange) * candleAreaHeight;
      const highY = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - high) / priceRange) * candleAreaHeight;
      const lowY = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - low) / priceRange) * candleAreaHeight;

      // 绘制上下影线
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // 绘制蜡烛实体
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(closeY - openY), 1); // 最小1像素
      ctx.fillStyle = isUp ? color : color;
      ctx.strokeStyle = color;

      if (isUp) {
        // 涨：空心或实心（A股习惯实心红）
        ctx.fillRect(x - dynamicCandleWidth / 2, bodyTop, dynamicCandleWidth, bodyHeight);
      } else {
        // 跌：实心绿
        ctx.fillRect(x - dynamicCandleWidth / 2, bodyTop, dynamicCandleWidth, bodyHeight);
      }
    }
  }

  /**
   * 辅助函数：计算价格Y坐标的基准值
   */
  function adjustedMax(priceMin: number, _priceRange: number): number {
    // 返回价格最大值（用于 Y 坐标计算：priceMax - price 得到偏移量）
    return priceMin + _priceRange;
  }

  /**
   * 绘制成交量柱状图
   * @param dynamicCandleStep 动态蜡烛步长（根据缩放级别计算）
   */
  function drawVolume(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    volumeAreaTop: number,
    volumeAreaHeight: number,
    volumeMax: number,
    dynamicCandleStep: number
  ): void {
    // 根据动态步长计算蜡烛宽度（保持7:3比例）
    const dynamicCandleWidth = dynamicCandleStep * 0.7;

    for (let i = 0; i < visibleKlines.length; i++) {
      const kline = visibleKlines[i];
      const x = i * dynamicCandleStep + dynamicCandleStep / 2;
      const volume = kline.volume ?? 0;
      const isUp = (kline.close ?? 0) >= (kline.open ?? 0);

      // 计算成交量柱高度
      const barHeight = (volume / volumeMax) * (volumeAreaHeight - 10);
      const barY = volumeAreaTop + volumeAreaHeight - barHeight - 5;

      ctx.fillStyle = isUp ? CHART_CONFIG.COLOR_VOLUME_UP : CHART_CONFIG.COLOR_VOLUME_DOWN;
      ctx.fillRect(x - dynamicCandleWidth / 2, barY, dynamicCandleWidth, barHeight);
    }
  }

  /**
   * 绘制交易标注（B/S/D）
   * 在K线蜡烛图对应日期位置叠加绘制交易点标记
   * @param dynamicCandleStep 动态蜡烛步长（根据缩放级别计算）
   */
  function drawTradeMarkers(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    candleAreaHeight: number,
    priceMin: number,
    priceRange: number,
    dynamicCandleStep: number
  ): void {
    markerAreas = []; // 重置标注区域缓存

    for (const record of tradeRecords) {
      // 查找交易日期对应的K线索引
      const klineIndex = visibleKlines.findIndex(k => k.tradeDate === record.tradeDate);
      if (klineIndex === -1) continue; // 交易日期不在可见K线范围内

      const kline = visibleKlines[klineIndex];
      const x = klineIndex * dynamicCandleStep + dynamicCandleStep / 2;
      const high = kline.high ?? 0;
      const low = kline.low ?? 0;

      // 根据交易类型确定标注位置和颜色
      let y: number;
      let color: string;
      let label: string;

      switch (record.tradeType) {
        case 'BUY':
          // 买入标注在K线下方
          y = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - low) / priceRange) * candleAreaHeight + 15;
          color = CHART_CONFIG.COLOR_BUY;
          label = 'B';
          break;
        case 'SELL':
          // 卖出标注在K线上方
          y = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - high) / priceRange) * candleAreaHeight - 15;
          color = CHART_CONFIG.COLOR_SELL;
          label = 'S';
          break;
        case 'DIVIDEND':
          // 分红标注在K线上方
          y = CHART_CONFIG.PADDING_TOP + ((adjustedMax(priceMin, priceRange) - high) / priceRange) * candleAreaHeight - 30;
          color = CHART_CONFIG.COLOR_DIVIDEND;
          label = 'D';
          break;
        default:
          continue;
      }

      // 绘制标注字母（B/S/D）
      ctx.font = `bold ${CHART_CONFIG.MARKER_FONT_SIZE + 2}px Arial`;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);

      // 缓存标注区域（用于 tooltip 检测）
      markerAreas.push({
        x,
        y,
        radius: 10, // 字母检测区域
        record,
      });
    }
  }

  /**
   * 绘制蜡烛图形态标注（独立图层，与交易标注不冲突）
   * - bullish: 绿色 ▲（向上三角），置于蜡烛下方 BUY 标注下方 +30 像素
   * - bearish: 红色 ▼（向下三角），置于蜡烛上方 SELL 标注上方 -45 像素
   * - warning: 琥珀色 ◆（菱形），置于蜡烛上方更高位置 -60 像素
   * - 仅绘制 hit.endIndex 落在当前可见 K 线范围内的命中
   * - 同时填充 patternMarkerAreas 用于悬停 tooltip
   *
   * @param startIdx 可见范围内第一根 K 线在 klineData 中的索引
   */
  function drawPatternMarkers(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    startIdx: number,
    candleAreaHeight: number,
    priceMin: number,
    priceRange: number,
    dynamicCandleStep: number
  ): void {
    patternMarkerAreas = [];

    if (patternHits.length === 0 || visibleKlines.length === 0) return;

    const priceMax = priceMin + priceRange;
    const endIdx = startIdx + visibleKlines.length;

    // 相同 endIndex 可能有多条命中（不同形态），按方向分组绘制避免重叠
    // 这里使用简单的 Y 偏移累加：bullish 累加正方向，bearish/warning 累加负方向
    const offsetByEndIndex = new Map<number, number>();

    for (const hit of patternHits) {
      // 仅绘制当前可见范围内的形态
      if (hit.endIndex < startIdx || hit.endIndex >= endIdx) continue;

      const visibleIdx = hit.endIndex - startIdx;
      const kline = visibleKlines[visibleIdx];
      const x = visibleIdx * dynamicCandleStep + dynamicCandleStep / 2;
      const high = kline.high ?? 0;
      const low = kline.low ?? 0;

      // 计算 baseY 与颜色（基于方向）
      let baseY: number;
      let color: string;
      switch (hit.direction) {
        case 'bullish':
          // 置于蜡烛下方（远离 BUY 的 +15，使用 +30）
          baseY = CHART_CONFIG.PADDING_TOP + ((priceMax - low) / priceRange) * candleAreaHeight + 30;
          color = CHART_CONFIG.COLOR_PATTERN_BULLISH;
          break;
        case 'bearish':
          // 置于蜡烛上方（远离 SELL 的 -15 与 DIVIDEND 的 -30，使用 -45）
          baseY = CHART_CONFIG.PADDING_TOP + ((priceMax - high) / priceRange) * candleAreaHeight - 45;
          color = CHART_CONFIG.COLOR_PATTERN_BEARISH;
          break;
        case 'warning':
        default:
          // 转折预警置于更高位置（-60）
          baseY = CHART_CONFIG.PADDING_TOP + ((priceMax - high) / priceRange) * candleAreaHeight - 60;
          color = CHART_CONFIG.COLOR_PATTERN_WARNING;
          break;
      }

      // 同一 endIndex 多条命中时按方向错开纵向位置
      const stackOffset = offsetByEndIndex.get(hit.endIndex) ?? 0;
      const stackDir = hit.direction === 'bullish' ? 1 : -1;
      const y = baseY + stackDir * stackOffset * 12;
      offsetByEndIndex.set(hit.endIndex, stackOffset + 1);

      // 绘制形态图形
      drawPatternGlyph(ctx, x, y, hit.direction, color);

      // 缓存标注区域（用于悬停 tooltip，半径 10 与交易标注一致）
      patternMarkerAreas.push({
        x,
        y,
        radius: 10,
        hit,
      });
    }
  }

  /**
   * 绘制形态图元（▲ 看涨 / ▼ 看跌 / ◆ 转折）
   * @param x 中心 X 坐标
   * @param y 中心 Y 坐标
   * @param direction 形态方向（决定图元形状）
   * @param color 填充颜色
   */
  function drawPatternGlyph(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: PatternDirection,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    if (direction === 'bullish') {
      // 向上三角 ▲（高 10，底宽 10）
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x - 5, y + 4);
      ctx.lineTo(x + 5, y + 4);
      ctx.closePath();
      ctx.fill();
    } else if (direction === 'bearish') {
      // 向下三角 ▼
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x - 5, y - 4);
      ctx.lineTo(x + 5, y - 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // 菱形 ◆（转折预警）
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * 绘制坐标轴文字（价格轴、日期轴）
   * @param dynamicCandleStep 动态蜡烛步长（根据缩放级别计算）
   */
  function drawAxisLabels(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    chartWidth: number,
    _height: number,
    candleAreaHeight: number,
    priceMax: number,
    priceRange: number,
    volumeAreaTop: number,
    volumeMax: number,
    dateAxisTop: number,
    dynamicCandleStep: number
  ): void {
    ctx.fillStyle = CHART_CONFIG.COLOR_AXIS_TEXT;
    ctx.font = '11px monospace';

    // 价格轴标签（右侧）
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const price = priceMax - (priceRange * i) / 4;
      const y = CHART_CONFIG.PADDING_TOP + (candleAreaHeight * i) / 4;
      ctx.fillText(price.toFixed(2), chartWidth + 5, y + 4);
    }

    // 成交量轴标签
    ctx.fillText(formatVolume(volumeMax), chartWidth + 5, volumeAreaTop + 12);
    ctx.fillText('0', chartWidth + 5, volumeAreaTop + _height * CHART_CONFIG.VOLUME_AREA_RATIO - 5);

    // 日期轴标签（底部，每隔若干条显示一个日期）
    ctx.textAlign = 'center';
    const dateStep = Math.max(1, Math.floor(visibleKlines.length / 8)); // 大约显示8个日期
    for (let i = 0; i < visibleKlines.length; i += dateStep) {
      const x = i * dynamicCandleStep + dynamicCandleStep / 2;
      const dateStr = visibleKlines[i].tradeDate;
      // 格式化为 MM-DD
      const formatted = dateStr.length >= 10 ? dateStr.slice(5, 10) : dateStr;
      ctx.fillText(formatted, x, dateAxisTop + 18);
    }
  }

  /**
   * 格式化成交量显示
   * @param volume 成交量
   * @returns 格式化后的字符串
   */
  function formatVolume(volume: number): string {
    if (volume >= 100000000) {
      return (volume / 100000000).toFixed(1) + '亿';
    }
    if (volume >= 10000) {
      return (volume / 10000).toFixed(1) + '万';
    }
    return volume.toFixed(0);
  }

  /**
   * 滚动到指定 K 线索引（用于形态命中联动）
   * - 将 endIndex 居中显示在可见窗口
   * - 若 endIndex 已可见则不调整（保持用户当前视图）
   * - 通过 offsetX 调整实现，不变更 zoomLevel
   * @param endIndex 目标 K 线索引（klineData 中的下标）
   */
  function scrollToIndex(endIndex: number): void {
    if (klineData.length === 0) return;
    if (endIndex < 0 || endIndex >= klineData.length) return;

    // 计算当前可见窗口
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const chartWidth = rect.width - CHART_CONFIG.PRICE_AXIS_WIDTH;
    const baseVisibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP);
    const actualVisibleCount = Math.max(5, Math.floor(baseVisibleCount / zoomLevel.value));
    const startIdx = klineData.length - actualVisibleCount - offsetX.value;
    const visibleEndIdx = startIdx + actualVisibleCount;

    // 若已可见则不调整
    if (endIndex >= startIdx && endIndex < visibleEndIdx) {
      return;
    }

    // 居中显示：目标 startIdx = endIndex - floor(actualVisibleCount / 2)
    const targetStart = endIndex - Math.floor(actualVisibleCount / 2);
    const maxOffset = Math.max(0, klineData.length - actualVisibleCount);
    const targetOffset = Math.max(0, klineData.length - actualVisibleCount - targetStart);
    offsetX.value = Math.min(targetOffset, maxOffset);
    requestRedraw();
  }

  /**
   * 鼠标按下事件处理（开始拖动）
   */
  function onMouseDown(event: MouseEvent): void {
    isDragging = true;
    dragStartX = event.clientX;
    dragStartOffset = offsetX.value;
    // 改变鼠标样式
    if (canvasRef.value) {
      canvasRef.value.style.cursor = 'grabbing';
    }
  }

  /**
   * 鼠标移动事件处理（拖动 + tooltip 检测）
   */
  function onMouseMove(event: MouseEvent): void {
    if (isDragging) {
      // 拖动模式：更新偏移量
      const deltaX = event.clientX - dragStartX;
      // 向左拖动（查看更早数据）→ offsetX 增大
      // 使用动态步长计算拖动灵敏度
      const canvas = canvasRef.value;
      if (!canvas) return;
      const chartWidth = canvas.getBoundingClientRect().width - CHART_CONFIG.PRICE_AXIS_WIDTH;
      const baseVisibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP);
      const actualVisibleCount = Math.max(5, Math.floor(baseVisibleCount / zoomLevel.value));
      const dynamicCandleStep = chartWidth / actualVisibleCount;

      const deltaOffset = Math.round(deltaX / dynamicCandleStep);
      const newOffset = dragStartOffset + deltaOffset;

      // 计算最大偏移量
      const maxOffset = Math.max(0, klineData.length - actualVisibleCount);

      offsetX.value = Math.min(Math.max(0, newOffset), maxOffset);
      requestRedraw();
    } else {
      // 非拖动模式：检测 tooltip
      checkTooltip(event);
    }
  }

  /**
   * 鼠标松开事件处理（结束拖动）
   */
  function onMouseUp(): void {
    if (isDragging) {
      isDragging = false;
      if (canvasRef.value) {
        canvasRef.value.style.cursor = 'grab';
      }
    }
  }

  /**
   * 检测鼠标是否悬停在交易标注或形态标注上
   * - 优先匹配形态标注（位于更外侧，先遍历避免被内部交易标注遮蔽）
   * - 命中形态时填充 patternCode / patternName / patternDirection / patternStrength
   */
  function checkTooltip(event: MouseEvent): void {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 标注位于画布上半区时 tooltip 向下弹出，否则向上弹出，避免被容器裁剪
    const placementFor = (anchorY: number): 'top' | 'bottom' => (anchorY < rect.height / 2 ? 'bottom' : 'top');

    // 优先检查形态标注（位置更靠外）
    for (const area of patternMarkerAreas) {
      const dx = mouseX - area.x;
      const dy = mouseY - area.y;
      if (dx * dx + dy * dy <= area.radius * area.radius) {
        const hit = area.hit;
        tooltipInfo.value = {
          visible: true,
          x: area.x,
          y: area.y,
          placement: placementFor(area.y),
          tradeType: '',
          tradePrice: 0,
          tradeCount: 0,
          holdingCount: 0,
          patternCode: hit.code,
          patternName: hit.name,
          patternDirection: hit.direction,
          patternStrength: hit.strength,
        };
        return;
      }
    }

    // 再检查交易标注
    for (const area of markerAreas) {
      const dx = mouseX - area.x;
      const dy = mouseY - area.y;
      if (dx * dx + dy * dy <= area.radius * area.radius) {
        tooltipInfo.value = {
          visible: true,
          x: area.x,
          y: area.y,
          placement: placementFor(area.y),
          tradeType: area.record.tradeType,
          tradePrice: area.record.tradePrice,
          tradeCount: area.record.tradeCount,
          holdingCount: area.record.holdingCount,
        };
        return;
      }
    }

    // 都没有命中则隐藏
    tooltipInfo.value = { ...tooltipInfo.value, visible: false };
  }

  /**
   * 鼠标滚轮事件处理（缩放功能）
   * 向上滚动放大（zoomLevel增加），向下滚动缩小（zoomLevel减少）
   * 以鼠标位置为中心进行缩放，保持该位置对应的K线索引不变
   */
  function onWheel(event: WheelEvent): void {
    // 阻止页面滚动
    event.preventDefault();

    const canvas = canvasRef.value;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const chartWidth = rect.width - CHART_CONFIG.PRICE_AXIS_WIDTH;

    // 计算当前的动态步长和可见数量
    const baseVisibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP);
    const oldActualVisibleCount = Math.max(5, Math.floor(baseVisibleCount / zoomLevel.value));
    const oldDynamicCandleStep = chartWidth / oldActualVisibleCount;

    // 计算鼠标位置对应的K线索引（相对于可见区域的起始索引）
    const currentOffset = Math.min(Math.max(0, offsetX.value), Math.max(0, klineData.length - oldActualVisibleCount));
    const startIdx = klineData.length - oldActualVisibleCount - currentOffset;
    const mouseKlineIndex = Math.floor(mouseX / oldDynamicCandleStep) + startIdx;

    // 应用缩放：向上滚动(deltaY < 0)放大，向下滚动(deltaY > 0)缩小
    const scaleFactor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoomLevel = Math.min(5.0, Math.max(0.3, zoomLevel.value * scaleFactor));

    // 如果缩放级别没有变化，直接返回
    if (newZoomLevel === zoomLevel.value) return;

    // 更新缩放级别
    zoomLevel.value = newZoomLevel;

    // 计算新的可见数量和步长
    const newActualVisibleCount = Math.max(5, Math.floor(baseVisibleCount / newZoomLevel));
    const newDynamicCandleStep = chartWidth / newActualVisibleCount;

    // 调整offsetX以保持鼠标位置的K线索引不变
    const newStartIdx = mouseKlineIndex - Math.floor(mouseX / newDynamicCandleStep);
    const newOffset = klineData.length - newActualVisibleCount - newStartIdx;

    // 边界检查：确保offsetX在有效范围内
    const maxOffset = Math.max(0, klineData.length - newActualVisibleCount);
    offsetX.value = Math.min(Math.max(0, newOffset), maxOffset);

    // 触发重绘
    requestRedraw();
  }

  /**
   * 鼠标离开画布事件处理
   */
  function onMouseLeave(): void {
    isDragging = false;
    tooltipInfo.value = { ...tooltipInfo.value, visible: false };
    if (canvasRef.value) {
      canvasRef.value.style.cursor = 'grab';
    }
  }

  /**
   * 释放 Canvas 资源
   */
  function destroy(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    klineData = [];
    tradeRecords = [];
    markerAreas = [];
    // 清理形态标注状态（避免组件卸载后悬空引用）
    patternHits = [];
    patternMarkerAreas = [];
    // 重置缩放级别
    zoomLevel.value = 1.0;
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    destroy();
  });

  return {
    offsetX,
    zoomLevel,
    tooltipInfo,
    setData,
    setPatternMarkers,
    clearPatternMarkers,
    scrollToIndex,
    drawChart,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    onWheel,
    destroy,
  };
}
