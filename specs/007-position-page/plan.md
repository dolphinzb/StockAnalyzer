# Implementation Plan: 持仓页面

**Branch**: `007-position-page` | **Date**: 2026-04-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-position-page/spec.md`

## Summary

实现持仓页面功能，用户可在页面查看当前持仓股票列表，点击股票可展开查看交易记录。持仓列表展示股票代码、名称、持仓数量、成本、实时股价、盈亏等信息。系统支持新增、编辑、删除交易记录，新增交易时系统自动计算持仓均价和持仓数量。用户输入股票代码后系统自动调用API获取股票名称。

**Technical Approach**: Electron + Vue3 桌面应用，使用SQLite(sql.js)存储交易记录，远程API获取实时股价，IPC通信实现前后端交互。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia 3.x, sql.js 1.14.x
**Storage**: SQLite (sql.js) - trade_record表
**Testing**: 手动测试 + typecheck
**Target Platform**: Windows桌面
**Project Type**: Electron桌面应用
**Performance Goals**: 页面加载<3秒，交易记录展开<1秒
**Constraints**: 离线可用，股价需联网获取
**Scale/Scope**: 单用户，<1000条交易记录

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

本功能符合既有技术栈和架构，无需 Constitution 检查。

## Project Structure

### Documentation (this feature)

```text
specs/007-position-page/
├── plan.md              # This file
├── research.md          # Phase 0 output (技术调研)
├── data-model.md        # Phase 1 output (数据模型)
├── quickstart.md        # Phase 1 output (快速开始)
├── checklists/          # Phase 1 output
│   └── requirements.md  # 需求检查清单
├── contracts/           # Phase 1 output (接口定义)
└── tasks.md             # Phase 2 output (任务分解)
```

### Source Code (repository root)

```text
electron/
├── index.ts              # 主进程入口，IPC处理器注册
├── database.ts           # 数据库操作（sql.js）
├── services/
│   ├── tradeService.ts   # 交易计算服务（持仓均价计算）
│   └── priceFetcher.ts   # 股价获取服务
└── preload/
    └── index.ts          # Preload脚本，暴露API

src/
├── types.ts              # TypeScript类型定义
├── views/
│   └── PositionView.vue  # 持仓页面主视图
├── components/
│   ├── PositionList.vue  # 持仓列表组件
│   ├── PositionItem.vue  # 持仓项组件（可展开交易记录）
│   ├── TradeEditor.vue   # 交易记录编辑器
│   └── TradeRecordItem.vue # 交易记录项
├── stores/
│   └── position.ts       # Pinia状态管理
└── composables/
    └── useNavigation.ts  # 导航Composable

