# Tasks: 历史开仓记录

**Feature**: 011-historical-trades
**Generated**: 2026-04-23
**Input**: spec.md, plan.md, data-model.md, contracts/historical-trade-api.md

## Dependencies

用户故事完成顺序:
```
US1 (P1) → 查看历史开仓记录列表
US2 (P1) → 计算交易统计数据
US3 (P1) → 计算交易手续费
US4 (P1) → 识别开仓和清仓周期
US5 (P2) → 查看交易明细

注意: US1-US4 紧密耦合，应作为 MVP 一起实现。
US5 依赖于 US1-US4 完成。
```

## Phase 1: 设置

- [x] T001 [P] 在 shared/types/index.ts 中定义 HistoricalTradeRecord 和 TradeDetail 类型
- [x] T002 [P] 在 src/types.ts 中添加历史交易相关类型

## Phase 2: 基础（阻塞前置任务）

- [x] T003 在 database.ts 中扩展 getAllTradeRecords() 函数以查询所有交易记录
- [x] T004 在 database.ts 中扩展 getTradeRecordsByStockCode(stockCode: string) 函数
- [x] T005 创建 electron/services/historicalTradeService.ts，包含交易周期识别算法
- [x] T006 在 historicalTradeService.ts 中实现 calculateBuyFee() 和 calculateSellFee() 函数
- [x] T007 在 historicalTradeService.ts 中实现 identifyTradeCycles() 函数
- [x] T008 在 historicalTradeService.ts 中实现 calculateCycleStats() 函数
- [x] T009 在 historicalTradeService.ts 中实现 getAllHistoricalTrades() 函数
- [x] T010 在 electron/index.ts 中注册 historicalTrade:getAll 和 historicalTrade:getCycleDetails 的 IPC 处理器
- [x] T011 更新 preload 脚本以向渲染进程暴露 historicalTrade API

## Phase 3: 用户故事 1 - 查看历史开仓记录列表 (P1)

**目标**: 用户可以在页面上查看历史开仓记录列表，显示所有已清仓股票的交易统计信息。

**独立测试**: 打开历史开仓记录页面，验证列表是否正确显示所有已清仓股票的交易统计。

### 实现任务

- [x] T012 [US1] 在 src/views/ 中创建 HistoricalTradesView.vue 页面组件
- [x] T013 [US1] 在 src/stores/historicalTrades.ts 中创建 historicalTrades Pinia store
- [x] T014 [US1] 在 src/composables/useHistoricalTrades.ts 中创建 useHistoricalTrades 组合式函数
- [x] T015 [US1] 实现 fetchHistoricalTrades() 函数以调用 IPC API
- [x] T016 [US1] 在 src/components/ 中创建 HistoricalTradeItem.vue 组件
- [x] T017 [US1] 实现列表显示所有必需字段：股票代码、股票名称、开仓时间、清仓时间、总买入次数、总卖出次数、总交易股数、总买入金额、总卖出金额、分红金额、总盈利、盈利比例
- [x] T018 [US1] 实现按清仓时间倒序排列
- [x] T019 [US1] 实现盈利颜色编码：正数红色，负数绿色，零默认颜色
- [x] T020 [US1] 添加历史开仓记录页面的路由配置
- [x] T021 [US1] 在主菜单/侧边栏中添加导航入口
- [x] T021.1 [US1] 添加刷新按钮，点击后重新加载列表数据

## Phase 4: 用户故事 2 - 计算交易统计数据 (P1)

**目标**: 系统自动计算每只已清仓股票的交易统计数据。

**独立测试**: 验证交易统计数据的计算结果，确认计算公式正确。

### 实现任务

- [x] T022 [US2] 实现 totalBuyCount 计算（周期内 BUY 交易的次数）
- [x] T023 [US2] 实现 totalSellCount 计算（周期内 SELL 交易的次数）
- [x] T024 [US2] 实现 totalShares 计算（BUY 交易的 tradeCount 之和）
- [x] T025 [US2] 实现 totalBuyAmount 计算（BUY 交易的 tradePrice × tradeCount 之和）
- [x] T026 [US2] 实现 totalSellAmount 计算（SELL 交易的 tradePrice × tradeCount 之和）
- [x] T026.1 [US2] 实现 totalDividendAmount 计算（DIVIDEND 交易的 tradePrice × holdingCount × 0.9 之和）
- [x] T027 [US2] 实现 totalProfit 计算：totalSellAmount + totalDividendAmount - totalBuyAmount - totalFees
- [x] T028 [US2] 实现 profitRatio 计算：(totalProfit / totalBuyAmount) × 100%
- [x] T029 [US2] 处理边界情况：当 totalBuyAmount = 0 时，profitRatio = 0

## Phase 5: 用户故事 3 - 计算交易手续费 (P1)

**目标**: 系统按照标准费率计算每笔交易的手续费。

**独立测试**: 手动计算单笔交易手续费，验证系统计算结果。

### 实现任务

