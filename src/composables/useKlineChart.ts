/**
 * K线图 Canvas 渲染 composable
 *
 * 功能：
 * - 蜡烛图绘制（开高低收）
 * - 成交量柱状图绘制
 * - 坐标轴绘制（价格轴、日期轴）
 * - 交易标注绘制（B/S/D）
 * - 鼠标拖动查看不同日期范围
 * - 交易标注悬停检测与 tooltip
 * - requestAnimationFrame 节流重绘
 */

import { onUnmounted, ref, type Ref } from 'vue';
import type { KlineData, TradeRecord } from '../../shared/types';

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
}

/**
 * K线图 Canvas 渲染 composable
 * @param canvasRef Canvas 元素引用
 * @returns 渲染控制方法和状态
 */
export function useKlineChart(canvasRef: Ref<HTMLCanvasElement | null>) {
  /** 当前偏移量（向左偏移的蜡烛数量，0表示最新数据在右侧） */
  const offsetX = ref(0);
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
  /** 拖动状态 */
  let isDragging = false;
  let dragStartX = 0;
  let dragStartOffset = 0;
  /** requestAnimationFrame ID */
  let rafId: number | null = null;
  /** 标注区域缓存（用于 tooltip 检测） */
  let markerAreas: { x: number; y: number; radius: number; record: TradeRecord }[] = [];

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
    markerAreas = [];
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

    // 计算可见范围内的K线数据
    const visibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP);
    const maxOffset = Math.max(0, klineData.length - visibleCount);
    const currentOffset = Math.min(Math.max(0, offsetX.value), maxOffset);

    // 获取可见范围内的数据（从右向左展示，最新数据在右侧）
    const startIdx = klineData.length - visibleCount - currentOffset;
    const endIdx = startIdx + visibleCount;
    const visibleKlines = klineData.slice(Math.max(0, startIdx), endIdx);

    if (visibleKlines.length === 0) return;

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
    drawGrid(ctx, chartWidth, candleAreaHeight, adjustedPriceMin, adjustedPriceRange, volumeAreaTop, volumeAreaHeight, dateAxisTop);

    // 绘制蜡烛图
    drawCandles(ctx, visibleKlines, chartWidth, candleAreaHeight, adjustedPriceMin, adjustedPriceRange);

    // 绘制成交量柱状图
    drawVolume(ctx, visibleKlines, chartWidth, volumeAreaTop, volumeAreaHeight, volumeMax);

    // 绘制交易标注
    drawTradeMarkers(ctx, visibleKlines, chartWidth, candleAreaHeight, adjustedPriceMin, adjustedPriceRange);

    // 绘制坐标轴文字
    drawAxisLabels(ctx, visibleKlines, chartWidth, width, height, candleAreaHeight, adjustedPriceMin, adjustedPriceMax, adjustedPriceRange, volumeAreaTop, volumeMax, dateAxisTop);
  }

  /**
   * 绘制坐标轴网格线
   */
  function drawGrid(
    ctx: CanvasRenderingContext2D,
    chartWidth: number,
    candleAreaHeight: number,
    priceMin: number,
    priceRange: number,
    volumeAreaTop: number,
    volumeAreaHeight: number,
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
   */
  function drawCandles(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    chartWidth: number,
    candleAreaHeight: number,
    priceMin: number,
    priceRange: number
  ): void {
    for (let i = 0; i < visibleKlines.length; i++) {
      const kline = visibleKlines[i];
      const x = i * CHART_CONFIG.CANDLE_STEP + CHART_CONFIG.CANDLE_STEP / 2;
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
        ctx.fillRect(x - CHART_CONFIG.CANDLE_WIDTH / 2, bodyTop, CHART_CONFIG.CANDLE_WIDTH, bodyHeight);
      } else {
        // 跌：实心绿
        ctx.fillRect(x - CHART_CONFIG.CANDLE_WIDTH / 2, bodyTop, CHART_CONFIG.CANDLE_WIDTH, bodyHeight);
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
   */
  function drawVolume(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    chartWidth: number,
    volumeAreaTop: number,
    volumeAreaHeight: number,
    volumeMax: number
  ): void {
    for (let i = 0; i < visibleKlines.length; i++) {
      const kline = visibleKlines[i];
      const x = i * CHART_CONFIG.CANDLE_STEP + CHART_CONFIG.CANDLE_STEP / 2;
      const volume = kline.volume ?? 0;
      const isUp = (kline.close ?? 0) >= (kline.open ?? 0);

      // 计算成交量柱高度
      const barHeight = (volume / volumeMax) * (volumeAreaHeight - 10);
      const barY = volumeAreaTop + volumeAreaHeight - barHeight - 5;

      ctx.fillStyle = isUp ? CHART_CONFIG.COLOR_VOLUME_UP : CHART_CONFIG.COLOR_VOLUME_DOWN;
      ctx.fillRect(x - CHART_CONFIG.CANDLE_WIDTH / 2, barY, CHART_CONFIG.CANDLE_WIDTH, barHeight);
    }
  }

  /**
   * 绘制交易标注（B/S/D）
   * 在K线蜡烛图对应日期位置叠加绘制交易点标记
   */
  function drawTradeMarkers(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    chartWidth: number,
    candleAreaHeight: number,
    priceMin: number,
    priceRange: number
  ): void {
    markerAreas = []; // 重置标注区域缓存

    for (const record of tradeRecords) {
      // 查找交易日期对应的K线索引
      const klineIndex = visibleKlines.findIndex(k => k.tradeDate === record.tradeDate);
      if (klineIndex === -1) continue; // 交易日期不在可见K线范围内

      const kline = visibleKlines[klineIndex];
      const x = klineIndex * CHART_CONFIG.CANDLE_STEP + CHART_CONFIG.CANDLE_STEP / 2;
      const close = kline.close ?? 0;
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
   * 绘制坐标轴文字（价格轴、日期轴）
   */
  function drawAxisLabels(
    ctx: CanvasRenderingContext2D,
    visibleKlines: KlineData[],
    chartWidth: number,
    width: number,
    _height: number,
    candleAreaHeight: number,
    priceMin: number,
    priceMax: number,
    priceRange: number,
    volumeAreaTop: number,
    volumeMax: number,
    dateAxisTop: number
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
      const x = i * CHART_CONFIG.CANDLE_STEP + CHART_CONFIG.CANDLE_STEP / 2;
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
      const deltaOffset = Math.round(deltaX / CHART_CONFIG.CANDLE_STEP);
      const newOffset = dragStartOffset + deltaOffset;

      // 计算最大偏移量
      const canvas = canvasRef.value;
      if (!canvas) return;
      const chartWidth = canvas.getBoundingClientRect().width - CHART_CONFIG.PRICE_AXIS_WIDTH;
      const visibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP);
      const maxOffset = Math.max(0, klineData.length - visibleCount);

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
   * 检测鼠标是否悬停在交易标注上
   */
  function checkTooltip(event: MouseEvent): void {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 检查是否在某个标注区域内
    let found = false;
    for (const area of markerAreas) {
      const dx = mouseX - area.x;
      const dy = mouseY - area.y;
      if (dx * dx + dy * dy <= area.radius * area.radius) {
        tooltipInfo.value = {
          visible: true,
          x: area.x,
          y: area.y - 30,
          tradeType: area.record.tradeType,
          tradePrice: area.record.tradePrice,
          tradeCount: area.record.tradeCount,
          holdingCount: area.record.holdingCount,
        };
        found = true;
        break;
      }
    }

    if (!found) {
      tooltipInfo.value = { ...tooltipInfo.value, visible: false };
    }
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
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    destroy();
  });

  return {
    offsetX,
    tooltipInfo,
    setData,
    drawChart,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    destroy,
  };
}
