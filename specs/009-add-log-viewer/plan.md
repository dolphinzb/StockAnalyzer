# Implementation Plan: 日志查看功能

**Branch**: `009-add-log-viewer` | **Date**: 2026-04-06 | **Spec**: [link](file:///c:/WebProjects/StockAnalyzer/specs/009-add-log-viewer/spec.md)

**Input**: Feature specification from `/specs/009-add-log-viewer/spec.md`

## Summary

在设置图标旁新增日志图标按钮，点击后进入日志查看页面，以只读模式展示 `C:\Users\AI\AppData\Roaming\stockanalyzer\logs\main.log` 文件内容，并支持30秒定时自动刷新。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia, electron-builder
**Storage**: N/A (读取外部日志文件)
**Testing**: Vitest (项目已有)
**Target Platform**: Windows 桌面
**Project Type**: Electron 桌面应用程序
**Performance Goals**: 页面加载 ≤3秒，文件读取 ≤2秒
**Constraints**: 必须通过 IPC 通信读取主进程文件，禁止在渲染进程直接访问文件系统
**Scale/Scope**: 单文件日志查看，文件大小预估 <10MB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 状态 | 说明 |
|------|------|------|
| 性能优先 | ✅ PASS | 页面切换 ≤500ms，加载指示器满足反馈要求 |
| 数据完整性 | ✅ PASS | 只读模式保护日志内容 |
| 安全性 | ✅ PASS | 通过 preload API 暴露安全接口，禁用节点集成 |
| 可维护性 | ✅ PASS | TypeScript 严格模式，组件化结构 |
| 用户体验 | ✅ PASS | 加载指示器、错误提示、滚动支持 |

## Project Structure

### Documentation (this feature)

```text
specs/009-add-log-viewer/
├── plan.md              # This file
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/renderer/
├── components/
│   └── LogViewer.vue    # 日志查看页面组件
├── views/
│   └── LogPage.vue      # 日志页面视图
└── stores/
    └── logStore.ts      # 日志状态管理

src/main/
└── handlers/
    └── logHandler.ts   # 主进程日志读取处理器

src/preload/
└── api/
    └── logApi.ts       # 预加载脚本暴露的日志API
```

**Structure Decision**: 基于现有项目结构 (src/renderer/components, src/renderer/views, src/main/handlers)，新增日志查看相关模块。

## Data Model

### LogViewer Component State

```typescript
interface LogViewerState {
  content: string;           // 日志文件内容
  isLoading: boolean;         // 加载状态
  error: string | null;       // 错误信息
  lastRefresh: Date | null;   // 最后刷新时间
  isPageVisible: boolean;    // 页面可见性
}
```

### IPC Contract

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `log:read` | filePath: string | `{ content: string, error?: string }` | 读取日志文件内容 |
| `log:getPath` | - | `string` | 获取日志文件路径 |

## Quickstart

1. 安装依赖: `npm install`
2. 开发模式: `npm run dev`
3. 构建: `npm run build`

## Complexity Tracking

> 无复杂度违规

| 评估项 | 决策 | 理由 |
|--------|------|------|
| 是否需要新依赖 | 否 | 使用 Electron 内置 fs 模块 |
| 是否需要新页面路由 | 是 | 新增日志查看页面 |
| IPC 接口数量 | 2个 | log:read, log:getPath |
| 组件数量 | 1个 | LogViewer 组件 |

## Implementation Phases

### Phase 1: 核心实现

1. **Preload API**: 在 `src/preload/api/logApi.ts` 暴露日志读取接口
2. **Main Process Handler**: 在 `src/main/handlers/logHandler.ts` 实现日志读取逻辑
3. **Log Store**: 在 `src/renderer/stores/logStore.ts` 管理日志状态
4. **LogViewer Component**: 在 `src/renderer/components/LogViewer.vue` 实现日志展示组件
5. **Log Page**: 在 `src/renderer/views/LogPage.vue` 实现日志页面
6. **导航集成**: 在设置菜单旁添加日志图标入口
7. **自动刷新**: 实现30秒定时刷新和页面可见性检测

### Phase 2: 边界处理

1. 文件不存在时的空状态展示
2. 文件读取失败时的错误提示
3. 大文件优化（分页或虚拟滚动）
4. 文件正在写入时的读取处理
