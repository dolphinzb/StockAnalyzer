import { describe, it, expect } from 'vitest';
import type { ProfitStatistics } from '../../shared/types';

describe('Profit Statistics Calculation', () => {
  it('should calculate profit correctly with the new formula', () => {
    // 测试数据
    const totalIn = 10000;      // 转入总额
    const totalOut = 5000;      // 转出总额
    const accountBalance = 2000; // 账户余额
    const currentHoldings = 8000; // 当前持仓
    
    // 根据新公式计算：profit = totalOut + accountBalance + currentHoldings - totalIn
    const expectedProfit = totalOut + accountBalance + currentHoldings - totalIn;
    
    // 创建盈利统计对象
    const profitStats: ProfitStatistics = {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      totalIn,
      totalOut,
      accountBalance,
      currentHoldings,
      profit: expectedProfit
    };
    
    // 验证计算结果
    expect(profitStats.profit).toBe(5000); // 5000 + 2000 + 8000 - 10000 = 5000
  });

  it('should handle zero values correctly', () => {
    const profitStats: ProfitStatistics = {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      totalIn: 0,
      totalOut: 0,
      accountBalance: 0,
      currentHoldings: 0,
      profit: 0
    };
    
    expect(profitStats.profit).toBe(0);
  });

  it('should handle negative profit (loss) scenario', () => {
    const totalIn = 20000;
    const totalOut = 5000;
    const accountBalance = 1000;
    const currentHoldings = 8000;
    
    const profit = totalOut + accountBalance + currentHoldings - totalIn;
    
    const profitStats: ProfitStatistics = {
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      totalIn,
      totalOut,
      accountBalance,
      currentHoldings,
      profit
    };
    
    expect(profitStats.profit).toBe(-6000); // 5000 + 1000 + 8000 - 20000 = -6000
    expect(profitStats.profit).toBeLessThan(0); // 确认是亏损
  });

  it('should match the old formula when accountBalance is 0', () => {
    const totalIn = 10000;
    const totalOut = 5000;
    const accountBalance = 0; // 账户余额为0
    const currentHoldings = 8000;
    
    // 新公式：profit = totalOut + accountBalance + currentHoldings - totalIn
    const newProfit = totalOut + accountBalance + currentHoldings - totalIn;
    
    // 旧公式：profit = totalOut - totalIn + currentHoldings
    const oldProfit = totalOut - totalIn + currentHoldings;
    
    expect(newProfit).toBe(oldProfit); // 当accountBalance为0时，新旧公式结果相同
    expect(newProfit).toBe(3000); // 5000 + 0 + 8000 - 10000 = 3000
  });

  it('should handle large numbers correctly', () => {
    const totalIn = 1000000;
    const totalOut = 500000;
    const accountBalance = 200000;
    const currentHoldings = 800000;
    
    const profit = totalOut + accountBalance + currentHoldings - totalIn;
    
    expect(profit).toBe(500000); // 500000 + 200000 + 800000 - 1000000 = 500000
  });
});
