# Research: 侧边栏图标导航页面布局

**Feature Branch**: `004-sidebar-navigation-layout`
**Date**: 2026-04-03
**Status**: Complete

## Research Questions

### Q1: Vue 3 页面切换方案

**问题**: 如何在 Vue 3 中实现多页面切换而不使用 vue-router？

**决策**: 使用动态组件 + `v-if` 条件渲染

**理由**:
- 本期需求是单一窗口内的面板切换，不需要 URL 路由
- 动态组件 `is` 属性配合 `component()` 可实现高效的组件切换
- v-if 配合 keep-alive 可缓存已访问页面状态

**备选方案**:
1. vue-router: 适用于需要 URL 同步的场景，本期不必要
2. 纯 v-show: 始终渲染但显示/隐藏，不适合本期占位页面场景

**实现方式**:
```vue
<component :is="currentViewComponent" />
```

---

### Q2: 侧边栏图标组件库选择

**问题**: 如何实现导航图标，要求体积小、样式可控？

**决策**: 使用内联 SVG 图标

**理由**:
- 无外部依赖，减少包体积
- 可直接通过 CSS 控制颜色、大小
- 与图标字体相比，无字体加载问题
- 可使用 SVG sprites 或单个 SVG 组件

**备选方案**:
1. @iconify/vue: 图标丰富但增加依赖
2. lucide-vue-next: 同样增加依赖
3. 字体图标 (Font Awesome): 体积大，加载复杂

**图标来源**: 使用常见的开源图标 (如 Heroicons, Feather Icons) 的 SVG path

---

### Q3: Electron 默认菜单移除

**问题**: 如何移除 Electron 默认的系统菜单栏？

**决策**: `app.applicationMenu = null`

**理由**:
- 最简单直接的方法
- 符合规范中"去掉默认菜单栏"的要求
- 不需要创建 Menu 对象再销毁

**备选方案**:
1. 创建空 Menu: `Menu.setApplicationMenu(new Menu())`
2. 在窗口创建时设置: `BrowserWindow` 的 `autoHideMenuBar: true`

**代码位置**: `electron/index.ts` 的 `app.whenReady()` 回调中

---

### Q4: 导航状态管理

**问题**: 如何管理当前选中的导航项状态？

**决策**: 使用 Vue 3 Composables

**理由**:
- 轻量级状态管理，无需引入 Pinia/Vuex
- 符合 Vue 3 Composition API 最佳实践
- 可以在多个组件间共享导航状态

**实现方式**:
```typescript
// useNavigation.ts
const currentViewId = ref('watchlist')
const navigate = (viewId: string) => { currentViewId.value = viewId }
return { currentViewId, navigate }
```

---

### Q5: 导航栏固定宽度设计

**问题**: 如何确保导航栏在不同窗口尺寸下保持固定宽度？

**决策**: 使用 CSS `width: 56px` + `flex-shrink: 0`

**理由**:
- 固定宽度是最稳定的方案
- `flex-shrink: 0` 防止导航栏被压缩
- 右侧内容区使用 `flex: 1` 自动填充剩余空间

**响应式考虑**: 本期为桌面应用，窗口最小宽度 800px，固定宽度设计满足需求

---

## Conclusion

所有研究问题均已解决，可进入 Phase 1 设计阶段。

**技术选型总结**:
| 项目 | 选择 |
|------|------|
| 页面切换 | 动态组件 (component + is) |
| 图标方案 | 内联 SVG |
| 菜单移除 | app.applicationMenu = null |
| 状态管理 | Vue 3 Composables |
| 布局 | Flexbox + 固定宽度 |