tests/
└── (手动测试为主)
```

**Structure Decision**: 基于既有Electron项目结构，在src/components/添加持仓相关组件，在electron/目录添加后端服务和数据库操作。

## Technical Design

### 1. 数据模型

**TradeRecord 表结构**:
- id: INTEGER PRIMARY KEY
- stock_code: TEXT (股票代码)
- stock_name: TEXT (股票名称)
- trade_type: TEXT (BUY/SELL/DIVIDEND)
- trade_date: TEXT (YYYY-MM-DD)
- trade_price: REAL (交易价格)
- trade_amount: INTEGER (交易数量，正数买入，负数卖出)
- holding_count: INTEGER (持仓数量)
- holding_price: REAL (持仓均价)
- created_at: TEXT
- updated_at: TEXT

### 2. 核心计算逻辑

**持仓均价计算** (tradeService.ts):
- 买入: 新持仓数量 = 原持仓数量 + 买入数量，新持仓均价 = (原持仓金额 + 买入金额 + 手续费) / 新持仓数量
- 卖出: 新持仓数量 = 原持仓数量 - 卖出数量，持仓均价不变（先进先出）
- 股息: 持仓均价降低（相当于持仓成本下降），数量不变

**交易费率**:
- 交易费率: 0.0003 (万三)
- 最低手续费: 5元
- 其他费用率（华泰等）: 0.0002
- 印花税（卖出深圳/上海）: 0.001
- 印花税（卖出上海额外）: 0.0005

### 3. API设计

**IPC 通道**:
- `position:get-list` - 获取持仓列表
- `position:get-records` - 获取交易记录（支持分页参数：stockCode, page, pageSize）
- `position:add-record` - 新增交易记录
- `position:update-record` - 更新交易记录
- `position:delete-record` - 删除交易记录
- `position:fetch-prices` - 获取实时股价
- `stock:get-name` - 根据股票代码获取股票名称（新增需求FR-005.1）

**交易记录分页设计** (FR-015, FR-016, FR-017):
- `position:get-records` IPC通道新增分页参数：`page`（页码，从1开始）、`pageSize`（每页条数，默认20）
- 返回数据结构：`{ records: TradeRecord[], total: number, hasMore: boolean }`
- 前端维护当前页码和加载状态，滚动到底部时自动请求下一页
- 切换展开股票时重置页码为1，清空已加载记录，重新加载第一页
- 加载中显示"加载中..."提示，全部加载完成显示"已加载全部"提示

**股价API**:
- 使用既有priceFetcher服务从远程API获取实时股价
- 进入持仓页面时一次性获取所有持仓股票股价

### 4. 前端组件设计

**PositionView.vue**:
- 页面主容器，包含标题栏、持仓列表、新增按钮
- 管理展开/收起状态，刷新机制

**PositionList.vue**:
- 渲染持仓列表，调用getPositions API
- 处理单个持仓项的展开/收起

**PositionItem.vue**:
- 单个持仓项，显示股票信息、盈亏
- 展开时显示交易记录列表
- 点击事件触发展开/收起
- 交易记录列表支持无限滚动加载（FR-015）：维护page和hasMore状态，监听滚动事件，触底时加载下一页
- 交易记录列表区域设置max-height和overflow-y: auto，确保内容超出时显示纵向滚动条，窗口较小时也能正常滚动和触发加载
- 切换股票时重置分页状态（FR-017）
- 加载中/加载完成提示（FR-016）

**TradeEditor.vue**:
- 交易记录编辑表单
- 股票代码输入后自动获取名称（新增需求FR-005.1）
- 支持新增和编辑模式

**TradeRecordItem.vue**:
- 单条交易记录显示
- 包含编辑、删除按钮

### 5. 自动获取股票名称流程 (FR-005.1)

```
用户输入股票代码
    ↓
输入框失焦(blur)或按回车键(Enter)
    ↓
调用 IPC: stock:get-name
    ↓
主进程查询本地数据库或调用远程API
    ↓
返回股票名称
    ↓
前端自动填入股票名称输入框
```

## Implementation Phases

### Phase 1: 基础设置
- 更新TypeScript类型定义
- 添加数据库操作函数
- 创建交易计算服务

### Phase 2: 持仓列表 UI
- 创建PositionView、PositionList、PositionItem组件
- 实现展开/收起交易记录功能

### Phase 2.1: 交易记录分页加载
- 数据库查询函数添加分页参数（page, pageSize）
- IPC通道和Preload API支持分页参数
- PositionItem组件实现无限滚动加载
- 加载状态提示（加载中/已加载全部）

### Phase 3: 交易记录 CRUD
- 创建TradeEditor组件（包含自动获取股票名称）
- 实现新增、编辑、删除功能
- 实现持仓均价自动计算

### Phase 4: 实时股价
- 集成priceFetcher获取实时股价
- 计算盈亏金额和比例

## Complexity Tracking

> 本功能基于既有技术栈实现，无额外复杂度违规。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 无 | - | - |

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| 远程股价API不可用 | 盈亏信息无法显示 | 显示"股价获取失败"，保留最后已知价格 |
| 股票名称API不可用 | 自动填充失败 | 用户可手动输入，不阻塞流程 |
| 持仓计算错误 | 数据不准确 | 提供编辑功能允许用户修正 |
