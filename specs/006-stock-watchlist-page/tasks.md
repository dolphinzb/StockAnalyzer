# 任务清单：自选股页面

**功能模块**: 006-stock-watchlist-page
**生成日期**: 2026-04-04
**规划文档**: [plan.md](./plan.md)

## 需求变更记录

### 变更 2026-04-10

- **变更内容**: 定时任务获取到最新价格后，不再保存到数据库；数据库表中删除当前价格字段；页面上展示的当前价格直接使用API实时获取
- **变更原因**: 当前价格是实时数据，无需持久化，直接从API获取更能保证数据时效性

### 变更 2026-04-16

- **变更内容**: 自选股列表在"名称"列与"当前价格"列之间增加五列：开盘价、当日最高价、当日最低价、涨跌额、涨跌幅；涨跌额/涨跌幅为正时红色显示，为负时绿色显示（遵循A股红涨绿跌惯例）
- **变更原因**: 用户需要更完整的日内行情信息，便于快速判断股票当日走势和波动范围

### 变更 2026-04-27

- **变更内容**: 在自选股添加弹框中实现股票代码输入后自动获取股票名称功能，支持失去焦点和回车键触发，显示加载状态，编辑模式禁用自动获取
- **变更原因**: 提升用户体验，减少手动输入错误，与持仓页面新增交易弹框保持一致的交互方式

## Phase 1: 项目初始化

**目标**: 初始化项目结构，创建数据库和 IPC 基础

- [x] T001 在 `electron/database.ts` 创建主进程数据库初始化模块和 watchlist schema
- [x] T002 在 `electron/database.ts` 创建 watchlist_stocks 表的数据库操作函数，配置从 config 表读取
- [x] T003 在 `preload/index.ts` 创建包含 StockWatcherAPI 的 preload 脚本
- [x] T004 在 `electron/index.ts` 创建自选股操作的 IPC 处理器

## Phase 2: 基础组件

**目标**: 创建数据模型、服务层和类型定义

- [x] T005 在 `electron/services/alertService.ts` 创建带防抖机制的告警服务
- [x] T006 在 `electron/services/priceFetcher.ts` 创建价格获取服务
- [x] T007 在 `src/types.ts` 创建 WatchlistStock、Alert、PriceUpdate 的 TypeScript 类型
- [x] T008 在 `src/stores/watchlist.ts` 创建自选股状态的 Pinia store
- [x] T009 在 `src/main.ts` 集成 Pinia

## Phase 3: 用户故事 1 - 查看和管理自选股列表

**目标**: 实现自选股列表展示功能

**独立测试**: 打开自选股页面，验证列表显示所有已添加股票，显示股票代码、名称、当前价格、买入阈值、卖出阈值、监控状态

- [x] T010 在 `src/views/WatchlistView.vue` 创建自选股主页面
- [x] T011 在 `src/components/StockList.vue` 创建股票列表组件
- [x] T012 在 `src/components/StockItem.vue` 创建列表项组件
- [x] T013 在 store 中实现股票列表排序（已开启监控的排在前面）
- [x] T014 在页面顶部实现统一的最后刷新时间显示

## Phase 4: 用户故事 2 - 添加和删除股票

**目标**: 实现添加和删除股票功能

**独立测试**: 添加一只股票验证列表更新，删除同一只股票验证列表恢复

- [x] T015 在 `src/components/StockEditor.vue` 创建添加/编辑对话框组件
- [x] T016 实现 addStock IPC 处理器并校验不允许重复添加
- [x] T017 实现带确认的 deleteStock IPC 处理器
- [x] T018 将 StockEditor 连接到 store 和 API

## Phase 5: 用户故事 4 - 设置股票阈值和监控开关

**目标**: 实现阈值设置和监控开关功能

**独立测试**: 为股票设置阈值、开启监控验证保存；关闭监控验证不在定时任务中获取价格

- [x] T019 在 updateStock 处理器中实现阈值校验（卖出价 > 买入价）
- [x] T020 在 updateStock 处理器中实现 monitorEnabled 切换
- [x] T021 在 StockItem 组件中连接阈值输入框
- [x] T022 实现 monitorEnabled 变化时自动排序

