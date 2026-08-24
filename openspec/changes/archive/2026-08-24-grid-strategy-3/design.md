# 设计文档：网格策略3（隔两档卖出）

## Context

既有 `runGridSimulation`（位于 `src/composables/useGridSimulation.ts`）已实现两套卖出策略，核心差异在于**上涨穿越（stepUp）**时的处理：

- **策略1**：栈顶批次（在 `level[i]` 买入）在价格上穿 `level[i+1]`（高 1 格）时整批 LIFO 卖出。
- **策略2**：所有「已穿越待减」批次在价格上穿 `level[i+1]`（高 1 格）时各卖一半。

批次状态由 `lots: Array<{ total: number; sold: number; buyLevel: number }>` 维护，`buyLevel` 记录该批次的买入档位索引。档位数组 `levels` 升序排列，`step = levels[1] - levels[0]`（固定间距下恒定；百分比等比下 `levels[i+1] = levels[i] * (1 + stepPct)`）。

新策略3 的需求并不改变「单次卖出数量」（仍整批），而是把**触发卖出的档位从「高 1 格」改为「高 2 格」**。因此最自然的实现是引入一个「卖出触发偏移量」`sellOffset`：

| 策略 | sellOffset | 卖出数量逻辑 |
| --- | --- | --- |
| strategy1 | 1 | 栈顶批次整批 |
| strategy2 | 1 | 所有待减批次各卖一半 |
| strategy3 | 2 | 栈顶批次整批 |

策略3 在「数量逻辑」上与策略1 完全一致（LIFO 整批），区别仅在 `sellOffset = 2`。

## 关键设计决策

### 1. 采用策略模式（组合式钩子 + strategy1 基准默认）而非 if-else 分派

用户指出：`stepUp` 当前以 `if (strategy==='strategy1') ... else ...` 分派，每新增一个策略就再加 `else if`，卖出逻辑与策略分派耦合，后续扩展性差。本变更将「一次穿越时如何买卖」抽象为**策略对象**，避免分派散落在 `stepUp` / `stepDown` / 底仓逻辑内部。

但**不采用「每种策略一个完整类」的经典策略模式**——因为三种策略的买入、费用、虚拟占位、游标推进、主循环完全共享，若每策略一个类会大量复制样板。**原则：把 strategy1 的现有实现作为所有钩子的默认基准实现；每个策略只需声明「与 strategy1 不同的钩子」，未声明的钩子一律回退到 strategy1 的行为。** 这样：

- 不存在任何「必填 / 可选」的分类负担——所有钩子都有默认（=strategy1）。
- 新增 strategy4/5 若买入逻辑也不同，只需覆写对应买入钩子，其余继承 strategy1，绝不会因漏写钩子而行为崩坏（最坏情况 = 退化成 strategy1）。
- 策略注册表是纯粹的「差异化声明」，可读性与可扩展性最佳。

#### 1.1 钩子定义（每个钩子默认实现 = strategy1 现有逻辑）

策略对象持有若干**正交钩子**，每个钩子若未显式给出，则由 `runGridSimulation` fallback 到 strategy1 的同名实现：

| 钩子 | 含义 | strategy1 默认实现（基准） |
| --- | --- | --- |
| `sellOffset` | 整批卖出型触发所需的档位偏移（`buyLevel + sellOffset` 才触发） | `1` |
| `mode` | 卖出数量模式：`'full'`（栈顶整批）/ `'half'`（待减批次逐批减半） | `'full'` |
| `sellQuantity(lot)` | 单批次本次应卖股数 | `lot.total`（整批） |
| `resolveShares(input, levelCount, price)` | 买入股数计算 | 现有 `resolveShares`（固定股数 / 初始资金均摊） |
| `canBuy(ctx)` | 下跌穿越时是否允许建仓的前置条件 | `() => true`（无条件买入） |
| `initCursorIdx(levels, firstClose)` | 首日底仓建仓的游标定位 | 现有「向上最近档位」逻辑（第140-148行） |

