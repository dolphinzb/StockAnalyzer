# Tasks: 资金统计标签页

**Input**: Design documents from `/specs/016-fund-statistics/`  
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 本功能为UI展示功能，不包含单元测试任务。如需测试，请参考quickstart.md中的手动测试清单。

**Organization**: 任务按用户故事分组，支持独立实现和测试。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 所属用户故事（US1, US2）
- 包含确切文件路径

---

## Phase 1: Setup (项目初始化)

**Purpose**: 创建功能分支和基础结构

- [ ] T001 确认当前在 016-fund-statistics 分支
- [ ] T002 阅读 specs/016-fund-statistics/spec.md 了解功能需求
- [ ] T003 阅读 specs/016-fund-statistics/plan.md 了解技术方案
- [ ] T004 阅读 specs/016-fund-statistics/data-model.md 了解数据结构

---

## Phase 2: Foundational (基础架构)

**Purpose**: 扩展类型定义和API接口（阻塞所有用户故事）

**⚠️ CRITICAL**: 完成此阶段后才能开始用户故事开发

### 2.1 类型定义扩展

- [X] T005 [P] 在 shared/types/index.ts 中添加 FundOverview 接口定义
- [X] T006 [P] 在 shared/types/index.ts 中添加 MonthlyFundData 接口定义
- [X] T007 [P] 在 shared/types/index.ts 中添加 PieChartDataItem 接口定义
- [X] T008 在 shared/types/index.ts 的 FundManagementAPI 接口中新增 getFundOverview() 方法签名
- [X] T009 在 shared/types/index.ts 的 FundManagementAPI 接口中新增 getMonthlyFundData() 方法签名

### 2.2 Electron IPC 接口扩展

- [X] T010 在 electron/index.ts 的 handleFundManagementAPI 中添加 'fund:getFundOverview' handler
- [X] T011 在 electron/index.ts 的 handleFundManagementAPI 中添加 'fund:getMonthlyFundData' handler
- [X] T012 在 preload/index.ts 的 fundManagement API 对象中添加 getFundOverview 方法
- [X] T013 在 preload/index.ts 的 fundManagement API 对象中添加 getMonthlyFundData 方法

### 2.3 数据库服务层扩展

- [X] T014 在 electron/services/fundService.ts 中实现 getFundOverview() 函数
  - 查询 transfer_records 最后一条记录的 accountBalance
  - 查询 trade_records 获取当前持仓股票及 holdingCount
  - 查询 kline_data 获取各股票最新收盘价
  - 计算持仓市值和总资产
  - 返回 FundOverview 对象
- [X] T015 在 electron/services/fundService.ts 中实现 getMonthlyFundData() 函数
  - 循环处理过去60个月
  - 对每个月：获取月末账户余额、持仓状态、收盘价
  - 处理缺失数据（前值填充）
  - 返回按月排序的 MonthlyFundData 数组
- [X] T016 导出新函数并在 electron/index.ts 中导入

**Checkpoint**: 基础架构完成 - 可以开始用户故事开发

---

## Phase 3: User Story 1 - 查看资金概览统计 (Priority: P1) 🎯 MVP

**Goal**: 显示当前账户余额和持仓金额的数值卡片，以及饼图展示资产分布

**Independent Test**: 打开资金管理页面，选择"资金统计"标签，验证数值卡片正确显示金额，饼图正确显示占比，鼠标悬停显示tooltip

### 3.1 Composable 扩展（饼图支持）

- [X] T017 [P] [US1] 在 src/composables/useProfitChart.ts 中实现 drawPieChart 方法
  - 接收数据数组：{ label, value, color }[]
  - 计算总价值和每个扇区的角度
  - 使用 Canvas arc 方法绘制扇区
  - 可选：绘制标签和百分比文字
  - 设置鼠标事件监听（tooltip）
- [X] T018 [P] [US1] 在 src/composables/useProfitChart.ts 中实现 setupPieChartMouseEvents 方法
  - 计算鼠标位置相对于圆心的角度
  - 检测角度落在哪个扇区内
  - 更新 tooltipInfo

### 3.2 Store 扩展

