# Tasks: 指数状态栏显示

**Input**: Design documents from `/specs/010-index-status-bar/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖关系）
- **[Story]**: 所属用户故事（如 US1, US2, US3）

## Phase 1: 设置（共享基础设施）

**Purpose**: 定义指数类型和IPC通道常量

- [x] T001 [P] 在 shared/types/index.ts 中添加 IndexData 接口定义
- [x] T002 [P] 在 shared/types/index.ts 中添加 IndexDataState 接口定义
- [x] T003 [P] 在 shared/types/index.ts 中添加 INDEX_UPDATE IPC通道常量

---

## Phase 2: 基础（阻塞性前置条件）

**Purpose**: 实现指数数据获取和IPC通信的核心基础设施

- [x] T004 [P] 在 electron/services/priceFetcher.ts 中添加 INDEX_CODES 和 INDEX_NAMES 常量
- [x] T005 修改 fetchStockPrices 函数，在批量请求中包含指数代码（electron/services/priceFetcher.ts）
- [x] T006 创建 parseIndexData 函数，用于从API响应中解析指数数据（electron/services/priceFetcher.ts）
- [x] T007 创建 sendIndexUpdate 函数，通过IPC推送指数数据（electron/services/priceFetcher.ts）
- [x] T008 在 electron/index.ts 中添加 index:update 通道的 ipcMain 处理器（注：通过 sendIndexUpdate 直接推送，无需额外处理器）
- [x] T009 扩展 prices:update IPC消息，增加 indices 字段（注：使用独立的 index:update 通道，无需扩展）

**Checkpoint**: 基础准备就绪 - 可以开始用户故事的实现

---

## Phase 3: 用户故事 1 - 查看市场整体走势 (Priority: P1) 🎯 MVP

**Goal**: 在窗口底部状态栏显示上证指数和深成指数的实时数据，支持红涨绿跌黑持平的颜色规则和箭头显示

**Independent Test**: 用户打开应用后，无需任何操作，即可在窗口底部状态栏看到上证指数和深成指数的当前数值、涨跌值和涨跌幅

**Implementation**:

- [x] T010 [P] [US1] 创建 useIndexData composable（src/composables/useIndexData.ts）
- [x] T011 [P] [US1] 在 watchlist store 中添加指数数据状态（src/stores/watchlist.ts）
- [x] T012 [P] [US1] 创建 IndexStatusBar.vue 组件（src/components/IndexStatusBar.vue）
- [x] T013 [US1] 在 WatchlistView.vue 底部集成 IndexStatusBar 组件（src/views/WatchlistView.vue）

**Acceptance Criteria**:
- 状态栏显示上证指数和深成指数
- 上涨时显示红色字体和向上箭头
- 下跌时显示绿色字体和向下箭头
- 持平时显示黑色字体和无箭头
- 首次加载显示占位符 "--"
- 状态栏固定高度30px
- 左右分布布局：左侧上证指数，右侧深成指数

---

## Phase 4: 用户故事 2 - 实时跟踪指数变化 (Priority: P2)

**Goal**: 指数数据随每分钟定时刷新和手动刷新自动更新

**Independent Test**: 用户观察状态栏，指数数据随每分钟的数据刷新而更新，手动刷新时也一并更新

**Implementation**:

- [x] T014 [P] [US2] 修改 useIndexData，监听 index:update IPC事件（src/composables/useIndexData.ts）
- [x] T015 [US2] 验证 refreshAllEnabledStocks 触发指数数据更新（electron/services/priceFetcher.ts）
- [x] T016 [US2] 验证 manualRefresh 触发指数数据更新（electron/services/priceFetcher.ts）

**Acceptance Criteria**:
- 每分钟定时刷新时状态栏数据同步更新
- 手动刷新时状态栏数据一并更新
- 涨跌方向变化时颜色和箭头正确切换

---

## Phase 5: 用户故事 3 - 处理数据获取异常 (Priority: P3)

**Goal**: 当指数数据获取失败时，优雅地处理错误，显示上次成功的数据和错误提示

**Independent Test**: 在网络异常情况下，状态栏仍显示上次数据并有失败提示

**Implementation**:

- [x] T017 [P] [US3] 修改 sendIndexUpdate，包含错误状态和错误信息（electron/services/priceFetcher.ts）
- [x] T018 [US3] 更新 useIndexData，处理错误状态并保留上次成功数据（src/composables/useIndexData.ts）
- [x] T019 [US3] 在 IndexStatusBar.vue 中添加"数据更新失败"错误提示UI
- [x] T020 [US3] 验证错误状态正确显示，并在下次成功后恢复

**Acceptance Criteria**:
- 数据获取失败时显示"数据更新失败"提示
- 保持显示上次成功获取的数据
- 下次获取成功后恢复正常显示

---

## Phase 6: 优化与全局一致性

**Purpose**: UI优化和全局一致性

- [x] T021 [P] 在 IndexStatusBar.vue 中使用 CSS clamp() 实现响应式字体
- [x] T022 [P] 验证 SC-006: 涨跌幅数值过大时字体缩小不溢出
- [x] T023 验证所有验收场景端到端通过

---

## Dependency Graph

```
Phase 1 (设置)
    ├── T001 ──┐
    ├── T002 ──┼──► Phase 2
    └── T003 ──┘

Phase 2 (基础)
    ├── T004 ──┐
    ├── T005 ──┼──► T006 ──► T007 ──┐
    └── T004 ──┘                    ├──► T008
                                    ├──► T009
                                    └──► Phase 3

Phase 3 (US1)
    ├── T010 ──┐
    ├── T011 ──┼──► T012 ──► T013
    └── T010 ──┘

Phase 4 (US2) ──► T014 ──► T015 ──► T016

Phase 5 (US3) ──► T017 ──► T018 ──► T019 ──► T020

Phase 6 (优化) ──► T021 ──► T022 ──► T023
```

---

## Parallel Execution Examples

**Example 1**: Phase 1 任务 T001, T002, T003 可并行执行（同一文件，独立添加）

**Example 2**: Phase 2 任务 T004 可与其他设置任务并行执行

**Example 3**: Phase 3 任务 T010, T011, T012 可并行执行（不同文件）

**Example 4**: Phase 5 任务 T017 可与 T018 并行执行（不同层）

---

## Suggested MVP Scope

**Minimum Viable Product**: 用户故事 1 (Phase 3)

Core deliverable: 指数状态栏组件，能显示上证和深成指数，支持颜色和箭头规则，首次加载显示占位符

After MVP:
- 添加自动刷新支持 (US2)
- 添加错误处理 (US3)
- 优化UI (Phase 6)

---

## Task Summary

| Phase | Description | Task Count |
|-------|-------------|------------|
| Phase 1 | 设置 - 类型定义和IPC常量 | 3 |
| Phase 2 | 基础 - 价格获取服务和IPC通道 | 6 |
| Phase 3 | US1 - 查看市场整体走势 🎯 MVP | 4 |
| Phase 4 | US2 - 实时跟踪指数变化 | 3 |
| Phase 5 | US3 - 处理数据获取异常 | 4 |
| Phase 6 | 优化 - UI优化 | 3 |
| **Total** | | **23** |

---

## Verification Checklist

Before marking tasks complete, verify:

- [ ] T001-T003: 类型编译无错误
- [ ] T004-T009: 价格获取服务构建成功，IPC通道正常工作
- [ ] T010-T013: 组件在 WatchlistView 中正确渲染，布局正确
- [ ] T014-T016: 自动刷新和手动刷新正常工作
- [ ] T017-T020: 错误处理正常工作
- [ ] T021-T023: UI响应式，所有成功标准达成