> 逃生舱（极端范式）：若某策略连主循环都不同（如马丁格尔、硬止损），可在策略对象上挂可选 `customRun?(input, klines)`，此时完全接管内部循环。**本变更不实现 `customRun`，仅在文档中作为扩展点预留**，等真出现再加。

#### 1.2 注册表示例

```ts
// 基准：strategy1 的全部钩子
const STRATEGY1: GridStrategy = {
  sellOffset: 1,
  mode: 'full',
  sellQuantity: (l) => l.total,
  // resolveShares / canBuy / initCursorIdx 不写，fallback 到默认（=strategy1 现有逻辑）
};
// 策略2：仅覆写卖出三件套（减半两段）
const STRATEGY2: GridStrategy = {
  ...STRATEGY1,
  mode: 'half',
  sellQuantity: (l) => (l.sold === 0 ? floorToLot(l.total / 2) : l.total - l.sold),
};
// 策略3：仅覆写 sellOffset=2，卖出模式与买入全部继承 strategy1
const STRATEGY3: GridStrategy = {
  ...STRATEGY1,
  sellOffset: 2,
};
// 未来 strategy4（买入逻辑也不同）：覆写买入钩子，其余继承 strategy1
// const STRATEGY4: GridStrategy = {
//   ...STRATEGY1,
//   resolveShares: myPyramidShares,
//   canBuy: (ctx) => ctx.downStreak >= 2,
// };

const GRID_STRATEGIES = { strategy1: STRATEGY1, strategy2: STRATEGY2, strategy3: STRATEGY3 };
```

`runGridSimulation` 开头按 `input.gridStrategy ?? 'strategy1'` 取出 `strategy` 对象，并把未声明的钩子与 STRATEGY1 合并（`const strat = { ...STRATEGY1, ...GRID_STRATEGIES[key] }`）；后续 stepUp / stepDown / 底仓逻辑只调用 `strat.xxx` 钩子，不再写 if-else。

`runGridSimulation` 开头按 `input.gridStrategy ?? 'strategy1'` 取出 `strategy` 对象；后续 stepUp 不再写 if-else，只调用 `strat.sellOffset` / `strat.mode` / `strat.sellQuantity(lot)`。

**扩展收益**：新增第 4、5 个策略时，只需在 `GRID_STRATEGIES` 注册一个新对象（并可顺带在 `GridSimulationInput.gridStrategy` 联合类型追加字面量），`stepUp` 与 `runGridSimulation` 主流程**零改动**；单测也只需新增注册 + 场景，符合开闭原则。

### 2. stepUp / stepDown / 底仓改造为基于策略对象（全部回退 strategy1 默认）

所有分支不再内嵌 `if (strategy===...)`，统一调用 `strat` 钩子；未声明的钩子已在合并时回退到 STRATEGY1（=现有 strategy1 逻辑）：

- **stepUp（卖出）**：
  - 空仓（`lots.length === 0`）：记虚拟卖出占位（所有策略一致）。
  - `mode === 'full'`（strategy1/3）：栈顶批次 `buyLevel + strat.sellOffset <= cursorIdx + 1` 才触发整批卖出（即 `levels[cursorIdx+1]` 已上穿 `buyLevel + strat.sellOffset` 档）。未达偏移则本次不产生真实卖出。
  - `mode === 'half'`（strategy2）：遍历所有「已穿越待减」批次（`buyLevel < sellLevel` 且 `sold < total`），按 `strat.sellQuantity(lot)` 减仓，卖光则弹出；无批次满足则虚拟占位。
- **stepDown（买入）**：在 `lots.push` 前调用 `strat.canBuy(ctx)` 作为前置条件；股数计算改为 `strat.resolveShares(input, levelCount, buyLevel)`（默认 = 现有 `resolveShares`）。
- **首日底仓**：游标定位改为 `strat.initCursorIdx(levels, firstClose)`（默认 = 现有「向上最近档位」逻辑）。

> 说明：游标仍每天最多推进 1 档（保守模型），故「整批触发偏移」表现为栈顶批次需多等 `sellOffset - 1` 个上穿日才成交，与策略1 行为平滑衔接。

