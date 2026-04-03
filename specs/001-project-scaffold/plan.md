# Implementation Plan: 搭建项目基础框架

**Branch**: `001-project-scaffold` | **Date**: 2026-04-03 | **Spec**: [spec.md](file:///c:/WebProjects/StockAnalyzer/specs/001-project-scaffold/spec.md)
**Input**: Feature specification from `/specs/001-project-scaffold/spec.md`

## Summary

搭建完整的 Electron + Vite + Vue3 + TypeScript 项目基础框架，确保可以构建并运行。主要目标：建立符合章程规范的项目结构，配置开发服务器和构建流水线，生成可执行的 Windows 桌面应用。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vite 5.x, Vue 3.4+, TypeScript 5.x, electron-builder
**Storage**: N/A (初始骨架项目暂无持久化需求)
**Testing**: Vitest (单元测试), Playwright (E2E测试)
**Target Platform**: Windows 10/11 (x64)
**Project Type**: 桌面应用 (Electron)
**Performance Goals**: 启动时间 ≤ 10秒，页面响应 ≤ 500ms
**Constraints**: 必须启用上下文隔离和节点集成禁用，必须使用 Web Worker 处理耗时计算
**Scale/Scope**: 单体应用，初始版本包含基本目录结构和核心配置文件

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 检查项 | 状态 | 说明 |
|------|--------|------|------|
| 性能优先 | 启动时间 ≤ 10秒 | ✅ | Electron应用通常可在10秒内启动 |
| 性能优先 | 使用 Web Worker | ✅ | 架构设计上考虑，初始骨架无耗时计算 |
| 数据完整性 | 数据验证机制 | ⚠️ | 待后续功能实现，骨架阶段仅搭建框架 |
| 安全性 | 上下文隔离 | ✅ | preload 脚本必须启用 contextIsolation |
| 安全性 | 节点集成禁用 | ✅ | webPreferences.nodeIntegration = false |
| 可维护性 | TypeScript 严格模式 | ✅ | tsconfig.json 设置 strict: true |
| 可维护性 | Vue 3 Composition API | ✅ | 使用 `<script setup>` 语法 |
| 架构约束 | 目录结构 | ✅ | main/, preload/, renderer/, shared/ |
| 架构约束 | IPC 通信 | ✅ | 通过 contextBridge 暴露 API |

**结论**: 所有可检查项均通过。数据完整性相关验证机制将在后续功能中实现。

## Project Structure

### Documentation (this feature)

```text
specs/001-project-scaffold/
├── plan.md              # 本文件
├── spec.md              # 功能规范
├── research.md          # Phase 0 研究报告
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 快速开始指南
└── tasks.md             # Phase 2 任务清单 (由 /speckit.tasks 生成)
```

### Source Code (repository root)

```text
c:\WebProjects\StockAnalyzer\
├── electron/                     # Electron 主进程代码
│   └── index.ts                  # 主进程入口
├── src/                          # Vue 渲染进程代码
│   ├── main.ts                   # Vue 应用入口
│   ├── App.vue                   # 根组件
│   ├── components/                # 公共组件
│   ├── composables/              # 组合式函数
│   ├── stores/                   # Pinia 状态库
│   ├── views/                    # 页面视图
│   ├── utils/                    # 工具函数
│   └── assets/                   # 静态资源
├── preload/                      # 预加载脚本
│   └── index.ts                 # 预加载入口
├── shared/                       # 共享类型和常量
│   └── types/                    # TypeScript 类型定义
├── public/                       # Vite 公共资源
├── dist/                         # 构建输出目录
├── package.json
├── tsconfig.json                 # TypeScript 配置 (严格模式)
├── tsconfig.node.json           # Node 环境 TypeScript 配置
├── vite.config.ts               # Vite 配置
├── electron-builder.json        # electron-builder 配置
├── .eslintrc.cjs                 # ESLint 配置
├── .prettierrc                  # Prettier 配置
└── SPEC.md                      # 功能规范链接
```

**Structure Decision**: 采用 Electron + Vite 标准项目结构，符合章程规定的 `main/` + `preload/` + `renderer/` 分离模式。渲染进程使用 Vue 3 Composition API，与主进程通过 preload 脚本的安全 IPC 接口通信。

## Complexity Tracking

> 无复杂度违规。骨架项目采用最小化配置，满足所有章程约束。

## Phase 0: Research

### 研究内容

1. **Electron + Vite 集成方案**
   - 决策: 使用 electron-vite 或手动配置 Vite + Electron
   - 理由: electron-vite 提供开箱即用的集成，但手动配置更灵活可控
   - 备选: electron-vite 框架

2. **Vue 3 + TypeScript 最佳实践**
   - 决策: 使用 `<script setup>` 语法 + TypeScript
   - 理由: 章程要求使用 Vue 3 Composition API，`<script setup>` 是最简洁的写法

3. **electron-builder 配置**
   - 决策: 使用 electron-builder 进行打包
   - 理由: 成熟稳定，文档完善，支持 Windows exe 打包

### 关键技术点

| 项目 | 选择 | 理由 |
|------|------|------|
| 构建工具 | Vite 5.x | 快速启动，热更新支持好 |
| 桌面框架 | Electron 28.x | LTS 版本，稳定兼容 |
| UI 框架 | Vue 3.4+ | 章程指定 |
| 类型系统 | TypeScript 5.x (严格) | 章程指定 |
| 打包工具 | electron-builder | 成熟方案 |
| 代码规范 | ESLint + Prettier | 章程要求 |