- [X] T019 [US1] 在 src/stores/fundManagement.ts 中添加 fundOverview 状态（ref<FundOverview | null>）
- [X] T020 [US1] 在 src/stores/fundManagement.ts 中添加 isLoadingOverview 状态（ref<boolean>）
- [X] T021 [US1] 在 src/stores/fundManagement.ts 中实现 fetchFundOverview() 方法
  - 调用 window.api.fundManagement.getFundOverview()
  - 更新 fundOverview 状态
  - 处理加载状态和错误
- [X] T022 [US1] 在 src/stores/fundManagement.ts 的 return 中导出新增的状态和方法

### 3.3 UI 组件开发

- [X] T023 [US1] 创建 src/components/FundStatistics.vue 组件骨架
  - template: 数值卡片区域、饼图Canvas容器、tooltip容器
  - script: 引入 useFundManagementStore, useProfitChart
  - style: 基本布局样式
- [X] T024 [US1] 在 FundStatistics.vue 中实现数值卡片显示
  - 显示账户余额和持仓金额
  - 格式化金额（两位小数，千分位）
  - 加载状态显示
- [X] T025 [US1] 在 FundStatistics.vue 中实现饼图绘制
  - 创建 pieCanvasRef
  - 在 onMounted 中初始化 useProfitChart
  - 调用 store.fetchFundOverview()
  - 将数据转换为饼图格式并调用 drawPieChart
  - 处理无数据情况（显示"暂无数据"）
- [X] T026 [US1] 在 FundStatistics.vue 中实现饼图 tooltip
  - 创建 pieTooltip 响应式对象
  - 同步 composable 的 tooltipInfo 到组件级别
  - 显示标签、数值、百分比
- [X] T027 [US1] 在 FundStatistics.vue 中添加错误处理和重试按钮
  - 捕获加载错误
  - 显示错误信息
  - 提供重试按钮重新加载数据

### 3.4 标签页集成

- [X] T028 [US1] 在 src/views/FundManagementView.vue 中导入 FundStatistics 组件
- [X] T029 [US1] 在 FundManagementView.vue 的模板中添加"资金统计"标签按钮（放在第一个）
- [X] T030 [US1] 在 FundManagementView.vue 中添加资金统计标签内容区域
- [X] T031 [US1] 调整 activeTab 初始值为 'statistics'（默认显示资金统计）
- [X] T032 [US1] 调整标签顺序：资金统计 → 资金明细 → 盈亏统计

**Checkpoint**: User Story 1 完成 - 应能独立运行和测试
- ✅ 数值卡片显示账户余额和持仓金额
- ✅ 饼图显示资产分布
- ✅ 鼠标悬停显示tooltip
- ✅ 无数据时显示友好提示

---

## Phase 4: User Story 2 - 查看历史资金趋势 (Priority: P2)

**Goal**: 显示过去60个月的账户余额、持仓金额和总资产的变化趋势折线图，支持鼠标悬停查看详细信息

**Independent Test**: 在有历史数据的系统中，打开资金统计页面，验证折线图正确显示60个月数据，三条折线分别表示账户余额、持仓金额和总资产，鼠标悬停显示月份、余额、持仓、总资产

### 4.1 Composable 扩展（多折线图支持）

- [X] T033 [P] [US2] 在 src/composables/useProfitChart.ts 中实现 drawMultiLineChart 方法
  - 接收数据数组：{ label, accountBalance, holdingsValue, totalAssets }[]
  - 绘制坐标轴（X轴：月份，Y轴：金额）
  - 绘制三条折线（蓝色：账户余额，橙色：持仓金额，绿色：总资产）
  - 绘制数据点
  - 设置鼠标事件监听（tooltip）
- [X] T033a [US2] 在 src/composables/useProfitChart.ts 的 drawMultiLineChart 中增加总资产折线
  - 提取 totalAssets 数据系列
  - 绘制总资产折线（绿色 #10b981，线宽2px）
  - 绘制总资产数据点
  - 在 setupMultiLineMouseEvents 中增加总资产数据点检测
