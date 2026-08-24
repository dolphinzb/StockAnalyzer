import { describe, it, expect } from 'vitest';
import { runGridSimulation } from '../src/composables/useGridSimulation';
import type { GridSimulationInput, KlineData } from '../shared/types';

// 网格档位：4.0 / 4.2 / 4.4 / 4.6 / 4.8（fixed, 间距 0.2）
const baseInput = (overrides: Partial<GridSimulationInput> = {}): GridSimulationInput => ({
  initialCapital: 1_000_000,
  lowerLimit: 4.0,
  upperLimit: 4.8,
  spacing: 0.2,
  spacingType: 'fixed',
  commissionRate: 0,
  minFee: 0,
  stampTaxRate: 0,
  feeRate: 0, // 关闭手续费，便于按股数断言
  dividendPerShare: 0,
  sharesPerGrid: 2000, // 固定每格 2000 股
  startDate: '2024-01-01',
  ...overrides,
});

// 构造一根 K 线；用 low===high 保证单方向穿越，避免同日反向震荡
const flat = (date: string, price: number): KlineData => ({
  tradeDate: date, open: price, high: price, low: price, close: price,
  preClose: price, volume: 0, amount: 0, amplitude: 0, changePct: 0, change: 0,
});

describe('网格卖出策略', () => {
  it('策略1（默认）：上涨穿越整批清仓，向后兼容', () => {
    const input = baseInput({ gridStrategy: 'strategy1' });
    const klines = [flat('2024-01-01', 4.2), flat('2024-01-02', 4.4)];
    const res = runGridSimulation(input, klines);
    const sells = res.operations.filter((o) => o.type === 'SELL' && !o.virtual);
    expect(sells).toHaveLength(1);
    expect(sells[0].shares).toBe(2000);
  });

  it('策略2 单批次：首次穿越卖一半，二次穿越卖剩余', () => {
    const input = baseInput({ gridStrategy: 'strategy2' });
    const klines = [flat('2024-01-01', 4.2), flat('2024-01-02', 4.4), flat('2024-01-03', 4.6)];
    const res = runGridSimulation(input, klines);
    const sells = res.operations.filter((o) => o.type === 'SELL' && !o.virtual);
    expect(sells).toHaveLength(2);
    expect(sells[0].shares).toBe(1000);
    expect(sells[1].shares).toBe(1000);
    expect(res.finalHolding).toBe(0);
  });

  it('策略2 跨批次：一次上涨穿越时所有已穿越待减批次同时减仓', () => {
    // Day1 建仓 4.4(2000, lotA)；Day2 纯跌到 4.0：买入 4.2 批(2000, lotB)
    // Day3 涨到 4.6：4.4 档卖 lotB(4.2)首次 1000；4.6 档卖 lotA(4.4)首次 1000 + lotB 剩余 1000（清）
    //   两批在 4.6 穿越时均处于"已穿越待减"，4.6 档产生 2 笔各 1000
    const input = baseInput({ gridStrategy: 'strategy2' });
    const klines = [
      flat('2024-01-01', 4.4),
      flat('2024-01-02', 4.0),
      flat('2024-01-03', 4.6),
    ];
    const res = runGridSimulation(input, klines);
    // 聚焦 Day3（4.6 档）产生的真实 SELL
    const day3Sells = res.operations.filter(
      (o) => o.type === 'SELL' && !o.virtual && o.date === '2024-01-03' && Math.abs(o.price - 4.6) < 1e-6,
    );
    expect(day3Sells).toHaveLength(2);
    expect(day3Sells.every((o) => o.shares === 1000)).toBe(true);
    // lotB(4.2) 已被清仓、lotA(4.4) 首次减半剩 1000 → 期末持仓 = 1000
    expect(res.finalHolding).toBe(1000);
  });

  it('策略2 空仓虚拟占位：所有批次卖光后继续上穿记为虚拟卖出', () => {
    const input = baseInput({ gridStrategy: 'strategy2' });
    const klines = [
      flat('2024-01-01', 4.2),
      flat('2024-01-02', 4.4),
      flat('2024-01-03', 4.6),
      flat('2024-01-04', 4.8),
    ];
    const res = runGridSimulation(input, klines);
    const last = res.operations[res.operations.length - 1];
    expect(last.type).toBe('SELL');
    expect(last.virtual).toBe(true);
    expect(last.shares).toBe(0);
  });
});