## Phase 6: 用户故事 3 - 手动刷新股票价格

**目标**: 实现手动刷新功能

**独立测试**: 点击刷新按钮，验证已开启监控的股票价格被更新

- [x] T023 在 `src/components/RefreshButton.vue` 创建刷新按钮组件
- [x] T024 通过 IPC 实现手动刷新触发
- [x] T025 在刷新操作期间显示加载状态

## Phase 7: 用户故事 5 - 自动监控股票价格

**目标**: 实现定时任务自动监控功能

**独立测试**: 启动程序后验证定时任务按间隔获取价格；关闭程序时验证定时任务停止

- [x] T026 在 `electron/services/priceFetcher.ts` 创建定时任务管理器
- [x] T027 使用 setInterval 和配置的 pollInterval 实现 startScheduler
- [x] T028 使用 clearInterval 在程序退出时实现 stopScheduler
- [x] T029 将价格获取服务集成到定时任务
- [x] T030 将告警服务集成到价格更新流程

## Phase 8: 完善与跨领域功能

**目标**: 完善功能，处理边界情况

- [x] T031 在 alertService 中实现告警防抖（5分钟）
- [x] T032 在自选股列表为空时添加空状态 UI
- [x] T033 优雅处理 API 错误，不影响定时任务
- [x] T034 为异步操作添加加载状态
- [x] T035 在 preload 中实现 onPriceUpdate 事件订阅

## Phase 9: 增加日内行情字段（变更 2026-04-16）

**目标**: 自选股列表增加开盘价、当日最高价、当日最低价、涨跌额、涨跌幅五列，涨跌额/涨跌幅红涨绿跌显示

**独立测试**: 打开自选股页面，验证列表每只股票在名称和当前价格之间显示开盘价、当日最高价、当日最低价、涨跌额、涨跌幅，涨跌额/涨跌幅正值红色、负值绿色

- [x] T036 更新 PriceUpdate 类型定义，增加 openPrice、highPrice、lowPrice、prevClosePrice、priceChange、priceChangePercent 字段
- [x] T037 更新 priceFetcher 服务，从 API 响应中解析开盘价、最高价、最低价、昨日收盘价，计算涨跌额和涨跌幅
- [x] T038 更新 Pinia store，增加 priceMap 存储股票实时价格数据（含新增字段）
- [x] T039 更新 StockItem 组件，在名称和当前价格之间增加开盘价、当日最高价、当日最低价、涨跌额、涨跌幅五列
- [x] T040 实现涨跌额/涨跌幅的颜色显示规则：正值红色、负值绿色（A股红涨绿跌惯例）
- [x] T041 更新 IPC 价格更新事件，推送包含新字段的 PriceUpdate 数据

## Phase 10: 自动获取股票名称（变更 2026-04-27）

**目标**: 在自选股添加弹框中复用持仓页面已有的自动获取股票名称功能

**独立测试**: 在添加股票弹框中输入股票代码后失去焦点或按回车键，验证系统自动调用API获取股票名称并填充到名称字段，显示加载状态提示；在编辑模式下修改其他字段，验证股票代码和名称字段保持禁用状态，不触发自动获取

**说明**: 持仓页面的 TradeEditor 组件已实现完整的自动获取股票名称功能，包括：
- preload API: `window.positionApi.getStockName(code)`
- IPC 通道: `stock:get-name`
- 服务层: `fetchStockName(stockCode)` in priceFetcher.ts
- UI 交互: blur 和 enter 事件监听、加载状态显示、编辑模式禁用

自选股页面的 StockEditor 组件应复用这些已有的 API 和服务，只需在前端组件层面添加相同的事件处理和UI逻辑。

- [x] T042 更新 StockEditor 组件，为股票代码输入框添加 blur 和 keyup.enter 事件监听
- [x] T043 在 StockEditor 组件中实现自动获取股票名称的逻辑，调用 window.watchlistApi.getStockName() 并填充名称字段
- [x] T044 在 StockEditor 组件中实现加载状态显示（如名称字段显示"..."）
- [x] T045 在 StockEditor 组件中处理编辑模式，禁用股票代码和名称字段，不触发自动获取
- [x] T046 在 StockEditor 组件中处理自动获取失败的情况，允许用户手动输入名称