- [X] T034 [P] [US2] 在 src/composables/useProfitChart.ts 中实现 setupMultiLineMouseEvents 方法
  - 检测鼠标是否在数据点附近（±5px）
  - 更新 tooltipInfo 包含月份、账户余额、持仓金额、总资产

### 4.2 Store 扩展

- [X] T035 [US2] 在 src/stores/fundManagement.ts 中添加 monthlyFundData 状态（ref<MonthlyFundData[]>）
- [X] T036 [US2] 在 src/stores/fundManagement.ts 中添加 isLoadingMonthly 状态（ref<boolean>）
- [X] T037 [US2] 在 src/stores/fundManagement.ts 中实现 fetchMonthlyFundData() 方法
  - 调用 window.api.fundManagement.getMonthlyFundData()
  - 更新 monthlyFundData 状态
  - 处理加载状态和错误
- [X] T038 [US2] 在 src/stores/fundManagement.ts 的 return 中导出新增的状态和方法

### 4.3 UI 组件扩展

- [X] T039 [US2] 在 FundStatistics.vue 中添加折线图Canvas容器
  - 创建 lineCanvasRef
  - 添加标题"历史趋势（过去60个月）"
  - 添加tooltip容器
- [X] T040 [US2] 在 FundStatistics.vue 中实现折线图绘制
  - 在 onMounted 中初始化 lineChart
  - 调用 store.fetchMonthlyFundData()
  - 将数据转换为折线图格式并调用 drawMultiLineChart
  - 处理数据不足60个月的情况
- [X] T040a [US2] 在 FundStatistics.vue 中更新折线图调用和图例
  - 调用 drawMultiLineChart 时传入 lineColorTotal 参数（绿色 #10b981）
  - 在折线图下方添加三条折线的图例（账户余额、持仓市值、总资产）
- [X] T041 [US2] 在 FundStatistics.vue 中实现折线图 tooltip
  - 创建 lineTooltip 响应式对象
  - 同步 composable 的 tooltipInfo 到组件级别
  - 显示月份、账户余额、持仓金额、总资产
- [X] T042 [US2] 优化 FundStatistics.vue 的 loadData 方法
  - 并行加载资金概览和月度数据（Promise.all）
  - 统一错误处理

### 4.4 性能优化

- [X] T043 [US2] 在 electron/services/fundService.ts 的 getMonthlyFundData 中优化SQL查询
  - 确保使用索引（transferDate, stockCode+tradeDate, stockCode+date）
  - 批量查询kline_data避免N+1问题
  - 添加查询日志便于调试
- [X] T044 [US2] 在前端添加数据缓存机制
  - 在 store 中缓存已加载的月度数据
  - 仅在首次加载时请求，不自动刷新

**Checkpoint**: User Story 2 完成 - 应与US1一起独立运行和测试
- ✅ 折线图显示60个月数据
- ✅ 三条折线分别表示账户余额、持仓金额和总资产
- ✅ 鼠标悬停显示详细信息
- ✅ 缺失数据使用前值填充

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 跨用户故事的改进和优化

### 5.1 样式优化

- [X] T045 [P] 优化 FundStatistics.vue 的响应式布局
  - 数值卡片在不同屏幕宽度下的自适应
  - 图表容器高度自适应
  - 移动端适配（如需要）
- [X] T046 [P] 统一图表颜色方案
  - 确认账户余额使用蓝色 #3b82f6
  - 确认持仓金额使用橙色 #f97316
  - 与项目整体设计规范保持一致

### 5.2 错误处理增强

- [X] T047 实现 Modal 组件显示错误信息（而非简单alert）
  - 复用现有 Modal 组件
  - 显示友好的错误消息
  - 提供重试按钮
- [X] T048 添加详细的错误日志
  - 在 console.error 中包含更多上下文信息
  - 便于调试和问题定位

### 5.3 文档和验证

- [ ] T049 [P] 更新 README 或相关文档（如需要）
  - 说明资金统计功能的使用方法
  - 数据来源和计算逻辑
- [ ] T050 执行 quickstart.md 中的手动测试清单
  - 验证所有功能正常工作
  - 记录发现的问题
- [ ] T051 性能测试
  - 测量页面加载时间（目标 < 3秒）
  - 测量图表渲染时间
  - 测量tooltip响应时间（目标 < 0.3秒）

