const GRID_TARGET_RATIO = 0.5;
const MIN_TRADE_UNIT = 100;

interface CalculatePositionInput {
  totalAmount: number;
  currentPrice: number;
  currentHoldingCount: number;
  averageHoldingPrice: number;
}

interface PositionResult {
  currentPositionAmount: number;
  targetPosition: number;
  targetPositionAmount: number;
  adjustAmount: number;
  deviationPercent: number;
}

interface CalculateOpenInput {
  totalAmount: number;
  openPrice: number;
}

interface OpenResult {
  openAmount: number;
  buyCount: number;
}

export function calculatePosition(input: CalculatePositionInput): PositionResult {
  const { totalAmount, currentPrice, currentHoldingCount, averageHoldingPrice } = input;

  const currentPositionAmount = currentHoldingCount * averageHoldingPrice;
  const targetPositionAmount = totalAmount * GRID_TARGET_RATIO;
  const targetPosition = Math.floor(targetPositionAmount / currentPrice / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;
  const adjustAmount = targetPosition - currentHoldingCount;
  const deviationPercent = targetPosition !== 0
    ? ((currentHoldingCount - targetPosition) / targetPosition) * 100
    : 0;

  return {
    currentPositionAmount,
    targetPosition,
    targetPositionAmount,
    adjustAmount,
    deviationPercent
  };
}

export function calculateOpen(input: CalculateOpenInput): OpenResult {
  const { totalAmount, openPrice } = input;

  const openAmount = totalAmount * GRID_TARGET_RATIO;
  const buyCount = Math.floor(openAmount / openPrice / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;

  return {
    openAmount,
    buyCount
  };
}