- [x] T030 [US3] 实现买入手续费公式：MAX(成交金额 × 0.0005, 5) + 成交金额 × 0.00001
- [x] T031 [US3] 实现卖出手续费公式：MAX(成交金额 × 0.0005, 5) + 成交金额 × 0.00001 + 成交金额 × 0.0005
- [x] T032 [US3] 实现 totalFees 计算（周期内所有买入和卖出手续费之和）
- [ ] T033 [US3] 为手续费计算函数添加单元测试

## Phase 6: 用户故事 4 - 识别开仓和清仓周期 (P1)

**目标**: 系统正确识别每只股票的开仓和清仓周期。

**独立测试**: 检查交易记录，验证开仓和清仓周期的识别是否正确。

### 实现任务

- [x] T034 [US4] 实现开仓点检测：holdingCount 从 0 开始的首次 BUY 交易
- [x] T035 [US4] 实现清仓点检测：holdingCount 变为 0 的 SELL 交易
- [x] T036 [US4] 实现多周期检测：每个开仓-清仓周期作为独立记录
- [x] T037 [US4] 实现新周期检测：holdingCount = 0 后的任何 BUY 交易都视为新周期开始
- [x] T038 [US4] 处理 DIVIDEND 交易：包含在周期边界内，但不计入买入/卖出次数和金额
- [ ] T039 [US4] 为周期识别算法添加单元测试

## Phase 7: 用户故事 5 - 查看交易明细 (P2)

**目标**: 用户点击历史记录展开查看该周期内的所有交易明细。

**独立测试**: 点击历史记录，验证是否正确展开显示该周期内的所有交易明细。

### 实现任务

- [x] T040 [US5] 在 src/components/ 中创建 HistoricalTradeDetail.vue 组件
- [x] T041 [US5] 在 historicalTradeService.ts 中实现 getCycleDetails() 函数
- [x] T042 [US5] 在 HistoricalTradeItem.vue 中实现展开/收起逻辑
- [x] T043 [US5] 实现单次展开行为：同时只能展开一条交易明细
- [x] T044 [US5] 显示交易明细：交易日期、交易类型、交易价格、交易数量、单笔手续费
- [x] T045 [US5] 按交易日期正序排列交易明细
- [x] T046 [US5] 为交易明细列表添加样式

## Phase 8: 优化与跨领域关注点

- [x] T047 为历史开仓记录页面添加加载状态
- [x] T048 当没有历史交易记录时添加空状态提示
- [x] T049 为 IPC 调用失败添加错误处理
- [x] T050 格式化金额保留两位小数（如：1234.56）
- [x] T051 格式化盈利比例保留两位小数并添加百分号（如：12.34%）
- [x] T052 格式化日期为 YYYY-MM-DD（仅日期，无时间）
- [x] T053 为所有公共函数和接口添加中文注释
- [ ] T054 运行类型检查：npm run typecheck
- [ ] T055 运行代码检查：npm run lint

## 并行执行机会

```
Phase 1:
  T001, T002 可以并行执行（不同文件）

Phase 2:
  T003, T004 可以并行执行（不同的数据库函数）
  T005, T006 可以并行执行（服务设置）
  T007, T008, T009 必须顺序执行（依赖关系）
  T010, T011 必须在 T009 之后执行

Phase 3:
  T012, T013, T014 可以并行执行（不同文件）
  T015 依赖于 T014
  T016 依赖于 T012
  T017, T018, T019 依赖于 T016
  T020, T021 依赖于 T012

Phase 4-6:
  T022-T039 可以在每个阶段内并行执行（不同的计算）

Phase 7:
  T040, T041 可以并行执行
  T042 依赖于 T040
  T043, T044, T045, T046 依赖于 T042
```

## 实现策略

### MVP 范围 (Phase 1-6)

MVP 包括：
- 历史开仓记录列表页面，包含所有必需字段
- 交易周期识别算法
- 统计数据计算（买入/卖出次数、金额、手续费、盈利）
- 盈利颜色编码
- 按清仓时间排序

### 增量交付

1. **Phase 1-2**: 基础（类型、数据库、服务、IPC）
2. **Phase 3-6**: 核心功能（列表 + 计算）- MVP 完成
3. **Phase 7**: 交易明细展开（P2 功能）
4. **Phase 8**: 优化和格式化

### 任务总数

- **总计**: 57 个任务
- **已完成**: 54 个任务
- **未完成**: 4 个任务
  - T033 [US3] 为手续费计算函数添加单元测试
  - T039 [US4] 为周期识别算法添加单元测试
  - T054 运行类型检查：npm run typecheck
  - T055 运行代码检查：npm run lint

### 格式验证

所有任务都遵循要求的清单格式：
- ✅ 复选框：`- [ ]`
- ✅ 任务 ID：`T001`, `T002` 等
- ✅ [P] 标记用于可并行化任务
- ✅ [Story] 标签用于用户故事阶段：`[US1]`, `[US2]` 等
- ✅ 描述包含文件路径
