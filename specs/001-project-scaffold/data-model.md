# Data Model: 搭建项目基础框架

**Feature**: 001-project-scaffold
**Date**: 2026-04-03
**Status**: Initial (No persistent data)

## Overview

基础框架阶段不涉及业务数据持久化。以下是项目架构的核心组件和接口定义。

## Key Entities

### 1. ElectronMainProcess

**Description**: Electron 主进程，负责应用生命周期管理和窗口创建

**Attributes**:
| 属性 | 类型 | 说明 |
|------|------|------|
| app | BrowserApplication | Electron 应用实例 |
| mainWindow | BrowserWindow | 主窗口实例 |
| isDev | boolean | 是否开发模式 |

**Responsibilities**:
- 应用启动和退出管理
- 主窗口创建和销毁
- IPC 消息处理

### 2. PreloadScript

**Description**: 预加载脚本，在渲染进程和主进程之间建立安全的通信桥梁

**Attributes**:
| 属性 | 类型 | 说明 |
|------|------|------|
| contextBridge | ContextBridge | 用于暴露安全 API |
| exposedAPI | WindowAPI | 暴露给渲染进程的 API |

**Responsibilities**:
- 通过 contextBridge 暴露类型安全的接口
- 处理渲染进程和主进程之间的 IPC 通信
- 维护安全边界

### 3. VueRenderer

**Description**: Vue 3 渲染进程，负责 UI 展示和用户交互

**Attributes**:
| 属性 | 类型 | 说明 |
|------|------|------|
| app | VueApplication | Vue 应用实例 |
| rootComponent | App | 根组件 |

**Responsibilities**:
- 渲染 Vue 组件
- 处理用户交互
- 通过 preload API 与主进程通信

### 4. WindowAPI (Preload 暴露接口)

**Description**: 通过 contextBridge 暴露给渲染进程的 API

```typescript
interface WindowAPI {
  platform: 'windows' | 'mac' | 'linux';
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => boolean;
}
```

### 5. IPC Channels

**Description**: 主进程和渲染进程之间的通信通道

| Channel | Direction | Payload | 说明 |
|---------|-----------|---------|------|
| window:minimize | R → M | none | 请求最小化窗口 |
| window:maximize | R → M | none | 请求最大化/还原窗口 |
| window:close | R → M | none | 请求关闭窗口 |
| window:is-maximized | R → M | none | 查询窗口状态 |
| window:maximized | M → R | boolean | 窗口状态变化通知 |

## Type Definitions

### shared/types/index.ts

```typescript
// 窗口 API 类型
export interface WindowAPI {
  platform: 'windows' | 'mac' | 'linux';
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
}

// Electron 版本信息
export interface ElectronVersions {
  node: string;
  chrome: string;
  electron: string;
}

// 平台类型
export type Platform = 'windows' | 'mac' | 'linux';
```

## State Management

基础框架阶段使用 Pinia 作为状态管理方案，但初始版本不包含业务状态。后续功能开发将在 stores/ 目录下添加对应的 store。

### Planned Stores (Future)

| Store | Purpose | Dependencies |
|-------|---------|--------------|
| useAppStore | 应用全局状态 | N/A |
| useStockStore | 股票数据状态 | 行情 API |
| useSettingsStore | 用户设置 | 持久化存储 |

## Validation Rules

暂无数据验证需求（基础框架阶段）。

## Notes

- 本阶段为项目骨架搭建，不涉及业务数据
- 数据模型将在后续功能开发中逐步完善
- 所有 IPC 通信必须通过 preload 脚本的 contextBridge