## 依赖关系图

```
Phase 1 (项目初始化)
    │
    ▼
Phase 2 (基础组件) ─────────────────┐
    │                                    │
    ▼                                    │
Phase 3 (US1: 查看列表) ─────────────────┤
    │                                    │
    ▼                                    │
Phase 4 (US2: 添加删除) ─────────────────┤
    │                                    │
    ▼                                    │
Phase 5 (US4: 阈值监控) ─────────────────┤
    │                                    │
    ▼                                    │
Phase 6 (US3: 手动刷新) ─────────────────┤
    │                                    │
    ▼                                    │
Phase 7 (US5: 自动监控) ─────────────────┤
    │                                    │
    ▼                                    │
Phase 8 (完善) ◄──────────────────────┘
    │
    ▼
Phase 9 (日内行情字段)
    │
    ▼
Phase 10 (自动获取股票名称)
```

## 用户故事摘要

| 用户故事 | 任务编号 | 阶段 |
|----------|----------|------|
| US1: 查看和管理自选股列表 | T010-T014, T039-T040 | Phase 3, Phase 9 |
| US2: 添加和删除股票 | T015-T018, T042-T046 | Phase 4, Phase 10 |
| US3: 手动刷新股票价格 | T023-T025, T029 | Phase 6 |
| US4: 设置阈值和监控开关 | T019-T022 | Phase 5 |
| US5: 自动监控股票价格 | T026-T030 | Phase 7 |
| 变更: 日内行情字段 | T036-T041 | Phase 9 |
| 变更: 自动获取股票名称 | T042-T046 | Phase 10 |

## 建议的 MVP 范围

**Phase 3 (US1) + Phase 4 (US2)**: 实现基本的自选股列表展示和添加删除功能

## 可并行执行的任务

- **Phase 2**: T005、T006、T007、T008（不同文件，无依赖）
- **Phase 8**: T031、T032、T033、T034、T035（不同文件，无依赖）
- **Phase 9**: T036、T037、T041（类型定义/服务层/IPC，按顺序执行）；T039、T040（前端组件，可并行）
- **Phase 10**: T042-T046（前端组件修改，可并行执行）

## 实施策略

1. **MVP 优先**: 先实现 Phase 3-4，完成基本 CRUD 功能
2. **增量交付**: 每个 Phase 完成后可独立测试
3. **跨领域最后**: Phase 8 在所有用户故事完成后处理通用功能

## 任务数量统计

| 阶段 | 任务数量 |
|------|----------|
| Phase 1: 项目初始化 | 4 |
| Phase 2: 基础组件 | 5 |
| Phase 3: US1 | 5 |
| Phase 4: US2 | 4 |
| Phase 5: US4 | 4 |
| Phase 6: US3 | 3 |
| Phase 7: US5 | 5 |
| Phase 8: 完善 | 5 |
| Phase 9: 日内行情字段 | 6 |
| Phase 10: 自动获取股票名称 | 5 |
| **总计** | **46** |

## 实现状态

✅ **Phase 1-8 已完成** (2026-04-04)
✅ **Phase 9 已完成** (变更 2026-04-16)
✅ **Phase 10 已完成** (变更 2026-04-27)

### 主要文件清单

| 文件路径 | 说明 |
|----------|------|
| `electron/database.ts` | 数据库初始化和操作函数 |
| `electron/index.ts` | 主进程入口，IPC 处理器 |
| `electron/services/alertService.ts` | 告警服务（带防抖） |
| `electron/services/priceFetcher.ts` | 价格获取和定时任务服务 |
| `preload/index.ts` | Preload 脚本，暴露 API |
| `src/types.ts` | 渲染进程类型定义 |
| `src/stores/watchlist.ts` | Pinia store |
| `src/main.ts` | 渲染进程入口 |
| `src/views/WatchlistView.vue` | 自选股主页面 |
| `src/components/StockList.vue` | 股票列表组件 |
| `src/components/StockItem.vue` | 股票列表项组件 |
| `src/components/StockEditor.vue` | 添加/编辑对话框组件 |
| `src/components/RefreshButton.vue` | 刷新按钮组件 |
