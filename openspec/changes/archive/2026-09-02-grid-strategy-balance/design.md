## Context

网格交易仿真（`grid-trading-simulation`）目前支持三种策略，均建立在同一个底层模型上：

- **固定网格档位 + LIFO 批次栈**：价格穿越某档位时，按买入批次机械地整批（strategy1/3）或半批（strategy2）买卖。

而 GridView 页面的成熟算法是 **持仓市值与现金平衡（半仓平衡）**：

- 目标持仓金额 = `可用资金 / 2`（即让持仓市值趋近可用资金的一半）。
- 偏差% = `(可用资金 − 持仓市值) / 可用资金 × 100`；仅当 `|偏差| > 阈值(默认 10%)` 才触发买卖。
- 买入数量由「目标持仓股数 − 当前持仓股数」动态算出，卖出同理——**不是**固定批次的一整批。

用户希望在仿真中加入这一策略。但半仓平衡算法的买卖语义（动态目标持仓、与现金对比）与「固定档位 LIFO 批次栈」模型存在本质差异：它的触发不是「穿越即整批买卖」，而是「穿越档位时检查一次平衡、按需动态买卖」。

为此 design.md（2026-08-24-grid-strategy-3）已明确预留「逃生舱」：`GridSimStrategy` 可声明 `customRun(input, klines)` 钩子，由 `runGridSimulation` 在取到该钩子时完全委托、**其余钩子全部忽略**、主流程零分派改动。本变更即利用此逃生舱实现 strategy4，避免污染既有的 strategy1/2/3 逻辑。

## Goals / Non-Goals

**Goals:**
- 在仿真中新增「网格策略4（半仓平衡）」，复刻 GridView 半仓平衡算法的语义。
- 复用现有网格生成（`generateGridLevels`）、费用（`calcFee`）、取整（`floorToLot`）等工具与结果展示。
- 通过 `customRun` 逃生舱接入，主流程 `runGridSimulation` 分派逻辑零改动（开闭原则）。
- strategy1/2/3 行为完全不变，向后兼容。

**Non-Goals:**
- 不改动 GridView 页面本身或其算法。
- 不引入新的网格生成范式；策略4 完全不依赖网格（无网格间距、无档位、无批次栈）。
- 不新增 IPC 通道或数据库写入。
- 不实现分红（保持首版预留忽略）。

## Decisions

### D1：按日收盘评估，完全不依赖网格
半仓平衡策略本身没有「网格间距」「固定档位」「每格买卖量」概念：它的买卖数量完全由「目标持仓（=可用资金/2）− 当前持仓」的动态差额决定。因此策略4 在仿真中**不调用 `generateGridLevels`、不维护档位游标、不产生虚拟卖出**。

评估节奏：遍历每一根日 K 线，以**当日收盘价**调用一次 `rebalanceAt` 做半仓再平衡。这与 GridView「每次价格变动后检查一次平衡」的精神一致，且语义最纯粹——用户无需为策略4 填写任何网格参数。

- **理由**：半仓平衡的买卖逻辑与网格无关，保留网格只会造成「填了 spacing 却不影响买卖量」的语义错位。按日收盘评估既简单又与 GridView 同构（GridView 也是在每个评估点用当前价算一次 `computeRebalance`）。
- **替代方案**：以网格档位穿越作为「再评估检查点」、spacing 变成「再平衡灵敏度」。被否决——引入隐蔽的语义错位，且单日可能多次穿越触发多次买卖，反而偏离「半仓平衡」本身。

### D2：可用资金语义对齐 GridView
`availableCash = 初始资金 − 当前持仓总成本 + 持仓市值`（= `initialCapital + 累计已实现盈亏 − 当前持仓总成本`）。

