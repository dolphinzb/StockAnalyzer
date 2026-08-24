## Why

当前网格交易仿真（`grid-trading-simulation`）只提供一种卖出策略：股价上穿上一级网格时，一次性卖出该档位买入的全部持仓（批次 LIFO 出一整批）。用户希望在不改动既有策略的基础上，新增一种"分步减仓"的卖出策略，以应对震荡上行行情——先卖一半锁定部分利润，再涨再清另一半，降低单次清仓后踏空的风险。

## What Changes

- 在网格仿真参数表单新增「网格策略」下拉框，提供两个选项：
  - **网格策略1**（现有策略，默认）：上穿上一级网格时，卖出该档位买入的全部持仓（保持现状）。
  - **网格策略2**（新增）：上穿上一级网格时只卖出该档位买入的一半；当股价再上穿更高一级网格时，卖出剩余的半仓。
- 后端（`src/composables/useGridSimulation.ts` 的 `runGridSimulation`）支持按策略分支计算：策略2 继承策略1 的买入、档位生成、费用、虚拟卖出占位等全部逻辑，仅改造上涨卖出的"减仓比例"。
- 类型 `GridSimulationInput`（`shared/types/index.ts`）新增字段 `gridStrategy: 'strategy1' | 'strategy2'`（默认 `'strategy1'`）。
- 仿真结果展示沿用现有指标卡片与操作历史表；在"简化假设说明"区补充当前所用策略的说明。

新增策略的卖出规则示例（用户给定）：在 4.2 元网格买入 2000 股，股价上穿 4.4 元时卖出 1000 股，上穿 4.6 元时再卖出剩余 1000 股。

## Capabilities

### New Capabilities
<!-- 无新增独立能力，本变更是对既有网格仿真能力的扩展 -->

### Modified Capabilities
- `grid-trading-simulation`：新增第二种网格卖出策略（分步减仓），网格仿真的"卖出触发行为"需求发生变化——除原有的"整批清仓"外，新增"分两次各卖一半"的档位卖出方式，并由前端下拉框选择。

## Impact

- **代码**：`shared/types/index.ts`（`GridSimulationInput`）、`src/composables/useGridSimulation.ts`（卖出逻辑分支）、`src/views/GridSimulationView.vue`（新增下拉框与表单字段、结果说明）。
- **数据流**：`GridSimulationInput` 新增可选字段 `gridStrategy`，经由 `buildInput()` 透传到 `runGridSimulation`，不新增 IPC 通道（保持首版"渲染进程直接计算"的约定）。
- **依赖**：无新增第三方依赖。
- **兼容性**：`gridStrategy` 缺省为 `'strategy1'`，旧调用方与现有行为一致，不会破坏既有仿真结果。
