/**
 * 网格交易仿真核心逻辑（纯函数，前端计算）
 *
 * 设计要点（见 design.md D2/D3/D5）：
 * - 使用不复权日 K 数据；除权跳变当作普通网格穿越处理，不识别/不跳过（首版忽略除权影响）。
 * - 首版不模拟分红：不生成 DIVIDEND 记录、不计入现金、忽略 dividendPerShare 字段。
 * - 游标 + 虚拟卖出占位模型：维护一个"游标档位 cursorIdx"（最近一次操作发生的档位，含虚拟卖出）。
 *   每日用 [low, high] 连续判定穿越：
 *     · 上涨穿：high 触及/涨穿 cursorIdx 的上一档 levels[cursorIdx+1] → 在 levels[cursorIdx+1] 卖出；
 *       卖出采用"批次栈(LIFO)"：使每格买入能随价格回升逐格对应卖出；若此时真实持仓耗尽（批次栈为空）则记为"虚拟卖出"(virtual)
 *       仅占位，游标移到 cursorIdx+1。可连续上穿多档。具体减仓比例由 gridStrategy 决定：
 *         - 策略1（默认）：整批清仓，仅卖出栈顶（最近买入）那一批。
 *         - 策略2：对所有"已穿越待减"批次各卖出其买入量的一半（分步减仓）。
 *     · 下跌穿：low 触及/跌穿 cursorIdx 的下一档 levels[cursorIdx-1] → 在 levels[cursorIdx-1] 真实买入，
 *       游标移到 cursorIdx-1。可连续下穿多档。
 *   虚拟卖出的作用是：空仓后价格继续沿原方向推进时，逐档记录占位，使后续反向穿越能按"最近一次操作档位"触发真实买入。
 * - 成交价采用档位值（限价单挂档位成交）；盘中 high/low 仅用于判定是否穿越该档。
 * - 年化收益率按自然日口径：(1 + 总收益率)^(365 / 持有自然日数) - 1。
 */

import type {
  GridSimulationInput,
  GridSimulationOperation,
  GridSimulationResult,
  KlineData
} from '../../shared/types';

// A股最低买卖单位（1手=100股）
const MIN_TRADE_UNIT = 100;

/**
 * 生成网格档位价格数组（升序），包含 lower 与 upper。
 * - fixed：levels = [lower, lower+spacing, ..., upper]
 * - percentage：levels[i+1] = levels[i] × (1 + spacing)，直到不超过 upper
 */
export function generateGridLevels(input: GridSimulationInput): number[] {
  const { lowerLimit, upperLimit, spacing, spacingType } = input;
  if (spacing <= 0 || upperLimit <= lowerLimit) {
    return [];
  }

  const levels: number[] = [];
  if (spacingType === 'percentage') {
    let level = lowerLimit;
    // 等比：从下限起逐档乘 (1+spacing)，避免浮点漏掉上限
    while (level <= upperLimit + 1e-9) {
      levels.push(level);
      const next = level * (1 + spacing);
      if (next <= level) break; // 防止 spacing<=0 死循环（已在上面拦截 spacing<=0）
      level = next;
    }
  } else {
    let level = lowerLimit;
    while (level <= upperLimit + 1e-9) {
      levels.push(level);
      level += spacing;
    }
  }
  return levels;
}

/**
 * 计算单笔交易手续费
 * 买入/卖出：fee = max(commissionRate × amount, minFee)；卖出另计印花税 stampTaxRate × amount
 */
export function calcFee(
  input: GridSimulationInput,
  amount: number,
  isSell: boolean
): number {
  const commission = Math.max(input.commissionRate * amount, input.minFee);
  const stamp = isSell ? input.stampTaxRate * amount : 0;
  return commission + stamp;
}

/**
 * 将股数向下取整到 100 股整数倍
 */
function floorToLot(shares: number): number {
  return Math.floor(shares / MIN_TRADE_UNIT) * MIN_TRADE_UNIT;
}

/**
 * 仿真策略对象（组合式钩子）。
 * 所有钩子的默认实现均为 strategy1 的现有逻辑；每个策略只声明与 strategy1 不同的钩子，
 * 未声明钩子经 { ...STRATEGY1, ...覆盖 } 合并自动回退到 strategy1（见 GRID_STRATEGIES）。
 * 这样即便未来新增「买入逻辑也不同」的策略，也只需覆写对应钩子，主流程零改动（开闭原则 + 防崩坏）。
 */
