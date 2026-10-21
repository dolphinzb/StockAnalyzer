/**
 * 形态标注渲染回归测试
 *
 * 背景（缺陷修复）：
 *   形态检测曾在科创50（2025-10-20）检出看跌信号，但因信号K线处于可见区间高位，
 *   看跌标记的基准Y被固定上偏移（-45px）推到画布顶部之外（Y为负），
 *   导致三角形被裁剪、不可见，悬停 tooltip 也无法命中。
 *
 * 修复：drawPatternMarkers 对标记Y做边界钳制，保证图元始终完整落在蜡烛图区域内。
 *
 * 本测试通过录制 Canvas 2D 路径调用，验证：
 *   1. 高位看跌信号：三角形完整可见（不越出画布顶部）
 *   2. 中位看跌信号：位置不受钳制影响（回归防护，避免误伤正常定位）
 *   3. 低位看涨信号：三角形不越出蜡烛图区底部
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ref } from 'vue';
import type { KlineData, PatternHit } from '../../shared/types';
import { useKlineChart } from '../../src/composables/useKlineChart';

/** 与 useKlineChart 内部一致的几何常量（测试需复现以计算期望位置） */
const PADDING_TOP = 20;
const CANDLE_AREA_RATIO = 0.7;
const PRICE_AXIS_WIDTH = 70;
const CANDLE_STEP = 10;
const GLYPH_HALF_HEIGHT = 6;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 400;
/** 蜡烛图区域高度 = 400 * 0.7 - 20 = 260 */
const CANDLE_AREA_HEIGHT = CANVAS_HEIGHT * CANDLE_AREA_RATIO - PADDING_TOP;
/** 蜡烛图区域底部Y坐标 */
const AREA_BOTTOM = PADDING_TOP + CANDLE_AREA_HEIGHT;

/** 录制的画布路径操作 */
interface CanvasOp {
  op: string;
  x?: number;
  y?: number;
}

/** 从录制操作中提取被 fill 的路径（即形态图元；蜡烛用 fillRect、网格/影线用 stroke，均不计入） */
interface Glyph {
  xs: number[];
  ys: number[];
}

function extractFilledGlyphs(ops: CanvasOp[]): Glyph[] {
  const glyphs: Glyph[] = [];
  let current: Glyph | null = null;
  for (const op of ops) {
    if (op.op === 'beginPath') {
      current = { xs: [], ys: [] };
      continue;
    }
    if (op.op === 'fill') {
      if (current) glyphs.push(current);
      current = null;
      continue;
    }
    if (current && (op.op === 'moveTo' || op.op === 'lineTo') && op.x != null && op.y != null) {
      current.xs.push(op.x);
      current.ys.push(op.y);
    }
  }
  return glyphs;
}

/** 创建带路径录制的假 Canvas（node 环境无 DOM） */
function createRecordingCanvas(): { canvas: HTMLCanvasElement; ops: CanvasOp[] } {
  const ops: CanvasOp[] = [];
  const ctx = {
    beginPath: () => ops.push({ op: 'beginPath' }),
    moveTo: (x: number, y: number) => ops.push({ op: 'moveTo', x, y }),
    lineTo: (x: number, y: number) => ops.push({ op: 'lineTo', x, y }),
    closePath: () => ops.push({ op: 'closePath' }),
    fill: () => ops.push({ op: 'fill' }),
    stroke: () => ops.push({ op: 'stroke' }),
    clearRect: () => {},
    scale: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
  };
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      left: 0,
      top: 0,
      right: CANVAS_WIDTH,
      bottom: CANVAS_HEIGHT,
    }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, ops };
}

/** 生成 K 线数据：trend='up' 递增（末根最高），'down' 递减（末根最低） */
function makeKlines(count: number, trend: 'up' | 'down'): KlineData[] {
  const klines: KlineData[] = [];
  for (let i = 0; i < count; i++) {
    const close = trend === 'up' ? 1 + i * 0.2 : 100 - i * 0.9;
    const date = new Date(Date.UTC(2025, 0, 2 + i));
    klines.push({
      id: i + 1,
      stockCode: '000688',
      tradeDate: date.toISOString().slice(0, 10),
      adjustType: '',
      open: close - 0.1,
      close,
      high: close + 0.3,
      low: close - 0.3,
      volume: 1000 + i,
      amount: 10000 + i,
      amplitude: 1,
      changePercent: 0.5,
      changeAmount: 0.1,
      turnoverRate: 1,
      createdAt: '',
      updatedAt: '',
    });
  }
  return klines;
}