### 3. 触发档位偏移与游标推进的关系

为保持与既有「单日游标最多推进 1 档」的保守模型一致（路径 A），**不改为「直接比较当前价与 `levels[buyLevel + sellOffset]`」**（路径 B，会破坏保守成交模型）。

在 `mode === 'full'` 下，stepUp 每次把游标上移 1 档（`cursorIdx += 1`）后，判断栈顶批次 `buyLevel` 是否满足 `buyLevel + strategy.sellOffset <= cursorIdx`：

- 策略1（`sellOffset=1`）：上移 1 档即满足，等价于「高 1 格触发」，与现状完全一致。
- 策略3（`sellOffset=2`）：需游标再多上移 1 档（即次日再上穿一档）才满足，等价于「高 2 格触发」。

这样策略1/策略3 复用同一段 `full` 逻辑，仅差一个 `sellOffset` 常量，`runGridSimulation` 主流程零改动；策略2 走独立的 `half` 分支，与偏移量无关。

### 4. 边界与虚拟卖出

- 当某批次 `buyLevel + sellOffset` 超过 `levels` 上限（即最高档之上无更高档可触发）：回归既有虚拟卖出占位分支——`lots.length === 0` 时仍按价格上穿记录一条 `virtual` SELL（数量 0），保持期末持仓一致。
- 若栈顶批次尚未达到 `buyLevel + sellOffset`，即使游标因单日大跳空已越过该档，也按保守模型每日仅推进 1 档、对应只处理相邻档，行为与其他策略一致。

### 5. 类型与前端

- `shared/types/index.ts`：`gridStrategy?: 'strategy1' | 'strategy2' | 'strategy3'`。
- `src/views/GridSimulationView.vue`：`form.gridStrategy` 类型扩展为 `'strategy1' | 'strategy2' | 'strategy3'`，下拉新增 `<option value="strategy3">网格策略3（隔两档卖出）</option>`，并在 hint 中说明「在 4.2 买入→上穿 4.6 卖出；在 4.4 买入→上穿 4.8 卖出」；结果区「简化假设说明」当前策略文案补充 strategy3 分支。

## 示例推演（用户给定，固定间距 0.2，网格 4.2/4.4/4.6/4.8/5.0）

| 日期 | 价格 | 触发 | 策略3 动作 |
| --- | --- | --- | --- |
| D1 | 4.2 | 下穿 4.2 | 买入 4.2 批次（lotA, buyLevel=索引对应 4.2） |
| D2 | 4.4 | 上穿 4.4 | cursorIdx 进 1；lotA 需 `buyLevel + 2` 才触发 → 不卖，持有 |
| D3 | 4.6 | 上穿 4.6 | lotA 满足 `buyLevel + 2` → 整批卖出 lotA（成交价 4.6） |
| D4 | 4.4 | 下穿 4.4 | 买入 4.4 批次（lotB, buyLevel=对应 4.4） |
| D5 | 4.6 | 上穿 4.6 | cursorIdx 进 1；lotB 需 +2 → 不卖 |
| D6 | 4.8 | 上穿 4.8 | lotB 满足 `buyLevel + 2` → 整批卖出 lotB（成交价 4.8） |

与策略1 对比：策略1 在 D2（4.4）即卖出 lotA、D5（4.6）即卖出 lotB；策略3 把卖出推迟并放大价差至两格，单笔收益更高、交易更少。

## 风险与权衡

- **模型一致性**：策略3 改变卖出触发档位，但完全复用既有买入、费用、虚拟占位与游标推进逻辑，不改变保守成交模型，避免引入新的边界 Bug。
- **最高档之上**：`buyLevel + 2` 可能越界到 `levels` 之外（如最高档买入后无法再上穿两档），此时该批次直到期末仍持有（符合「未触发不卖」语义），并通过虚拟卖出分支保证统计自洽。
- **向后兼容**：`gridStrategy` 默认 `'strategy1'`，既有调用与单测不受影响。
