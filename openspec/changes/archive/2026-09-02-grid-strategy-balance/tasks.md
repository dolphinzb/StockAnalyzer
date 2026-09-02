## 1. 类型层改动

- [x] 1.1 在 `shared/types/index.ts` 的 `GridSimulationInput.gridStrategy` 由 `'strategy1' | 'strategy2' | 'strategy3'` 扩展为 `'strategy1' | 'strategy2' | 'strategy3' | 'strategy4'`（默认 `'strategy1'`），并在注释中补充策略4 说明（半仓平衡：基于持仓市值与现金偏差动态买卖，阈值 ±10%，不依赖固定批次机械买卖）。

## 2. 仿真引擎改造（customRun 逃生舱 + strategy4 实现）

- [x] 2.1 在 `src/composables/useGridSimulation.ts` 的 `GridSimStrategy` 接口新增可选 `customRun?(input: GridSimulationInput, klines: KlineData[]): GridSimulationResult` 钩子。
- [x] 2.2 在 `runGridSimulation` 中，取得 `strat`（合并 STRATEGY1 + GRID_STRATEGIES[key]）后，若 `strat.customRun` 存在则直接 `return strat.customRun(input, klines)`；strategy1/2/3 不声明 `customRun`，行为不变。
- [x] 2.3 实现 `runBalanceGridSimulation(input, klines)`：**不调用 `generateGridLevels`、不维护档位游标**；初始化 `cash=initialCapital`、`holding=0`、`operations=[]`；逐日（含首日）遍历 K 线，以**当日收盘价**触发一次平衡再评估（单日最多一笔操作）；平衡算法按 design.md D2 计算 `availableCash / targetValue / deviation%`，超过 ±10% 时按 `floorToLot` 计算买卖股数并调用 `calcFee` 记账；不生成 `virtual` 记录。
- [x] 2.4 在 `GRID_STRATEGIES` 注册 `strategy4: { customRun: runBalanceGridSimulation }`（其余钩子经 `{ ...STRATEGY1 }` 合并但被忽略）。
- [x] 2.5 校验结果自洽：期末总资产 = `cash + holding × finalPrice`；`holding === Σ买入股数 − Σ卖出股数`；`operations` 中 BUY/SELL 的 `cashAfter/holdingAfter/holdingValueAfter` 与状态一致（由单测断言）。

## 3. 前端页面

- [x] 3.1 在 `src/views/GridSimulationView.vue` 表单「网格策略」`<select>` 新增 `<option value="strategy4">网格策略4（半仓平衡）</option>`；`form.gridStrategy` 类型扩展为四态；选中 strategy4 时**隐藏网格专属参数**（上限/下限/间距/间距类型/每格股数）并显示说明；hint 注明「基于持仓市值与现金偏差（±10%）动态买卖，不依赖网格」。
- [x] 3.2 在结果区「简化假设说明」卡片的当前策略分支补充 strategy4 文案（如「网格策略4（半仓平衡）」并注明算法语义）。

## 4. 验证

- [x] 4.1 在 `tests/grid-simulation.test.ts` 新增策略4 用例：覆盖「首日建底仓」「持仓过多触发卖出（高价股上涨）」「单日最多一笔操作（按日评估）」「不生成 virtual 记录」「与策略1/2/3 互不干扰」等场景，并断言 `GridSimulationResult` 字段自洽。
- [x] 4.2 运行类型检查（`npx tsc --noEmit` 无报错通过）与单元测试（`npx vitest run` 14/14 通过）；strategy1/2/3 向后兼容回归通过。