/** 构造形态命中 */
function makeHit(endIndex: number, direction: PatternHit['direction']): PatternHit {
  return {
    code: 'evening_star',
    name: '暮星',
    direction,
    startIndex: endIndex - 2,
    endIndex,
    strength: 0.8,
    trendContext: 'up',
  };
}

/** 可见K线（与 getVisibleWindow/drawChart 的 slice 一致：数据不足可见数量时取全部） */
function visibleKlines(klines: KlineData[]): KlineData[] {
  return klines.slice(Math.max(0, klines.length - VISIBLE_COUNT));
}

/** 复现 drawChart 的价格窗口计算（基于可见K线，含上下5%留白） */
function priceWindow(klines: KlineData[]): { adjMin: number; adjRange: number; adjMax: number } {
  const visible = visibleKlines(klines);
  const priceMin = Math.min(...visible.map(k => k.low ?? 0));
  const priceMax = Math.max(...visible.map(k => k.high ?? 0));
  const priceRange = priceMax - priceMin || 1;
  const pricePadding = priceRange * 0.05;
  const adjMin = priceMin - pricePadding;
  const adjRange = priceRange + pricePadding * 2;
  return { adjMin, adjRange, adjMax: adjMin + adjRange };
}

/** 计算形态标记的期望原始Y（未钳制；bullish 锚定最低价+30，bearish/warning 锚定最高价-45/-60） */
function expectedRawY(kline: KlineData, win: { adjMax: number; adjRange: number }, direction: PatternHit['direction']): number {
  const anchor = direction === 'bullish' ? (kline.low ?? 0) : (kline.high ?? 0);
  const offset = direction === 'bullish' ? 30 : direction === 'bearish' ? -45 : -60;
  return PADDING_TOP + ((win.adjMax - anchor) / win.adjRange) * CANDLE_AREA_HEIGHT + offset;
}

/** 安装数据与形态标记并绘制，返回录制的路径操作（node 环境需桩 window/rAF） */
function setupAndDraw(klines: KlineData[], hits: PatternHit[]): CanvasOp[] {
  const { canvas, ops } = createRecordingCanvas();
  const canvasRef = ref(canvas);
  const chart = useKlineChart(canvasRef);
  chart.setData(klines, []);
  ops.length = 0; // 丢弃 setData 阶段的绘制，仅保留设置形态标记后的重绘
  chart.setPatternMarkers(hits);
  return ops;
}

/** 可见窗口几何（与 getVisibleWindow 一致：100根K线时可见73根，步长10px） */
const VISIBLE_COUNT = Math.floor((CANVAS_WIDTH - PRICE_AXIS_WIDTH) / CANDLE_STEP); // 73
const CANDLE_X_STEP = (CANVAS_WIDTH - PRICE_AXIS_WIDTH) / VISIBLE_COUNT; // 10

/** 命中K线在画布中的中心X */
function expectedCandleX(endIndex: number, klineCount: number): number {
  const startIdx = klineCount - VISIBLE_COUNT;
  const visibleIdx = endIndex - startIdx;
  return visibleIdx * CANDLE_X_STEP + CANDLE_X_STEP / 2;
}

