# Tasks: 搭建项目基础框架

**Input**: Design documents from `/specs/001-project-scaffold/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: 任务按用户故事组织，每个故事可独立实现和测试

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件，无依赖）
- **[Story]**: 用户故事标签 (US1, US2, US3)
- 描述中包含精确的文件路径

## Phase 1: 项目初始化

**Purpose**: 创建项目基础结构，初始化 npm 项目

- [ ] T001 创建项目目录结构 per plan.md: `electron/`, `src/`, `preload/`, `shared/`, `public/`
- [ ] T002 初始化 npm 项目，创建 `package.json`，配置项目元数据
- [ ] T003 安装核心依赖：electron@^28.0.0, vite@^5.0.0, vue@^3.4.0, typescript@^5.3.0
- [ ] T004 安装开发依赖：@vitejs/plugin-vue, electron-builder, electron-log
- [ ] T005 [P] 安装代码规范依赖：eslint, prettier, eslint-plugin-vue, @commitlint/cli, @commitlint/config-conventional

---

## Phase 2: TypeScript 配置

**Purpose**: 配置 TypeScript 严格模式，符合章程要求

- [ ] T006 创建 `tsconfig.json`，配置严格模式：`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
- [ ] T007 创建 `tsconfig.node.json`，配置 Node 环境（用于 Vite 配置）
- [ ] T008 创建 `shared/types/index.ts`，定义 WindowAPI 和 ElectronVersions 类型

---

## Phase 3: Vite 配置

**Purpose**: 配置 Vite 构建工具，支持 Electron 主进程和渲染进程

- [ ] T009 创建 `vite.config.ts`，配置 Vue 插件和 Electron 主进程构建
- [ ] T010 配置 Vite 开发服务器，启用 HMR 和端口配置
- [ ] T011 配置 Vite 生产构建，输出到 `dist/` 目录

---

## Phase 4: Electron 主进程

**Purpose**: 实现 Electron 主进程，包含窗口管理和 IPC 处理

**Independent Test**: 执行 `npm run dev` 后 Electron 窗口成功打开

- [ ] T012 创建 `electron/index.ts`，实现主进程入口
- [ ] T013 [P] 在 `electron/index.ts` 中配置 BrowserWindow，启用 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- [ ] T014 [P] 实现窗口管理 IPC 处理器：window:minimize, window:maximize, window:close, window:is-maximized
- [ ] T015 [P] 集成 electron-log，配置主进程日志输出
- [ ] T016 配置开发模式热重载检测，自动重启主进程

---

## Phase 5: Preload 脚本

**Purpose**: 实现预加载脚本，通过 contextBridge 暴露安全 API

**Independent Test**: 渲染进程可调用 window.minimize(), window.maximize(), window.close()

- [ ] T017 创建 `preload/index.ts`，配置 contextBridge
- [ ] T018 [P] 暴露 WindowAPI：`platform`, `versions`, `minimize`, `maximize`, `close`, `isMaximized`
- [ ] T019 [P] 暴露 IPC 通道监听：window:maximized 事件

---

## Phase 6: Vue 渲染进程

**Purpose**: 实现 Vue 3 渲染进程，使用 Composition API

**Independent Test**: 执行 `npm run dev` 后浏览器窗口显示 Vue 应用界面

- [ ] T020 创建 `src/main.ts`，初始化 Vue 应用
- [ ] T021 创建 `src/App.vue`，使用 `<script setup>` 语法，实现基本布局
- [ ] T022 [P] 创建 `src/components/TitleBar.vue`，实现自定义标题栏（最小化、最大化、关闭按钮）
- [ ] T023 [P] 在 TitleBar 中实现窗口控制按钮，调用 preload API
- [ ] T024 创建 `src/styles/main.scss`，配置基本样式和 CSS Variables

---

## Phase 7: 代码规范配置

**Purpose**: 配置 ESLint、Prettier 和 commitlint

