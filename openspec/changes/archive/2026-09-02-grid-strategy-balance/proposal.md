## Why

当前网格交易仿真（`grid-trading-simulation`）支持的三种策略（整批清仓 / 分步减仓 / 隔两档卖出）都基于同一底层模型：价格穿越固定网格档位时，按 LIFO 批次栈机械地整批或半批买卖。

用户在 GridView 页面另有一种成熟的网格算法——**持仓市值与现金平衡（半仓平衡）**：始终让「持仓市值」逼近「可用资金」的一半，两者偏差不超过一定阈值（±10%）才触发买卖；买入/卖出数量由「当前持仓 vs 目标持仓（= 可用资金/2 ÷ 当前价）」动态差额决定，而非固定档位的一整批。

用户希望在仿真中也新增这一策略，让其在历史 K 线上得到回测对照，复用 GridView 的半仓平衡算法语义。

## What Changes

- 在网格仿真「网格策略」下拉框中新增第四个选项：**网格策略4（半仓平衡）**。
  - **完全不依赖网格**：没有网格间距、没有固定档位、不维护批次栈。评估节奏为**逐日（含首日）以当日收盘价**做一次半仓再平衡，单日最多一笔操作。
  - 买入：仅在「可用资金 − 持仓市值」偏离为正且超过阈值（持仓不足）时，按 `目标持仓股数 − 当前持仓股数` 买入（取整到 100 股、受可用资金约束）。
  - 卖出：仅在「持仓市值 − 可用资金」偏离为正且超过阈值（持仓过多）时，按差额卖出（取整到 100 股、受当前持仓约束）。
  - 目标持仓股数 = `floor((可用资金/2) / 当日收盘价)`；可用资金 = `现金 + 持仓市值`（与 GridView `availableCash` 语义一致）。
- 类型 `GridSimulationInput.gridStrategy`（`shared/types/index.ts`）由 `'strategy1' | 'strategy2' | 'strategy3'` 扩展为追加 `'strategy4'`（默认仍为 `'strategy1'`）。
- 仿真引擎（`src/composables/useGridSimulation.ts`）：在 `GridSimStrategy` 接口新增可选 `customRun` 钩子（design.md 已预留的「极端范式逃生舱」）；策略4 使用该钩子完全接管内部循环（仅复用 `calcFee`/`floorToLot` 工具，不调用 `generateGridLevels`、不维护档位游标），主流程 `runGridSimulation` 在取到 `strat.customRun` 时直接委托、零 if-else 分派改动。其余策略（strategy1/2/3）完全不变。
- 前端 `src/views/GridSimulationView.vue` 新增下拉选项与「简化假设说明」文案；选中 strategy4 时隐藏网格专属参数（上限/下限/间距/间距类型/每格股数）；`buildInput()` 透传新值。
- 结果展示复用现有指标卡片与操作历史表，无新增字段。

## Capabilities

### New Capabilities

<!-- 本变更不引入独立新能力；是对既有网格仿真能力的扩展，故无 New Capabilities -->

### Modified Capabilities
- `grid-trading-simulation`：在已有的「整批清仓」「分步减仓」「隔两档卖出」三种方式之外，新增第四种「半仓平衡」方式（基于持仓市值与现金偏差动态决定买卖，而非固定档位批次机械买卖），并由前端下拉框选择。

## Impact

- **代码**：`shared/types/index.ts`（`gridStrategy` 联合类型扩展）、`src/composables/useGridSimulation.ts`（`GridSimStrategy` 新增 `customRun` 逃生舱 + `runBalanceGridSimulation` 实现 + 注册 `strategy4`）、`src/views/GridSimulationView.vue`（下拉选项与说明文案）。
- **数据流**：`GridSimulationInput.gridStrategy` 扩展为四态，经由 `buildInput()` 透传到 `runGridSimulation`，不新增 IPC 通道（保持首版「渲染进程直接计算」约定）。
- **依赖**：无新增第三方依赖。
- **兼容性**：`gridStrategy` 缺省为 `'strategy1'`，现有调用方与既有仿真结果不受影响；策略1/2/3 行为完全不变。策略4 通过 `customRun` 逃生舱接入，主流程分派逻辑零改动（开闭原则）。
