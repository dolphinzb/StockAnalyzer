## 1. 类型层改动

- [x] 1.1 在 `shared/types/index.ts` 的 `GridSimulationInput.gridStrategy` 由 `'strategy1' | 'strategy2'` 扩展为 `'strategy1' | 'strategy2' | 'strategy3'`（默认 `'strategy1'`），并在注释中补充策略3 说明（隔两档卖出：在 `level[i]` 买入、上穿 `level[i+2]` 时整批卖出）。

## 2. 仿真引擎改造（组合式钩子 + strategy1 基准默认）

- [x] 2.1 在 `src/composables/useGridSimulation.ts` 定义 `GridSimStrategy` 接口（避免与 DB 实体 `GridStrategy` 重名），钩子含：`sellOffset`、`mode`（`'full'|'half'`）、`sellQuantity(lot)`、`resolveShares(input, levelCount, price)`、`canBuy(ctx)`、`initCursorIdx(levels, firstClose)`；并定义基准 `STRATEGY1`（全部采用现 strategy1 逻辑），`GRID_STRATEGIES` 注册表用 `{ ...STRATEGY1, ...覆盖 }` 方式定义 strategy2（`mode:'half'` + 减半 `sellQuantity`）、strategy3（`sellOffset:2`）。将既有 `stepUp` 内 `if (strategy==='strategy1')...else...` 分派替换为 `{ ...STRATEGY1, ...GRID_STRATEGIES[key] }` 合并取 `strat`，消除 if-else。
- [x] 2.2 改造 stepUp / stepDown / 底仓为调用 `strat` 钩子：`mode==='full'` 时栈顶批次的买入档位下标 + `sellOffset` <= 游标下标+1 才整批弹出；`mode==='half'` 时遍历待减批次按 `strat.sellQuantity` 减仓；stepDown 在买入前调用 `strat.canBuy(ctx)`、股数用 `strat.resolveShares`；首日底仓游标用 `strat.initCursorIdx`。未声明的钩子已合并回退 STRATEGY1，故 strategy3 仅需声明 `sellOffset:2`。
- [x] 2.3 校验 `holding === Σ(total - sold)` 自洽；最高档之上无触发档时回归虚拟卖出占位分支，保证期末持仓与操作历史一致。
- [x] 2.4 扩展验证：在 `GRID_STRATEGIES` 以注释形式提供仅覆写买入钩子的 `strategy4` 示例，证明买入逻辑不同也能接入且主流程零改动；单测新增「漏写 gridStrategy 回退 strategy1」与「买入/卖出解耦主流程稳定」用例，确认防崩坏（开闭原则）。

## 3. 前端页面

- [x] 3.1 在 `src/views/GridSimulationView.vue` 表单「网格策略」`<select>` 新增 `<option value="strategy3">网格策略3（隔两档卖出）</option>`；`form.gridStrategy` 类型扩展为三态；hint 注明「4.2 买入→上穿 4.6 卖出；4.4 买入→上穿 4.8 卖出」；`buildInput()` 透传新值。
- [x] 3.2 在结果区「简化假设说明」卡片的当前策略分支补充 strategy3 文案（如「网格策略3（隔两档卖出）」）。

## 4. 验证

- [x] 4.1 在 `tests/grid-simulation.test.ts` 新增策略3 用例：覆盖单批次示例（4.2 买 → 上穿 4.4 不卖 → 上穿 4.6 整批卖）、跨批次示例（4.4 买 → 上穿 4.8 整批卖），以及策略1/2 向后兼容回归。
- [x] 4.2 运行类型检查与构建（`npx tsc --noEmit` 与 `npm run build`），确认无 TS 报错通过。
