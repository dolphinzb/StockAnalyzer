# Quick Start: 侧边栏图标导航页面布局

**Feature Branch**: `004-sidebar-navigation-layout`
**Date**: 2026-04-03
**Status**: Complete

## Overview

本期实现侧边栏图标导航布局，移除 Electron 默认菜单，使用左侧图标菜单切换占位页面。

## File Changes Summary

| Action | File | Description |
|--------|------|-------------|
| Modify | `electron/index.ts` | 添加 `app.applicationMenu = null` 移除默认菜单 |
| Add | `src/components/SideNav.vue` | 侧边栏导航组件 |
| Add | `src/composables/useNavigation.ts` | 导航状态管理 |
| Add | `src/views/WatchlistView.vue` | 自选股占位页面 |
| Add | `src/views/PositionView.vue` | 持仓占位页面 |
| Add | `src/views/GridView.vue` | 网格占位页面 |
| Add | `src/views/SettingsView.vue` | 设置占位页面 |
| Modify | `src/App.vue` | 集成 SideNav 和页面容器 |

## Development Commands

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 运行 Electron 应用
npm run electron:dev
```

## Verification Steps

1. **启动应用**: `npm run electron:dev`
2. **验证默认页面**: 应用启动后显示自选股占位页面
3. **验证侧边栏**: 左侧显示 4 个图标导航栏
4. **验证 tooltip**: 鼠标悬浮在图标上显示对应文字提示
5. **验证页面切换**: 点击各图标，页面内容应切换到对应占位页面
6. **验证选中状态**: 当前选中图标应有视觉区分
7. **验证无菜单栏**: 顶部窗口栏不应显示默认菜单

## Implementation Order

1. 创建 `useNavigation.ts` 导航状态管理
2. 创建各占位页面组件
3. 创建 `SideNav.vue` 导航组件
4. 修改 `App.vue` 集成导航
5. 修改 `electron/index.ts` 移除默认菜单

## Troubleshooting

**Q: 图标不显示**
- 检查 SVG path 是否正确
- 检查 CSS 是否设置了正确的颜色

**Q: 页面切换无反应**
- 检查 `navigate` 方法是否正确调用
- 检查 `currentViewId` 是否正确更新

**Q: 菜单栏仍然存在**
- 确认 `electron/index.ts` 已添加 `app.applicationMenu = null`
- 重新启动应用（热重载可能不生效）
