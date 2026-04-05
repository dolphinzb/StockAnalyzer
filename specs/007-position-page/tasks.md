# Tasks: 持仓页面

**Feature**: 007-position-page
**Generated**: 2026-04-04
**User Stories**: 8 (US1, US2, US2.1, US2.2, US3, US4, FR-009, FR-010)
**Total Tasks**: 24

## Phase 1: 基础设置

- [x] T001 更新 TypeScript 类型定义，在 `src/types.ts` 添加 TradeRecord、Position、AddTradeInput、UpdateTradeInput 类型；添加 PositionAPI 接口定义
- [x] T002 添加数据库操作函数，在 `electron/database.ts` 添加 getPositions()、getTradeRecords()、getLastZeroTrade()、addTradeRecord()、updateTradeRecord()、deleteTradeRecord() 函数
- [x] T003 创建交易计算服务，在 `electron/services/tradeService.ts` 实现 calcHoldingPrice() 函数，包含交易费率常量（TRADE_FEE_RATE、MIN_FEE、HUATAI_OTHER_FEE_RATE、SHENZHEN_STAMP_TAX_RATE、SHANGHAI_STAMP_TAX_RATE）和 getExchange() 函数
- [x] T004 添加 IPC 处理器，在 `electron/index.ts` 添加 position:get-list、position:get-records、position:add-record、position:update-record、position:delete-record 处理器
- [x] T005 暴露 PositionAPI，在 `preload/index.ts` 添加 window.positionApi 对象，包含 getPositions()、getTradeRecords()、addTradeRecord()、updateTradeRecord()、deleteTradeRecord() 方法

## Phase 2: 持仓列表 (US1, US2)

- [x] T006 [P] [US1] 创建持仓页面组件，在 `src/views/PositionView.vue` 实现页面布局，包含标题栏、持仓列表容器、新增按钮
- [x] T007 [P] [US1] 创建持仓列表组件，在 `src/components/PositionList.vue` 实现列表渲染，调用 getPositions() API
- [x] T008 [P] [US1] 创建持仓项组件，在 `src/components/PositionItem.vue` 实现 PositionItem，单击展开交易记录，再次单击收起
- [x] T009 [P] [US2] 创建交易记录列表组件，在 `src/components/PositionItem.vue` 实现展开的交易记录列表，按日期倒序显示
- [x] T010 [P] [US2] 创建交易记录项组件，在 `src/components/TradeRecordItem.vue` 实现 TradeRecordItem，显示交易类型（买入/卖出/股息）、日期（只显示天）、价格、数量、持仓均价

## Phase 3: 新增交易 (US3, US4)

- [x] T011 [US3] 创建交易编辑器组件，在 `src/components/TradeEditor.vue` 实现表单，包含股票代码、股票名称、交易类型（选择器）、交易日期、价格、数量字段
- [x] T012 [US4] 实现持仓计算逻辑，在 `electron/services/tradeService.ts` calcHoldingPrice() 函数中实现买入、卖出、股息三种交易的持仓均价计算

## Phase 4: 编辑和删除交易记录 (US2.1, US2.2)

- [x] T013 [US2.1] 交易编辑器支持编辑模式，在 `TradeEditor.vue` 中添加 record prop，编辑时带入原始值（包含持仓数量和持仓均价），保存时调用 updateTradeRecord
- [x] T014 [US2.1] 交易记录项添加编辑按钮，在 `TradeRecordItem.vue` 中添加编辑按钮，点击后触发编辑事件
- [x] T015 [US2.2] 交易记录项添加删除按钮，在 `TradeRecordItem.vue` 中添加删除按钮，点击后调用 deleteTradeRecord
- [x] T016 [US2.1] [US2.2] 持仓页面处理编辑和删除事件，在 `PositionView.vue` 中处理 edit-record 和 delete-record 事件

## Phase 5: 集成与测试

- [x] T017 集成测试，构建和类型检查通过

## Phase 6: 自动刷新交易记录列表 (FR-014)

- [x] T018 添加 refreshKey 状态变量，在 `PositionView.vue` 中添加 refreshKey ref，在保存或删除交易记录后递增
- [x] T019 传递 refreshKey 给子组件，在 `PositionList.vue` 和 `PositionItem.vue` 中添加 refreshKey prop 并透传
- [x] T020 监听 refreshKey 变化刷新列表，在 `PositionItem.vue` 中添加 watch 监听 refreshKey，变化时重新加载交易记录

## Phase 7: 获取持仓股票实时股价 (FR-009, FR-010)

- [x] T021 添加持仓页面刷新机制，在 `PositionView.vue` 的 onMounted 中调用获取股价接口
- [x] T022 创建股价获取函数，在 `electron/services/priceFetcher.ts` 添加 fetchStockPrices() 函数，接收股票代码列表，从远程API获取价格
- [x] T023 添加 IPC 处理器，在 `electron/index.ts` 添加 position:fetch-prices 处理器
- [x] T024 暴露股价获取 API，在 `preload/index.ts` 添加 positionApi.fetchPrices() 方法

## 依赖关系

```
T001 (类型定义)
   ↓
T002 (数据库函数) ← T003 (计算服务)
   ↓
T004 (IPC处理器) ← T005 (Preload API)
   ↓
T006-T009 (UI组件)
   ↓
T010-T012 (交易记录+编辑器+计算)
   ↓
T013-T016 (编辑删除功能)
   ↓
T017 (集成测试)
   ↓
T018-T020 (自动刷新功能)
   ↓
T021-T024 (获取实时股价)
```

## 并行执行机会

- T006、T007、T008、T009 可以并行执行（不同的 Vue 组件）
- T011、T012 可以并行执行（TradeEditor 和计算逻辑无依赖）
- T013、T014、T015 可以并行执行（UI 组件修改）
- T022、T023、T024 可以并行执行（T021 依赖这些）
- T018、T019、T020 可以并行执行（UI 组件修改，但 T019 依赖 T018）

## 独立测试标准

- **US1**: 打开持仓页面，验证持仓列表正确显示所有 holding_count > 0 的股票
- **US2**: 点击持仓股票，验证交易记录展开；再次点击，验证收起
- **US2.1**: 点击交易记录的编辑按钮，验证编辑表单显示原始值，保存后验证数据更新
- **US2.2**: 点击交易记录的删除按钮，验证记录被删除
- **US3**: 点击新增按钮，填写表单后保存，验证 trade_record 表中有新记录
- **US4**: 新增买入/卖出/股息交易，验证 holding_price 和 holding_count 计算正确