### 5.4 代码清理

- [X] T052 代码审查和清理
  - 移除console.log调试语句
  - 统一代码风格
  - 添加必要的注释
- [X] T053 类型检查
  - 运行 tsc --noEmit 确保无类型错误
  - 修复任何类型警告

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 无依赖 - 可立即开始
- **Foundational (Phase 2)**: 依赖 Setup 完成 - **阻塞所有用户故事**
- **User Story 1 (Phase 3)**: 依赖 Foundational 完成 - 可独立开发
- **User Story 2 (Phase 4)**: 依赖 Foundational 完成 - 可与US1并行开发
- **Polish (Phase 5)**: 依赖所有用户故事完成

### User Story Dependencies

- **User Story 1 (P1)**: 无其他故事依赖 - MVP核心功能
- **User Story 2 (P2)**: 依赖US1的基础设施（store、composable扩展），但可独立测试

### Within Each User Story

- 类型定义 → IPC接口 → 服务层 → Store → Composable → UI组件
- 先实现数据获取，再实现UI展示
- 先实现基本功能，再添加交互（tooltip）

### Parallel Opportunities

**Phase 2 (Foundational) 可并行**:
- T005-T009: 类型定义扩展（同一文件，需串行）
- T010-T013: IPC接口扩展（不同文件，可并行 [P]）
- T014-T016: 服务层实现（需串行，有依赖）

**Phase 3 (US1) 可并行**:
- T017-T018: Composable扩展（同一文件，需串行）
- T019-T022: Store扩展（同一文件，需串行）
- T023-T027: UI组件开发（同一文件，需串行）
- T028-T032: 标签页集成（同一文件，需串行）

**Phase 4 (US2) 可并行**:
- T033-T034: Composable扩展（同一文件，需串行）
- T035-T038: Store扩展（同一文件，需串行）
- T039-T042: UI组件扩展（同一文件，需串行）
- T043-T044: 性能优化（不同文件，可并行 [P]）

**Phase 5 (Polish) 可并行**:
- T045-T046: 样式优化（同一文件，需串行）
- T047-T048: 错误处理（不同文件，可并行 [P]）
- T049-T051: 文档和验证（可并行 [P]）

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. 完成 Phase 1: Setup
2. 完成 Phase 2: Foundational (**CRITICAL** - 阻塞所有故事)
3. 完成 Phase 3: User Story 1
4. **STOP and VALIDATE**: 测试资金概览和饼图功能
5. 部署/演示MVP

### Incremental Delivery

1. 完成 Setup + Foundational → 基础架构就绪
2. 添加 User Story 1 → 独立测试 → 部署/演示 (MVP!)
3. 添加 User Story 2 → 独立测试 → 部署/演示
4. 每个故事增加价值而不破坏之前的功能

### Parallel Team Strategy

如果有多个开发者：

1. 团队共同完成 Setup + Foundational
2. Foundational 完成后：
   - 开发者 A: User Story 1（T017-T032）
   - 开发者 B: User Story 2（T033-T044）
3. 两个故事独立完成后合并

---

## Task Summary

**Total Tasks**: 55 tasks

**By Phase**:
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 12 tasks
- Phase 3 (US1): 16 tasks
- Phase 4 (US2): 14 tasks
- Phase 5 (Polish): 9 tasks

**By User Story**:
- US1 (P1): 16 tasks - 资金概览 + 饼图
- US2 (P2): 14 tasks - 60个月折线图（含总资产折线）
- Shared: 25 tasks - 基础设施和优化

**Parallel Opportunities**: 
- Phase 2: 4 tasks marked [P]
- Phase 4: 4 tasks marked [P]
- Phase 5: 6 tasks marked [P]

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (32 tasks)

---

## Notes

- [P] 任务 = 不同文件，无依赖，可并行执行
- [Story] 标签映射任务到特定用户故事以便追踪
- 每个用户故事应可独立完成和测试
- 在每个checkpoint停止以独立验证故事
- 避免：模糊任务、同文件冲突、跨故事依赖破坏独立性
- 提交策略：每完成一个任务或逻辑组后提交