export interface GridSimStrategy {
  /** 整批卖出型触发所需的档位偏移：买入档位 buyLevel 需 + sellOffset 才满足触发 */
  sellOffset: number;
  /** 卖出数量模式：'full' 栈顶整批弹出；'half' 遍历待减批次逐批减半 */
  mode: 'full' | 'half';
  /** 单批次本次应卖股数（'full' 返回 lot.total；'half' 首穿 floorToLot(total/2)、再穿卖剩余） */
  sellQuantity(lot: Lot): number;
  /** 买入股数计算（默认 = 现有 resolveShares：固定股数 / 初始资金均摊） */
  resolveShares(input: GridSimulationInput, levelCount: number, triggerPrice: number): number;
  /** 下跌穿越时是否允许建仓的前置条件（默认无条件买入） */
  canBuy(ctx: GridSimBuyContext): boolean;
  /** 首日底仓建仓的游标定位（默认 = 现有「向上最近档位」逻辑） */
  initCursorIdx(levels: number[], firstClose: number): number;
}

/** canBuy 钩子的上下文 */
interface GridSimBuyContext {
  input: GridSimulationInput;
  level: number;
  cursorIdx: number;
  lots: Lot[];
  /** 截至本次下跌穿越的连续下穿次数（用于如「连跌两格才加仓」之类条件） */
  downStreak: number;
}

/** 批次（LIFO 栈元素） */
interface Lot {
  total: number;
  sold: number;
  buyLevel: number;
}

// 基准策略：全部采用现 strategy1 逻辑
const STRATEGY1: GridSimStrategy = {
  sellOffset: 1,
  mode: 'full',
  sellQuantity: (l) => l.total,
  resolveShares: (input, levelCount, price) => resolveShares(input, levelCount, price),
  canBuy: () => true,
  initCursorIdx: (levels, firstClose) => {
    if (firstClose > levels[levels.length - 1] + 1e-9) return -1; // 高于上限，暂不建仓
    if (firstClose < levels[0] - 1e-9) return 0; // 低于下限，以最低档建仓
    const idx = levels.findIndex((lv) => lv >= firstClose - 1e-9);
    return idx === -1 ? levels.length - 1 : idx;
  }
};

/**
 * 网格策略注册表。新增策略只需在此以 { ...STRATEGY1, ...差异 } 注册，
 * 并在 shared/types GridSimulationInput.gridStrategy 联合类型追加字面量即可，主流程零改动。
 */
const GRID_STRATEGIES: Record<'strategy1' | 'strategy2' | 'strategy3', GridSimStrategy> = {
  strategy1: STRATEGY1,
  strategy2: {
    ...STRATEGY1,
    mode: 'half',
    sellQuantity: (l) => (l.sold === 0 ? floorToLot(l.total / 2) : l.total - l.sold)
  },
  strategy3: {
    ...STRATEGY1,
    sellOffset: 2 // 仅改触发偏移为两格，卖出模式与买入逻辑全部继承 strategy1
  }
  // 扩展示例（证明买入逻辑不同也能接入，主流程零改动）：
  // strategy4: { ...STRATEGY1, resolveShares: (i, n, p) => floorToLot(resolveShares(i, n, p) * 1.5), canBuy: (c) => c.downStreak >= 2 }
};


/**
 * 运行网格仿真
 * @param input 仿真参数
 * @param klines 不复权日 K 数据（按 trade_date 升序）
 * @returns 仿真结果
 */
/**
 * 解析单笔交易的买入/卖出股数。
 * - 手动模式（sharesPerGrid 有值）：返回该固定股数（已向下取整到 100）。
 * - 自动模式（sharesPerGrid 为 null）：按「初始资金 / 档位数 / 触发价」估算，
 *   再向下取整到 100 股；档位数为 0 时退化为 0。
 * 触发价即本次网格穿越的成交档位值（level）。
 */
function resolveShares(
  input: GridSimulationInput,
  levelCount: number,
  triggerPrice: number
): number {
  if (input.sharesPerGrid != null && input.sharesPerGrid > 0) {
    return floorToLot(input.sharesPerGrid);
  }
  // 自动模式
  if (levelCount <= 0 || triggerPrice <= 0) return 0;
  const amountPerGrid = input.initialCapital / levelCount;
  const rawShares = amountPerGrid / triggerPrice;
  return floorToLot(rawShares);
}

