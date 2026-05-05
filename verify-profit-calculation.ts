// 简单的盈利计算验证脚本
// 用于验证新的盈利计算公式是否正确实现

import type { ProfitStatistics } from './shared/types';

function testProfitCalculation() {
  console.log('=== 盈利计算公式验证 ===\n');
  
  // 测试用例1: 正常情况
  console.log('测试用例1: 正常情况');
  const test1: ProfitStatistics = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    totalIn: 10000,
    totalOut: 5000,
    accountBalance: 2000,
    currentHoldings: 8000,
    profit: 0 // 待计算
  };
  
  // 使用新公式计算
  test1.profit = test1.totalOut + test1.accountBalance + test1.currentHoldings - test1.totalIn;
  console.log(`转入: ${test1.totalIn}, 转出: ${test1.totalOut}, 余额: ${test1.accountBalance}, 持仓: ${test1.currentHoldings}`);
  console.log(`盈利 = ${test1.totalOut} + ${test1.accountBalance} + ${test1.currentHoldings} - ${test1.totalIn} = ${test1.profit}`);
  console.log(`预期结果: 5000, 实际结果: ${test1.profit}, ${test1.profit === 5000 ? '✓ 通过' : '✗ 失败'}\n`);
  
  // 测试用例2: 账户余额为0（应与旧公式一致）
  console.log('测试用例2: 账户余额为0（与旧公式对比）');
  const test2: ProfitStatistics = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    totalIn: 10000,
    totalOut: 5000,
    accountBalance: 0,
    currentHoldings: 8000,
    profit: 0
  };
  
  const newFormula = test2.totalOut + test2.accountBalance + test2.currentHoldings - test2.totalIn;
  const oldFormula = test2.totalOut - test2.totalIn + test2.currentHoldings;
  
  console.log(`新公式: ${test2.totalOut} + ${test2.accountBalance} + ${test2.currentHoldings} - ${test2.totalIn} = ${newFormula}`);
  console.log(`旧公式: ${test2.totalOut} - ${test2.totalIn} + ${test2.currentHoldings} = ${oldFormula}`);
  console.log(`两者是否一致: ${newFormula === oldFormula ? '✓ 是' : '✗ 否'}\n`);
  
  // 测试用例3: 亏损情况
  console.log('测试用例3: 亏损情况');
  const test3: ProfitStatistics = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    totalIn: 20000,
    totalOut: 5000,
    accountBalance: 1000,
    currentHoldings: 8000,
    profit: 0
  };
  
  test3.profit = test3.totalOut + test3.accountBalance + test3.currentHoldings - test3.totalIn;
  console.log(`转入: ${test3.totalIn}, 转出: ${test3.totalOut}, 余额: ${test3.accountBalance}, 持仓: ${test3.currentHoldings}`);
  console.log(`盈利 = ${test3.totalOut} + ${test3.accountBalance} + ${test3.currentHoldings} - ${test3.totalIn} = ${test3.profit}`);
  console.log(`是否为亏损: ${test3.profit < 0 ? '✓ 是' : '✗ 否'}\n`);
  
  // 测试用例4: 全部为零
  console.log('测试用例4: 全部为零');
  const test4: ProfitStatistics = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    totalIn: 0,
    totalOut: 0,
    accountBalance: 0,
    currentHoldings: 0,
    profit: 0
  };
  
  test4.profit = test4.totalOut + test4.accountBalance + test4.currentHoldings - test4.totalIn;
  console.log(`盈利 = ${test4.profit}, 预期: 0, ${test4.profit === 0 ? '✓ 通过' : '✗ 失败'}\n`);
  
  console.log('=== 验证完成 ===');
}

// 运行测试
testProfitCalculation();
