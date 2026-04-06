# Tasks: 网格交易计算页面

**Feature**: 008-grid-trading
**Generated**: 2026-04-06
**User Stories**: 4 (US1, US2, US3, US4)
**Total Tasks**: 12

## Phase 1: 基础设置

- [ ] T001 添加 TypeScript 类型定义，在 `src/types.ts` 添加 Position、PositionResult、OpenResult、CalculatePositionInput、CalculateOpenInput 类型
- [ ] T002 创建网格计算服务，在 `electron/services/gridService.ts` 实现 calculatePosition() 和 calculateOpen() 函数，包含网格计算常量（GRID_TARGET_RATIO = 0.5, GRID_DEVIATION_THRESHOLD = 10, MIN_TRADE_UNIT = 100）

## Phase 2: 交易计算 (US1)

- [ ] T003 [P] [US1] 创建网格交易页面组件，在 `src/views/GridView.vue` 实现页面布局，包含标题栏和标签页容器
- [ ] T004 [P] [US1] 创建交易计算表单组件，在 `GridView.vue` 中实现交易计算表单，包含选择持仓股票下拉框、总金额输入框、当前股价输入框、当前持仓数量输入框、持仓均价输入框
- [ ] T005 [P] [US1] 实现持仓股票选择功能，在 GridView.vue 中添加 holdingList ref 和 onStockChange 方法，从 trade_record 表获取持仓列表，选择后自动填充持仓数量和均价
- [ ] T006 [US1] 实现交易计算功能，在 GridView.vue 中添加 calculate() 方法，调用 gridService.calculatePosition()，显示计算结果（当前持仓、目标持仓、调整建议）
- [ ] T007 [US1] 实现浮动盈亏计算，在 GridView.vue 中添加 computedProfit 和 computedProfitRate computed 属性，根据持仓市值和持仓成本计算
- [ ] T008 [US1] 实现偏差显示和提示，根据偏差百分比显示警告或成功提示，使用 useToast 显示消息

## Phase 3: 开仓计算 (US2)

- [ ] T009 [P] [US2] 创建开仓计算表单，在 `GridView.vue` 中实现开仓计算表单，包含总金额输入框、开仓股价输入框
- [ ] T010 [P] [US2] 实现开仓计算功能，在 GridView.vue 中添加 calculateOpen() 方法，调用 gridService.calculateOpen()，显示计算结果

## Phase 4: 重置功能 (US3)

- [ ] T011 [US3] 实现重置功能，在 GridView.vue 中添加 reset() 和 resetOpen() 方法，清空表单数据和计算结果

## Phase 5: 集成与测试

- [ ] T012 集成测试，构建和类型检查通过；运行 lint 和 typecheck 命令

## 依赖关系

```
T001 (类型定义)
   ↓
T002 (网格计算服务)
   ↓
T003 (GridView页面组件)
   ↓
T004, T005, T006, T007, T008 (交易计算功能)
   ↓
T009, T010 (开仓计算功能)
   ↓
T011 (重置功能)
   ↓
T012 (集成测试)
```

## 并行执行机会

- T004 和 T009 可以并行执行（不同的表单区域）
- T006 和 T007 可以并行执行（不同的计算逻辑）
- T008 依赖 T006 和 T007 的结果

## 独立测试标准

- **US1**: 输入总金额10000、当前股价10、持仓数量100、均价9，点击计算，验证结果显示需要买入400股，偏差-80%
- **US2**: 输入总金额10000、开仓股价10，点击计算，验证结果显示建议买入500股（5手）
- **US3**: 点击重置按钮，验证表单清空，结果隐藏
- **US4**: 从下拉框选择持仓股票，验证持仓数量和均价自动填充
