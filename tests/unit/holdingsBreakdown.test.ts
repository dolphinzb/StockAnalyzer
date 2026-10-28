import { describe, expect, it } from 'vitest';
import type { HoldingMarketDetail } from '../../shared/types';
import { buildHoldingsRows, HOLDINGS_COLORS } from '../../src/utils/holdings';

/** 构造持仓明细测试数据 */
function createHolding(overrides: Partial<HoldingMarketDetail>): HoldingMarketDetail {
  return {
    stockCode: '000001',
    stockName: '测试标的',
    holdingCount: 100,
    closePrice: 10,
    marketValue: 1000,
    hasKlineData: true,
    ...overrides,
  };
}

describe('buildHoldingsRows', () => {
  it('按市值降序排列并计算占比（60% / 40%）', () => {
    const rows = buildHoldingsRows(
      [
        createHolding({ stockCode: '600519', stockName: 'A', marketValue: 6000 }),
        createHolding({ stockCode: '000858', stockName: 'B', marketValue: 4000 }),
      ],
      10000
    );

    expect(rows.map((row) => row.stockCode)).toEqual(['600519', '000858']);
    expect(rows[0].percentage).toBeCloseTo(60);
    expect(rows[1].percentage).toBeCloseTo(40);
    expect(rows[0].barWidth).toBeCloseTo(60);
    expect(rows[1].barWidth).toBeCloseTo(40);
  });

  it('总资产为 0 时占比为 null 且进度条宽度为 0', () => {
    const rows = buildHoldingsRows(
      [createHolding({ stockCode: '600519', marketValue: 6000 })],
      0
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].percentage).toBeNull();
    expect(rows[0].barWidth).toBe(0);
  });

  it('市值相同时按代码升序排列', () => {
    const rows = buildHoldingsRows(
      [
        createHolding({ stockCode: '600519', marketValue: 1000 }),
        createHolding({ stockCode: '000858', marketValue: 1000 }),
      ],
      2000
    );

    expect(rows.map((row) => row.stockCode)).toEqual(['000858', '600519']);
  });

  it('缺少行情数据的标的排在末尾，占比与进度条均为空值', () => {
    const rows = buildHoldingsRows(
      [
        createHolding({ stockCode: '600519', marketValue: 0, closePrice: 0, hasKlineData: false }),
        createHolding({ stockCode: '000858', marketValue: 4000 }),
      ],
      4000
    );

    expect(rows.map((row) => row.stockCode)).toEqual(['000858', '600519']);
    expect(rows[1].percentage).toBeNull();
    expect(rows[1].barWidth).toBe(0);
    expect(rows[1].hasKlineData).toBe(false);
  });

  it('按排序顺序稳定分配调色板颜色', () => {
    const rows = buildHoldingsRows(
      [
        createHolding({ stockCode: '600519', marketValue: 3000 }),
        createHolding({ stockCode: '000858', marketValue: 2000 }),
        createHolding({ stockCode: '601318', marketValue: 1000 }),
      ],
      6000
    );

    expect(rows[0].color).toBe(HOLDINGS_COLORS[0]);
    expect(rows[1].color).toBe(HOLDINGS_COLORS[1]);
    expect(rows[2].color).toBe(HOLDINGS_COLORS[2]);
  });

  it('不修改传入的原始数组', () => {
    const holdings = [
      createHolding({ stockCode: '600519', marketValue: 1000 }),
      createHolding({ stockCode: '000858', marketValue: 2000 }),
    ];

    buildHoldingsRows(holdings, 3000);

    // 原始数组顺序保持不变
    expect(holdings.map((item) => item.stockCode)).toEqual(['600519', '000858']);
  });
});
