# Implementation Plan: 资金管理功能

**Branch**: `013-fund-management` | **Date**: 2026-05-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-fund-management/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

实现资金管理功能页面，包含两个标签页：转账记录管理和盈利统计。转账记录支持增删改查操作，采用无限滚动加载；盈利统计基于用户选择的时间段计算转出金额-转入金额+当前持仓金额的盈利情况。使用模态对话框进行编辑和删除确认，实时查询持仓系统获取最新数据。

## Technical Context

**Language/Version**: TypeScript 5.4.2, Vue 3.4.21  
**Primary Dependencies**: Pinia 3.0.4 (状态管理), sql.js 1.14.1 (本地数据库), Electron 28.2.10 (桌面框架)  
**Storage**: SQLite via sql.js (本地数据库存储转账记录)  
**Testing**: 暂无测试框架 (NEEDS CLARIFICATION - 项目未配置测试框架)  
**Target Platform**: Windows desktop (Electron应用)  
**Project Type**: desktop-app (Electron + Vite + Vue3)  
**Performance Goals**: 转账列表初始20条记录1秒内加载，后续每批20条0.5秒内加载；盈利统计1秒内计算完成  
**Constraints**: <1秒响应时间，离线可用（本地数据库），中文界面  
**Scale/Scope**: 支持最多1000+条转账记录，单用户桌面应用

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Project constitution file is template-only (not yet configured). Using project best practices instead.

### Code Quality Gates
- [x] TypeScript strict mode compliance (project uses TypeScript)
- [x] Vue 3 Composition API pattern (existing codebase uses this)
- [x] Pinia store for state management (existing pattern)
- [x] Electron IPC communication for main/renderer process
- [x] Local database persistence via sql.js

### Architecture Consistency
- [x] Follow existing project structure (src/views, src/components, src/stores)
- [x] Electron services in electron/services/ directory
- [x] Database operations in electron/database.ts
- [x] Type definitions in shared/types/

### No Violations Detected

## Project Structure

### Documentation (this feature)

```text
specs/013-fund-management/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── views/
│   └── FundManagementView.vue    # 资金管理主页面（包含两个标签页）
├── components/
│   ├── TransferRecordList.vue    # 转账记录列表组件（无限滚动）
│   ├── TransferRecordItem.vue    # 转账记录单项组件
│   ├── TransferEditor.vue        # 转账编辑模态对话框
│   ├── ProfitStatistics.vue      # 盈利统计组件
│   └── DateRangePicker.vue       # 日期范围选择器组件
├── stores/
│   └── fundManagement.ts         # 资金管理Pinia store
├── composables/
│   └── useFundManagement.ts      # 资金管理组合式函数
└── types.ts                      # 扩展类型定义（TransferRecord等）

electron/
├── database.ts                   # 扩展现有数据库操作（添加转账记录表）
└── services/
    └── fundService.ts            # 资金管理Electron服务（IPC handlers）

shared/types/
└── index.ts                      # 扩展现有类型定义（TransferRecord接口）
```

**Structure Decision**: 采用单项目结构（Option 1），遵循现有项目架构模式。前端使用Vue 3组件化开发，状态管理使用Pinia，后端使用Electron IPC通信，数据存储使用sql.js本地数据库。新增功能模块与现有代码结构保持一致。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No complexity tracking needed** - All design decisions follow existing project patterns and best practices. No architectural violations detected.
