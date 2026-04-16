/**
 * 网格交易计算服务
 * 提供持仓调整计算和开仓数量计算功能
 */

import type {
  CalculateOpenInput,
  CalculatePositionInput,
  OpenResult,
  PositionResult
} from '../../shared/types';

// A股最低买卖单位（1手=100股）
const MIN_TRADE_UNIT = 100;

/**
 * 计算持仓调整方案
 * 根据当前持仓情况和总资金，计算目标持仓及调整数量
 *
 * 公式说明：
 * - 当前持仓成本 = 持仓数量 × 持仓均价
 * - 当前持仓市值 = 持仓数量 × 当前股价
 * - 可用资金 = 总金额 - 当前持仓成本
 * - 目标持仓金额 = (总金额 - 当前持仓成本 + 当前持仓市值) / 2
 * - 目标持仓数量 = floor(目标持仓金额 / 当前股价 / 100) × 100
 * - 调整数量 = 目标持仓数量 - 当前持仓数量
 * - 偏差百分比 = (可用资金 - 持仓市值) / 可用资金 × 100
 *
 * @param input 计算参数
 * @returns 持仓调整计算结果
 */
export function calculatePosition(input: CalculatePositionInput): PositionResult {
  const { totalAmount, currentPrice, currentHoldingCount, averageHoldingPrice } = input;

  // 当前持仓成本金额
  const currentPositionAmount = currentHoldingCount * averageHoldingPrice;
  // 当前持仓市值
  const currentMarketValue = currentHoldingCount * currentPrice;
  // 可用资金 = 总金额 - 持仓成本
  const availableFunds = totalAmount - currentPositionAmount;
  // 目标持仓金额 = (总金额 - 持仓成本 + 持仓市值) / 2
  const targetPositionAmount = (totalAmount - currentPositionAmount + currentMarketValue) / 2;
  // 目标持仓数量（向下取整到100股的整数倍）
  const targetPosition = Math.floor(targetPositionAmount / currentPrice / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;
  // 调整数量（正数买入，负数卖出）
  const adjustAmount = targetPosition - currentHoldingCount;
  // 偏差百分比 = (可用资金 - 持仓市值) / 可用资金 × 100
  const deviationPercent = availableFunds !== 0
    ? ((availableFunds - currentMarketValue) / availableFunds) * 100
    : 0;

  return {
    currentPositionAmount,
    targetPosition,
    targetPositionAmount,
    adjustAmount,
    deviationPercent
  };
}

/**
 * 计算开仓买入数量
 * 根据总资金和开仓价格，计算首次建仓的买入数量
 *
 * 公式说明：
 * - 开仓金额 = 总金额 / 2（首次建仓使用50%资金）
 * - 买入数量 = floor(开仓金额 / 开仓股价 / 100) × 100
 *
 * @param input 开仓计算参数
 * @returns 开仓计算结果
 */
export function calculateOpen(input: CalculateOpenInput): OpenResult {
  const { totalAmount, openPrice } = input;

  // 开仓金额为总资金的一半
  const openAmount = totalAmount / 2;
  // 买入数量（向下取整到100股的整数倍）
  const buyCount = Math.floor(openAmount / openPrice / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;

  return {
    openAmount,
    buyCount
  };
}
