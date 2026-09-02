## Why

当前网格交易仿真（`grid-trading-simulation`）已提供两种卖出策略：

- **网格策略1（整批清仓）**：上穿上一级网格时，一次性卖出该档位买入的全部持仓（批次 LIFO 出一整批）。
- **网格策略2（分步减仓）**：上穿上一级网格时，对每个「已穿越待减」批次只卖出其买入量的一半。

用户希望在不改动既有策略的基础上，新增第三种卖出策略：让卖出的触发档位**上移两格**。即：在某一档位买入的批次，不是上穿相邻上一档时卖出，而是**上穿「高两档」**时才卖出。这样每笔交易的价差更大、单笔利润更厚，适合相对更看多、希望拉开盈利空间的场景。

用户给定示例（固定间距 0.2 元、网格 4.2/4.4/4.6/4.8…）：

- 在 4.2 元网格买入的持仓，需等到价格上穿 4.6 元（高两档）时卖出。
- 在 4.4 元网格买入的持仓，需等到价格上穿 4.8 元（高两档）时卖出。

## What Changes

- 在网格仿真参数表单的「网格策略」下拉框中新增第三个选项：
  - **网格策略3（隔两档卖出）**：沿用策略1 的「单批次 LIFO 整批卖出」行为，但卖出触发档位从「高 1 格」变为「高 2 格」——在 `level[i]` 买入的批次，价格上穿 `level[i+2]` 时才整批卖出。
- 后端（`src/composables/useGridSimulation.ts` 的 `runGridSimulation`）将既有 `stepUp` 内的 `if (strategy==='strategy1')...else...` 分派重构为**组合式钩子策略 + strategy1 基准默认**：定义 `GridStrategy` 接口（钩子含 `sellOffset` / `mode` / `sellQuantity` / `resolveShares` / `canBuy` / `initCursorIdx`），以 strategy1 现有实现作为全部钩子的默认基准；每个策略仅声明与 strategy1 不同的钩子，未声明钩子经 `{ ...STRATEGY1, ...覆盖 }` 合并自动回退。stepUp/stepDown/底仓逻辑统一调用 `strat` 钩子、消除 if-else。策略3 仅需声明 `sellOffset: 2`，其余（含买入逻辑）全部继承 strategy1。后续即便新增「买入逻辑也不同」的策略（如 strategy4 覆写 `resolveShares`/`canBuy`），也只需在注册表追加一个差异化对象，主流程零改动。
- 类型 `GridSimulationInput`（`shared/types/index.ts`）字段 `gridStrategy` 由 `'strategy1' | 'strategy2'` 扩展为 `'strategy1' | 'strategy2' | 'strategy3'`（默认仍为 `'strategy1'`）。
- 仿真结果展示沿用现有指标卡片与操作历史表；在「简化假设说明」区补充当前所用策略的说明。

新增策略的卖出规则示例（用户给定）：

- 4.2 元买入 → 上穿 4.6 元卖出（高两档）。
- 4.4 元买入 → 上穿 4.8 元卖出（高两档）。

## Capabilities

### New Capabilities
<!-- 无新增独立能力，本变更是对既有网格仿真能力的扩展 -->

### Modified Capabilities
- `grid-trading-simulation`：在已有的「整批清仓」「分步减仓」两种卖出方式之外，新增第三种「隔两档卖出」方式（单一偏移量为 2 的 LIFO 整批卖出），并由前端下拉框选择。

## Impact

- **代码**：`shared/types/index.ts`（`GridSimulationInput.gridStrategy` 联合类型扩展）、`src/composables/useGridSimulation.ts`（卖出触发偏移量按策略分支）、`src/views/GridSimulationView.vue`（新增下拉选项、结果说明）。
- **数据流**：`GridSimulationInput.gridStrategy` 扩展为三态，经由 `buildInput()` 透传到 `runGridSimulation`，不新增 IPC 通道（保持首版「渲染进程直接计算」的约定）。
- **依赖**：无新增第三方依赖。
- **兼容性**：`gridStrategy` 缺省为 `'strategy1'`，现有调用方与既有仿真结果不受影响；策略1/策略2 行为完全不变。
