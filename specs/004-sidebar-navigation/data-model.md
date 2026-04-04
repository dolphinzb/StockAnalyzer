# Data Model: 侧边栏图标导航页面布局

**Feature Branch**: `004-sidebar-navigation-layout`
**Date**: 2026-04-03
**Status**: Complete

## Entity Overview

本期功能涉及的数据模型主要是导航菜单项的定义，不涉及持久化存储。

## Entities

### NavigationItem (导航菜单项)

表示侧边栏中的一个可点击菜单图标。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | 唯一标识符，如 'watchlist', 'position', 'grid', 'settings' |
| label | string | Yes | 菜单显示名称，用于 tooltip |
| icon | Functional | Yes | SVG 图标组件或 SVG path 数据 |
| viewId | string | Yes | 对应的页面视图 ID |

**TypeScript Interface**:
```typescript
interface NavigationItem {
  id: string
  label: string
  icon: string // SVG path data
  viewId: string
}
```

**Validation Rules**:
- `id` 必须唯一，非空字符串
- `label` 必须是非空字符串，用于 tooltip 显示
- `viewId` 必须与已注册的视图 ID 匹配

### ViewComponent (视图组件注册表)

映射 viewId 到具体的 Vue 组件。

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| viewId | string | Yes | 视图唯一标识 |
| component | Component | Yes | Vue 组件 |

**TypeScript Interface**:
```typescript
interface ViewRegistration {
  viewId: string
  component: DefineComponent
}
```

## Navigation State

导航状态通过 Vue 3 Composables 管理，无需持久化。

```typescript
interface NavigationState {
  currentViewId: Ref<string>      // 当前激活的视图 ID
  navigate: (viewId: string) => void  // 切换视图方法
}
```

**Default State**: 应用启动时 `currentViewId` 默认为 'watchlist'（自选股）

## Initial Navigation Items

| ID | Label | Icon (SVG Path) | ViewId |
|----|-------|-----------------|--------|
| watchlist | 自选股 | star 图标 path | watchlist |
| position | 持仓 | chart/pie 图表 path | position |
| grid | 网格 | grid/gird 图表 path | grid |
| settings | 设置 | gear/cog 图表 path | settings |

## Relationships

```
NavigationItem[] ──(viewId)──> ViewRegistration ──(component)──> Vue Component
                              │
                              └── NavigationState.currentViewId (single reference)
```

## State Transitions

| From | To | Trigger |
|------|-----|---------|
| (initial) | watchlist | 应用启动 |
| watchlist | position | 用户点击持仓图标 |
| watchlist | grid | 用户点击网格图标 |
| watchlist | settings | 用户点击设置图标 |
| position | watchlist | 用户点击自选股图标 |
| position | grid | 用户点击网格图标 |
| position | settings | 用户点击设置图标 |
| grid | * | 用户点击任意图标 |
| settings | * | 用户点击任意图标 |

**Transition Rules**:
- 任意视图可以切换到任意其他视图
- 无效的 viewId 切换应被忽略或抛出警告
- 快速连续点击只响应最后一次点击（debounce 可选）

## Notes

- 本期仅涉及前端组件状态，无后端数据同步
- 状态管理使用 Vue 3 `ref`，无需引入额外状态管理库
- 页面切换使用动态组件，无需 URL 路由