export function runGridSimulation(
  input: GridSimulationInput,
  klines: KlineData[]
): GridSimulationResult {
  const levels = generateGridLevels(input);
  const levelCount = levels.length;

  const operations: GridSimulationOperation[] = [];
  let cash = input.initialCapital;
  let holding = 0;
  // 批次栈（LIFO）：记录每次买入的股数、已卖股数与买入档位。网格交易每下跌一格买入一批（push），
  // 每回升一格只卖出最近买入、价格最低的那一批（pop），而不是整仓清空。
  // 这是修复"上涨时把多格买入一起卖光"逻辑错误的关键：持仓 = sum(lots.total - lots.sold)。
  // 策略2 需要按批次记录 sold 与 buyLevel，以在多次上涨穿越时分批减仓、并跨批次判定「已穿越待减」。
  const lots: Lot[] = [];

  if (levels.length === 0 || klines.length === 0) {
    return buildEmptyResult(cash, holding, klines);
  }

  const firstClose = klines[0].close ?? 0;

  // 取仿真策略对象：未声明的钩子经 { ...STRATEGY1, ...覆盖 } 合并后自动回退到 strategy1 默认实现。
  const key = input.gridStrategy ?? 'strategy1';
  const strat: GridSimStrategy = { ...STRATEGY1, ...(GRID_STRATEGIES[key] ?? {}) };

  // 初始底仓游标：由策略钩子 initCursorIdx 决定（默认 = 现有「向上最近档位」逻辑）。
  let cursorIdx = strat.initCursorIdx(levels, firstClose);

  // 首日底仓买入（以游标档位值成交）；游标指向该档位。
  if (cursorIdx !== -1) {
    const buyLevel = levels[cursorIdx];
    const shares = strat.resolveShares(input, levelCount, buyLevel);
    if (shares > 0 && buyLevel >= input.lowerLimit - 1e-9) {
      const amount = shares * buyLevel;
      const fee = calcFee(input, amount, false);
      if (cash >= amount + fee) {
        cash -= amount + fee;
        holding += shares;
        lots.push({ total: shares, sold: 0, buyLevel }); // 底仓作为一个批次入栈
        operations.push(buildOperation(klines[0].tradeDate, 'BUY', buyLevel, shares, fee, cash, holding));
      } else {
        // 资金不足则放弃建仓，游标回到 -1 表示空仓待跌
        cursorIdx = -1;
      }
    } else {
      cursorIdx = -1;
    }
  }

  // 连续下穿计数（用于 canBuy 钩子的 downStreak 上下文；主循环每根 K 线重置）
  let downStreak = 0;

  let peakTotalAssets = cash; // 用于最大回撤
  let maxDrawdown = 0;

  // 主循环：从第二交易日开始，按"游标 + 虚拟卖出占位"模型逐日判定穿越。
  // 游标 cursorIdx 表示最近一次操作的档位下标（含虚拟卖出）；-1 表示空仓且尚未归位。
  // 每个交易日用 [low, high] 连续判定穿越，单日可穿越多档：
  //   · 上涨穿：high 涨穿游标上一档 levels[cursorIdx+1] → 以该档位"卖出"并游标上移；
  //       若真实持仓 > 0 则实际卖出（cash↑、holding↓），否则记虚拟卖出(virtual)仅占位。
  //   · 下跌穿：low 跌穿游标下一档 levels[cursorIdx-1] → 以该档位真实买入并游标下移。
  // 单日采用"两遍都跑"结构以支持反向震荡：先沿主导方向连续推到尽头，再沿反方向连续推到尽头，
  // 每遍都是单向 while，不会反复重入，故无死循环。主导方向由收盘价在当日区间的位置决定：
  //   close 偏涨（>= 区间中点）→ 先下后上；close 偏跌（< 区间中点）→ 先上后下。
  //   这样游标终点会落在与收盘同向的一侧（偏涨停高位、偏跌停低位）。

  // 单格上涨穿越（返回是否发生）；high 为当日最高价
  const stepUp = (date: string, high: number): boolean => {
    if (cursorIdx >= levelCount - 1) return false;
    if (high < levels[cursorIdx + 1] - 1e-9) return false;
    const sellLevel = levels[cursorIdx + 1];
    if (lots.length === 0) {
      // 空仓无货可卖：记一笔虚拟卖出仅占位（不影响现金/持仓）
      operations.push(buildOperation(date, 'SELL', sellLevel, 0, 0, cash, holding, true));
    } else if (strat.mode === 'full') {
      // 整批卖出型（strategy1/3）：仅当栈顶批次的买入档位已上穿 sellOffset 格才整批弹出。
      // sellOffset=1（strategy1）→ 上穿相邻上一档即卖；sellOffset=2（strategy3）→ 须上穿高两档才卖。
      // 注意：sellOffset 是「档位下标偏移」而非价格偏移，故用 buyLevel 的下标与游标下标比较。
      const top = lots[lots.length - 1];
      const buyIdx = levels.findIndex((lv) => lv >= top.buyLevel - 1e-9);
      if (buyIdx >= 0 && buyIdx + strat.sellOffset <= cursorIdx + 1) {
        const lot = lots.pop() as Lot;
        const soldShares = lot.total;
        holding -= soldShares;
        const amount = soldShares * sellLevel;
        const fee = calcFee(input, amount, true);
        cash += amount - fee;
        operations.push(buildOperation(date, 'SELL', sellLevel, soldShares, fee, cash, holding));
      }
      // 未达 sellOffset 偏移：本次仅游标推进（cursorIdx += 1），不产生任何操作记录。
    } else {
      // 减半型（strategy2）：对所有「已穿越待减」批次（买入档位低于本次卖出档位且尚未卖光）各减仓。
      // 每批分两段：首次穿越卖 floorToLot(total/2)（向下取整到 100 股），之后再穿越则卖剩余 (total - sold) 全清；
      // 例：4.2 买入 2000（已卖半剩 1000）+ 4.4 买入 2000，上穿 4.6 时两批各卖 1000（4.2 批清剩余、4.4 批首次半）。
      let soldAny = false;
      for (let i = lots.length - 1; i >= 0; i--) {
        const lot = lots[i];
        if (lot.buyLevel < sellLevel - 1e-9 && lot.sold < lot.total - 1e-9) {
          const sellShares = strat.sellQuantity(lot);
          lot.sold += sellShares;
          holding -= sellShares;
          const amount = sellShares * sellLevel;
          const fee = calcFee(input, amount, true);
          cash += amount - fee;
          operations.push(buildOperation(date, 'SELL', sellLevel, sellShares, fee, cash, holding));
          soldAny = true;
          if (lot.sold >= lot.total - 1e-9) lots.splice(i, 1); // 卖光则弹出
        }
      }
      if (!soldAny) {
        // 没有任何批次满足「已穿越待减」（如所有批次买入价都 >= sellLevel）：虚拟占位
        operations.push(buildOperation(date, 'SELL', sellLevel, 0, 0, cash, holding, true));
      }
    }
    cursorIdx += 1;
    return true;
  };

  // 单格下跌穿越（返回是否发生）；low 为当日最低价
  const stepDown = (date: string, low: number): boolean => {
    if (cursorIdx <= 0) return false;
    if (low > levels[cursorIdx - 1] + 1e-9) return false;
    const buyLevel = levels[cursorIdx - 1];
    // 买入前置条件（默认无条件买入；未来策略可覆写为如「连跌两格才加仓」）
    if (!strat.canBuy({ input, level: buyLevel, cursorIdx, lots, downStreak })) {
      return false; // 不满足条件则停止该方向推进（游标不变）
    }
    const shares = strat.resolveShares(input, levelCount, buyLevel);
    if (shares > 0 && buyLevel >= input.lowerLimit - 1e-9) {
      const amount = shares * buyLevel;
      const fee = calcFee(input, amount, false);
      if (cash >= amount + fee) {
        cash -= amount + fee;
        holding += shares;
        lots.push({ total: shares, sold: 0, buyLevel }); // 买入一批入栈（LIFO，回升时先进先卖的最低批次）
        operations.push(buildOperation(date, 'BUY', buyLevel, shares, fee, cash, holding));
        cursorIdx -= 1;
        downStreak += 1;
        return true;
      }
      // 资金不足无法买入：停止该方向推进（游标不变）
      return false;
    }
    // 无法估算股数（如档位价异常）：跳过该档继续下推
    cursorIdx -= 1;
    downStreak += 1;
    return true;
  };

  for (let di = 1; di < klines.length; di++) {
    const k = klines[di];
    const close = k.close;
    if (close == null) continue;
    const high = k.high ?? close ?? 0;
    const low = k.low ?? close ?? 0;

    downStreak = 0; // 每根 K 线重置连续下穿计数

    if (cursorIdx !== -1) {
      // 两遍都跑：主导方向由收盘价在当日 [low, high] 区间的位置决定
      const mid = (low + high) / 2;
      const upFirst = close < mid; // 偏涨先下后上；偏跌先上后下
      if (upFirst) {
        while (stepDown(k.tradeDate, low)) {
          /* 向下推到尽头 */
        }
        while (stepUp(k.tradeDate, high)) {
          /* 再向上推到尽头 */
        }
      } else {
        while (stepUp(k.tradeDate, high)) {
          /* 向上推到尽头 */
        }
        while (stepDown(k.tradeDate, low)) {
          /* 再向下推到尽头 */
        }
      }
    }

    // 空仓且游标为 -1 时（首日未建仓/资金不足）：等待下跌穿越最低档建仓
    if (cursorIdx === -1 && holding === 0) {
      const lowest = levels[0];
      if (low <= lowest + 1e-9) {
        const shares = strat.resolveShares(input, levelCount, lowest);
        if (shares > 0) {
          const amount = shares * lowest;
          const fee = calcFee(input, amount, false);
          if (cash >= amount + fee) {
            cash -= amount + fee;
            holding += shares;
            lots.push({ total: shares, sold: 0, buyLevel: lowest }); // 空仓归位买入也作为一个批次入栈
            cursorIdx = 0;
            operations.push(buildOperation(k.tradeDate, 'BUY', lowest, shares, fee, cash, holding));
          }
        }
      }
    }

    // 计算当前总资产（用于最大回撤跟踪）
    const totalAssetsNow = cash + holding * close;
    if (totalAssetsNow > peakTotalAssets) {
      peakTotalAssets = totalAssetsNow;
    }
    if (peakTotalAssets > 0) {
      const drawdown = (peakTotalAssets - totalAssetsNow) / peakTotalAssets;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }

  // 期末指标
  const finalKline = klines[klines.length - 1];
  const finalPrice = finalKline.close ?? 0;
  const finalTotalAssets = cash + holding * finalPrice;
  const totalProfit = finalTotalAssets - input.initialCapital;
  const totalProfitRate = input.initialCapital > 0
    ? (totalProfit / input.initialCapital) * 100
    : 0;

  // 年化收益率（自然日口径）
  const start = new Date(input.startDate).getTime();
  const end = new Date(finalKline.tradeDate).getTime();
  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const annualizedReturn = totalProfitRate > -100
    ? (Math.pow(1 + totalProfitRate / 100, 365 / days) - 1) * 100
    : 0;

  return {
    operations,
    finalCash: cash,
    finalHolding: holding,
    finalPrice,
    finalTotalAssets,
    totalProfit,
    totalProfitRate,
    annualizedReturn,
    maxDrawdown: maxDrawdown * 100,
    tradeCount: operations.length
  };
}

function buildOperation(
  date: string,
  type: 'BUY' | 'SELL' | 'DIVIDEND',
  price: number,
  shares: number,
  fee: number,
  cashAfter: number,
  holdingAfter: number,
  virtual = false
): GridSimulationOperation {
  return {
    date,
    type,
    price,
    shares,
    fee,
    cashAfter,
    holdingAfter,
    holdingValueAfter: holdingAfter * price,
    virtual
  };
}

function buildEmptyResult(
  cash: number,
  holding: number,
  klines: KlineData[]
): GridSimulationResult {
  const finalPrice = klines.length > 0 ? (klines[klines.length - 1].close ?? 0) : 0;
  return {
    operations: [],
    finalCash: cash,
    finalHolding: holding,
    finalPrice,
    finalTotalAssets: cash + holding * finalPrice,
    totalProfit: 0,
    totalProfitRate: 0,
    annualizedReturn: 0,
    maxDrawdown: 0,
    tradeCount: 0
  };
}

export function useGridSimulation() {
  return {
    generateGridLevels,
    calcFee,
    runGridSimulation
  };
}