- [ ] T025 创建 `.eslintrc.cjs`，配置 Vue 3 + TypeScript + Prettier 规则
- [ ] T026 创建 `.prettierrc`，配置代码格式化规则
- [ ] T027 [P] 创建 `commitlint.config.js`，配置 Conventional Commits 规则
- [ ] T028 [P] 配置 husky 和 lint-staged（可选，按需）

---

## Phase 8: 构建配置

**Purpose**: 配置 electron-builder 生成 Windows 可执行文件

**Independent Test**: 执行 `npm run build` 后 `dist/win-unpacked/` 包含 `.exe` 文件

- [ ] T029 创建 `electron-builder.json`，配置 Windows 打包选项
- [ ] T030 [P] 配置输出目录：`dist/win-unpacked/`
- [ ] T031 [P] 配置构建目标：nsis 或 portable

---

## Phase 9: 命令脚本

**Purpose**: 在 package.json 中配置 npm scripts

- [ ] T032 配置 `npm run dev`：启动 Vite 开发服务器和 Electron
- [ ] T033 配置 `npm run build`：执行 Vite 构建和 electron-builder 打包
- [ ] T034 配置 `npm run preview`：预览构建结果
- [ ] T035 [P] 配置 `npm run lint` 和 `npm run lint:fix`
- [ ] T036 [P] 配置 `npm run typecheck`：执行 TypeScript 类型检查

---

## Phase 10: 测试配置（可选）

**Purpose**: 配置 Vitest 和 Playwright 测试框架

**Note**: 测试覆盖率检查非强制，仅配置测试框架和占位文件

- [ ] T037 [P] 安装 Vitest 依赖，配置 `vitest.config.ts`
- [ ] T038 [P] 创建测试占位文件：`tests/unit/.gitkeep`, `tests/e2e/.gitkeep`
- [ ] T039 [P] 安装 Playwright 依赖（可选）

---

## Phase 11: 项目完善

**Purpose**: 创建 SPEC.md 链接和 README 更新

- [ ] T040 创建 `SPEC.md`，链接到 `specs/001-project-scaffold/spec.md`
- [ ] T041 更新项目 README，添加开发命令说明

---

## 依赖关系图

```
Phase 1 (项目初始化)
    │
    ▼
Phase 2 (TypeScript) ──┐
    │                  │
    ▼                  │
Phase 3 (Vite)        │  Phase 4, 5 (Electron + Preload)
    │                  │         │
    ▼                  ▼         │
Phase 6 (Vue) ◄───────┴──────────┘
    │
    ▼
Phase 7 (代码规范)
    │
    ▼
Phase 8 (构建配置)
    │
    ▼
Phase 9 (命令脚本)
    │
    ▼
Phase 10 (测试配置，可选)
    │
    ▼
Phase 11 (项目完善)
```

## 并行执行机会

- T003, T004, T005 可并行执行
- T006, T007 可并行执行
- T012, T013, T014, T015 可并行执行（同一文件的不同功能）
- T017, T018, T019 可并行执行
- T021, T022, T023 可并行执行（不同组件）
- T025, T026, T027, T028 可并行执行

## 任务统计

| 阶段 | 任务数 | 说明 |
|------|--------|------|
| Phase 1 | 5 | 项目初始化 |
| Phase 2 | 3 | TypeScript 配置 |
| Phase 3 | 3 | Vite 配置 |
| Phase 4 | 5 | Electron 主进程 |
| Phase 5 | 3 | Preload 脚本 |
| Phase 6 | 5 | Vue 渲染进程 |
| Phase 7 | 4 | 代码规范配置 |
| Phase 8 | 3 | 构建配置 |
| Phase 9 | 4 | 命令脚本 |
| Phase 10 | 3 | 测试配置（可选） |
| Phase 11 | 2 | 项目完善 |
| **总计** | **40** | |

## 建议的 MVP 范围

**最小可行产品 (MVP)** = Phase 1-6 + Phase 8-9

即：
- T001-T020 基本项目结构
- T021-T023 基本 UI 和窗口控制
- T029-T036 构建和命令配置

**可选增强**：
- T024-T028 代码规范
- T037-T039 测试配置
- T025-T028 commitlint 配置
