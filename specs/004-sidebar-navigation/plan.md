# Implementation Plan: 侧边栏图标导航页面布局

**Branch**: `004-sidebar-navigation-layout` | **Date**: 2026-04-03 | **Spec**: [spec.md](file:///c:/WebProjects/StockAnalyzer/specs/004-sidebar-navigation/spec.md)
**Input**: Feature specification from `/specs/004-sidebar-navigation/spec.md`

## Summary

实现基于侧边栏图标导航的页面布局系统，移除 Electron 默认菜单栏，通过左侧图标菜单切换不同页面。初始包含自选股、持仓、网格、设置四个占位页面。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vue 3.4+, TypeScript 5.x
**Storage**: N/A (本期仅实现布局框架，无持久化需求)
**Testing**: Vitest (单元测试), Playwright (E2E测试)
**Target Platform**: Windows 10/11 (x64)
**Project Type**: 桌面应用 (Electron)
**Performance Goals**: 页面切换响应 ≤ 300ms
**Constraints**: 导航栏固定宽度 48-64px，纯图标显示带 tooltip，简约视觉风格
**Scale/Scope**: 单体应用，包含 1 个导航组件 + 4 个占位页面

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 检查项 | 状态 | 说明 |
|------|--------|------|------|
| 性能优先 | 页面切换 ≤ 300ms | ✅ | Vue 组件切换可满足 |
| 可维护性 | TypeScript 严格模式 | ✅ | 沿用现有 tsconfig 配置 |
| 可维护性 | Vue 3 Composition API | ✅ | 使用 `<script setup>` 语法 |
| 架构约束 | 组件分离 | ✅ | SideNav 导航组件独立 |
| 架构约束 | 目录结构 | ✅ | 组件放 src/components/，页面放 src/views/ |

**结论**: 所有可检查项均通过。本期仅实现布局框架，无数据持久化需求。

## Project Structure

### Documentation (this feature)

```text
specs/004-sidebar-navigation/
├── plan.md              # 本文件
├── spec.md              # 功能规范
├── research.md          # Phase 0 研究报告
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 快速开始指南
└── tasks.md             # Phase 2 任务清单 (由 /speckit.tasks 生成)
```

### Source Code Changes (repository root)

```text
c:\WebProjects\StockAnalyzer\
├── electron/
│   └── index.ts                  # 修改: 移除默认菜单栏 (app.applicationMenu = null)
├── src/
│   ├── components/
│   │   └── SideNav.vue           # 新增: 侧边栏导航组件
│   ├── views/
│   │   ├── WatchlistView.vue     # 新增: 自选股占位页面
│   │   ├── PositionView.vue      # 新增: 持仓占位页面
│   │   ├── GridView.vue          # 新增: 网格占位页面
│   │   └── SettingsView.vue      # 新增: 设置占位页面
│   ├── composables/
│   │   └── useNavigation.ts      # 新增: 导航状态管理
│   ├── App.vue                   # 修改: 集成 SideNav + 当前页面
│   └── main.ts
└── ...
```

**Structure Decision**: 采用 Vue 3 组件化结构，导航状态通过 composable 管理，页面组件按功能模块分离。

## Complexity Tracking

> 无复杂度违规。本期仅实现基础布局和导航，无复杂业务逻辑。

## Phase 0: Research

### 研究内容

1. **Vue 3 页面切换方案**
   - 决策: 使用 `v-if` 条件渲染或动态组件
   - 理由: 简单直接，无需引入 vue-router，适合单页面内多面板切换
   - 备选: vue-router (本期不必要)

2. **侧边栏图标组件库选择**
   - 决策: 使用内联 SVG 图标
   - 理由: 无额外依赖，体积小，可自定义样式
   - 备选: @iconify/vue, lucide-vue-next

3. **Electron 菜单移除方案**
   - 决策: `app.applicationMenu = null`
   - 理由: 简单有效，符合规范要求
   - 备选: 创建空 Menu

### 关键技术点

| 项目 | 选择 | 理由 |
|------|------|------|
| 页面切换 | v-if / 动态组件 | 轻量级切换，无需路由 |
| 图标方案 | 内联 SVG | 无依赖，完全可控 |
| 状态管理 | Vue ref/composable | 轻量状态管理 |
| 布局框架 | Flexbox | 简洁可靠 |

## Phase 1: Design

### 数据模型

**NavigationItem (导航菜单项)**

| 字段 | 类型 | 描述 |
|------|------|------|
| id | string | 唯一标识 (watchlist/position/grid/settings) |
| icon | Component | SVG 图标组件 |
| tooltip | string | 悬浮提示文本 |
| label | string | 菜单文本 (用于 tooltip) |
| view | Component | 对应页面组件 |

**PageContainer (页面容器)**

| 字段 | 类型 | 描述 |
|------|------|------|
| currentView | Ref<string> | 当前激活的视图 ID |
| navigate(viewId) | function | 切换到指定视图 |

### 组件接口

**SideNav.vue**
- Props: `currentViewId: string`
- Emits: `navigate(viewId: string)`
- 样式: 固定宽度 56px，垂直排列图标

**Placeholder Views**
- 各占位页面组件，无 Props/Emits
- 显示简单文本标识当前页面

## Phase 2: Implementation Tasks

> 详见 tasks.md (由 /speckit.tasks 生成)
