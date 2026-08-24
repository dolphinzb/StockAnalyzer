## 1. 类型层改动

- [x] 1.1 在 `shared/types/index.ts` 的 `GridSimulationInput` 增加 `gridStrategy?: 'strategy1' | 'strategy2'` 字段（默认 `'strategy1'`），并在 Key Entities 文档表中补充说明。

## 2. 仿真引擎改造

- [x] 2.1 在 `src/composables/useGridSimulation.ts` 将 `lots: number[]` 改为 `lots: Array<{ total: number; sold: number; buyLevel: number }>`；买入（`stepDown` / 首日底仓 / 空仓归位买入）改为 `lots.push({ total: shares, sold: 0, buyLevel })`；`holding` 维持同步（买入 +shares、卖出 -soldAmount）。
- [x] 2.2 改造 `stepUp`：依据 `input.gridStrategy` 分支——策略1 维持 `lots.pop()` 整批卖出（仅栈顶一批）；策略2 遍历栈中**所有**「已穿越待减」批次（买入档位 `buyLevel < sellLevel` 且 `sold < total - 1e-9`），每批各卖 `floorToLot((total - sold)/2)`（最后一轮取 `total - sold` 兜底），为该批生成一条 SELL 记录、`sold += 卖出量`、`holding -= 卖出量`，卖光的批次 `splice` 弹出；若无任何批次满足「已穿越待减」则走虚拟卖出占位分支；`cursorIdx += 1` 不变。
- [x] 2.3 校验 `holding === Σ(total - sold)` 自洽，确保期末持仓与操作历史一致（含虚拟卖出仍走 `lots.length === 0` 分支）。

## 3. 前端页面

- [x] 3.1 在 `src/views/GridSimulationView.vue` 表单新增「网格策略」`<select>`（网格策略1 / 网格策略2），默认 `strategy1`；`form` 增加 `gridStrategy` 字段并在 `buildInput()` 透传。
- [x] 3.2 在结果区「简化假设说明」卡片补充当前策略说明（如「当前策略：网格策略2（分步减仓）」）。

## 4. 验证

- [x] 4.1 在 `tests/` 新增/扩展单测：覆盖策略2 单批次示例（4.2 买 2000 → 4.4 卖 1000 → 4.6 卖剩余 1000）、**跨批次同时减半**（4.2 买 2000 已卖半 + 4.4 买 2000，上穿 4.6 时两批各卖一半），以及策略1 向后兼容、空仓虚拟占位回归。
- [x] 4.2 启动本地构建/类型检查，确认无 TS 报错；`npm run build`（或等效）通过。