- `availableCash`：当前现金 `cash` 加上持仓市值 `holding × price`。
- `targetValue = availableCash / 2`。
- `holdingValue = holding × price`。
- `deviation% = (availableCash − holdingValue) / availableCash × 100`。
- 买入条件：`deviation% > threshold`（持仓不足）→ 目标股数 `floor(targetValue / price)`，`buyShares = floorToLot(targetShares − holding)`，受 `buyShares × price + fee <= cash` 约束。
- 卖出条件：`deviation% < −threshold`（持仓过多）→ `sellShares = floorToLot(holding − floor(targetValue / price))`，受 `sellShares <= holding` 约束。
- **理由**：与 GridView `computeRebalance` 完全同构（`adjustAmount = availableCash/2 − holdingValue`），保证算法语义一致。

### D3：通过 `customRun` 逃生舱实现，主流程零分派改动
在 `GridSimStrategy` 接口新增可选 `customRun?(input, klines): GridSimulationResult`。`runGridSimulation` 开头：
```ts
const strat = { ...STRATEGY1, ...GRID_STRATEGIES[input.gridStrategy] };
if (strat.customRun) return strat.customRun(input, klines);
```
`runBalanceGridSimulation` 作为 strategy4 的 `customRun` 实现，独立维护 `cash/holding/operations` 状态、调用 `calcFee` + `floorToLot`（不调用 `generateGridLevels`），逐日（含首日）以收盘价做一次半仓再平衡，产出与 `runGridSimulation` 同构的 `GridSimulationResult`。

- **理由**：半仓平衡的买卖逻辑无法套进固定档位 LIFO 批次栈的 `sellQuantity`/`mode` 钩子（它要卖到「目标持仓总额」而非单个批次的一半/全部）。逃生舱让极端范式独立成函数，不污染主流程闭包。
- **替代方案**：强行把半仓逻辑塞进 `stepUp/stepDown` 钩子。被否决——需要在 `sellQuantity`、`canBuy`、`resolveShares` 上做大量 hack，且 `stepUp` 的批次栈语义与「卖到目标持仓」天然冲突，易引发回归。

### D4：不维护网格档位游标、不生成虚拟卖出、每日最多一次评估
strategy4 完全不维护 LIFO 批次栈、档位游标与虚拟卖出占位（它基于总持仓与目标持仓差额，而非批次与档位）。主循环按日遍历 K 线，每日仅以收盘价调用一次 `rebalanceAt`，因此**单个交易日最多产生一笔操作**，不存在「单日两遍穿越触发多次买卖」的情形。由于首日即以收盘价评估、偏差=100% 必然建底仓，策略4 不会以空仓起始，也就无需虚拟卖出占位。

- **理由**：与「按日评估、不依赖网格」（D1）一致；保持操作历史干净（不生成无意义的虚拟记录），且单日单笔的语义更直观、更易与 GridView 对照。

## Risks / Trade-offs

- **[风险] 半仓平衡在强趋势市中可能与固定网格行为差异大** → 缓解：在「简化假设说明」明确标注策略4 采用动态平衡而非固定批次，用户可自行对照。
- **[风险] 阈值（10%）无法在 UI 配置** → 缓解：首版硬编码 `BALANCE_THRESHOLD = 0.1`，与 GridView 默认一致；后续可如 strategy1 的费率一样在 input 中扩展。不纳入本变更范围。
- **[风险] `customRun` 实现与 `runGridSimulation` 结果结构不一致** → 缓解：单测断言 `GridSimulationResult` 各字段自洽（期末总资产 = cash + holding×price；holding === Σ买入 − Σ卖出）。
- **[权衡] 按日收盘评估会丢失盘中极端波动带来的再平衡机会** → 接受：与 GridView 的每日评估节奏一致，且语义清晰；若后续需要盘中粒度，可在 `rebalanceAt` 调用点扩展为 `[low, high]` 区间采样，不破坏现有结构。

## Migration Plan

- 纯新增策略 + 类型联合扩展，缺省 `'strategy1'`，无破坏。
- 部署：随下次构建发布；无需数据库迁移、无需回滚脚本。
- 回滚：移除 `GRID_STRATEGIES.strategy4` 与 `customRun` 委托行、回退 `gridStrategy` 联合类型即可。

## Open Questions

- 是否需要在 UI 暴露 `BALANCE_THRESHOLD`（平衡阈值）配置项？首版沿用 GridView 默认的 10%，暂不在本变更暴露。
