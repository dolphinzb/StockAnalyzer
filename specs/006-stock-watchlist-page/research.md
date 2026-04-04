# Research: 自选股页面

**Feature**: 006-stock-watchlist-page
**Date**: 2026-04-04

## 概述

本功能为 Electron + Vue3 桌面应用，需要实现自选股页面，包含：
- 自选股列表展示和管理
- 股票阈值设置（买入/卖出）
- 监控开关控制
- 定时任务自动刷新价格
- 告警通知（页面+系统通知）
- 数据持久化到数据库

## 技术决策

### 1. 数据库选型

**Decision**: 使用 SQLite + sql.js

**Rationale**:
- Electron 桌面应用适合使用轻量级本地数据库
- sql.js 是 SQLite 的纯 JavaScript 实现，与 Electron 主进程配合良好
- 配置存储在 config 表的 app_config JSON 字段中
- 跨平台支持，无需额外安装

**Alternatives considered**:
- IndexedDB: 浏览器原生，但不适合主进程数据存储
- LevelDB: Google 的 KV 数据库，但不如 SQLite 适合关系型数据

### 2. 定时任务实现

**Decision**: 使用 Node.js setInterval + 状态管理

**Rationale**:
- 简单可靠，适合桌面应用场景
- 可以与 Vue/Pinia 状态管理无缝集成
- 程序关闭时可通过 Electron 生命周期事件清理

**Alternatives considered**:
- node-cron: 更强大的 cron 表达式支持，但本功能只需要简单间隔轮询
- RxJS: 响应式编程，但增加了不必要的复杂度

### 3. 系统通知

**Decision**: 使用 Electron Notification API

**Rationale**:
- Electron 原生支持，无需额外依赖
- 跨平台（Windows/macOS/Linux）
- 与系统通知中心集成良好

**Alternatives considered**:
- electron-windows-notifications: 仅 Windows，增加依赖
- node-notifier: 跨平台但需要原生模块

### 4. 告警防抖机制

**Decision**: 在应用层实现内存级别防抖

**Rationale**:
- 防抖只需要在运行时有效，不需要持久化
- 使用 Map 存储股票代码到最后告警时间的映射
- 5分钟超时后自动清除记录

### 5. 交易时间段检查

**Decision**: 在定时任务执行前检查当前时间是否在交易时间段内

**Rationale**:
- A股交易时间为上午09:30-11:30，下午13:00-15:00
- 非交易时间段内不需要获取价格，减轻API压力
- 配置存储在 config 表的 app_config JSON 字段中
- 使用简单的时间字符串比较判断是否在交易时间段内

## 最佳实践

### Vue 3 + TypeScript 严格模式
- 使用 Composition API
- 所有组件定义 props 和 emits 类型
- 使用 defineModel 或 @vueuse/core 处理双向绑定

### IPC 通信
- 所有数据库操作在主进程执行
- 通过 preload 暴露安全 API
- 使用 ipcRenderer.invoke / ipcMain.handle 模式

### 状态管理
- 使用 Pinia stores
- 股票列表数据存储在 store 中
- 定时任务状态由 store 管理

## 外部依赖

- sql.js: SQLite 数据库（JavaScript 实现）
- electron: 桌面运行时
- @vueuse/core: 工具函数（可能用到）