describe('useKlineChart 形态标注渲染', () => {
  const originalWindow = (globalThis as Record<string, unknown>).window;
  const originalRaf = (globalThis as Record<string, unknown>).requestAnimationFrame;
  const originalCancelRaf = (globalThis as Record<string, unknown>).cancelAnimationFrame;

  beforeAll(() => {
    // node 环境无 DOM：桩 window.devicePixelRatio 与同步的 requestAnimationFrame
    (globalThis as Record<string, unknown>).window = { devicePixelRatio: 1 };
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    };
    (globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};
  });

  afterAll(() => {
    (globalThis as Record<string, unknown>).window = originalWindow;
    (globalThis as Record<string, unknown>).requestAnimationFrame = originalRaf;
    (globalThis as Record<string, unknown>).cancelAnimationFrame = originalCancelRaf;
  });

  it('高位看跌信号：三角形完整可见，不越出画布顶部（科创50 2025-10-20 场景）', () => {
    // 100根递增K线，末根为区间最高（股价位置较高）
    const klines = makeKlines(100, 'up');
    const hitIndex = klines.length - 1;
    const win = priceWindow(klines);

    // 修复前：固定 -45px 偏移使基准Y为负，三角形被画到画布外
    const rawY = expectedRawY(klines[hitIndex], win, 'bearish');
    expect(rawY).toBeLessThan(0);

    const ops = setupAndDraw(klines, [makeHit(hitIndex, 'bearish')]);
    const glyphs = extractFilledGlyphs(ops);

    // 有且仅有一个形态图元，且位于末根蜡烛中心
    expect(glyphs).toHaveLength(1);
    const glyph = glyphs[0];
    expect(glyph.xs[0]).toBeCloseTo(expectedCandleX(hitIndex, klines.length), 5);

    // 向下三角：顶点为 moveTo(x, y+6)、上角为 lineTo(x±5, y-4)，最高点 = 中心Y - 4
    const glyphTop = Math.min(...glyph.ys);
    const markerCenterY = glyphTop + 4;

    // 核心断言：三角形完整落在画布内（修复前 glyphTop ≈ rawY - 4 < 0，不可见）
    expect(glyphTop).toBeGreaterThanOrEqual(0);
    // 且被钳制到蜡烛图区域顶部边界（PADDING_TOP + 图元半高）
    expect(markerCenterY).toBeCloseTo(PADDING_TOP + GLYPH_HALF_HEIGHT, 5);
  });

  it('中位看跌信号：标记位置不受钳制影响（正常定位回归防护）', () => {
    const klines = makeKlines(100, 'up');
    const hitIndex = 50; // 区间中段
    const win = priceWindow(klines);

    const rawY = expectedRawY(klines[hitIndex], win, 'bearish');
    // 中位时期望Y在钳制范围内，不应被钳制
    expect(rawY).toBeGreaterThan(PADDING_TOP + GLYPH_HALF_HEIGHT);
    expect(rawY).toBeLessThan(AREA_BOTTOM - GLYPH_HALF_HEIGHT);

    const ops = setupAndDraw(klines, [makeHit(hitIndex, 'bearish')]);
    const glyphs = extractFilledGlyphs(ops);

    expect(glyphs).toHaveLength(1);
    const glyphTop = Math.min(...glyphs[0].ys);
    const markerCenterY = glyphTop + 4;

    // 未被钳制：绘制位置等于理论计算位置
    expect(markerCenterY).toBeCloseTo(rawY, 5);
    expect(glyphs[0].xs[0]).toBeCloseTo(expectedCandleX(hitIndex, klines.length), 5);
  });

  it('低位看涨信号：三角形不越出蜡烛图区底部', () => {
    // 100根递减K线，末根为区间最低（股价位置较低）
    const klines = makeKlines(100, 'down');
    const hitIndex = klines.length - 1;
    const win = priceWindow(klines);

    const rawY = expectedRawY(klines[hitIndex], win, 'bullish');
    // 修复前：固定 +30px 偏移使图元底部越过蜡烛图区
    expect(rawY).toBeGreaterThan(AREA_BOTTOM - GLYPH_HALF_HEIGHT);

    const ops = setupAndDraw(klines, [makeHit(hitIndex, 'bullish')]);
    const glyphs = extractFilledGlyphs(ops);

    expect(glyphs).toHaveLength(1);
    // 向上三角：顶点为 moveTo(x, y-6)、下角为 lineTo(x±5, y+4)，最低点 = 中心Y + 4
    const glyphBottom = Math.max(...glyphs[0].ys);
    const markerCenterY = glyphBottom - 4;

    // 底部不越过蜡烛图区（不侵入成交量区域）
    expect(glyphBottom).toBeLessThanOrEqual(AREA_BOTTOM);
    // 且被钳制到区域底部边界
    expect(markerCenterY).toBeCloseTo(AREA_BOTTOM - GLYPH_HALF_HEIGHT, 5);
  });
});
