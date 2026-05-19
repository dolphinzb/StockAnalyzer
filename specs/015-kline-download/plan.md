# Implementation Plan: 自选股K线数据下载功能（含前复权支持）

**Branch**: `015-kline-download` | **Date**: 2026-05-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-kline-download/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

本次变更在现有K线下载功能基础上，**在手动下载弹窗中增加复权类型复选框**，支持用户自主选择下载前复权、不复权或两者都下载。**核心变更**：1) 日期选择对话框增加复权类型复选框组（前复权、不复权，默认全选）；2) 用户可自由选择需要下载的复权类型；3) 系统根据用户选择的复权类型下载对应的K线数据；4) 验证至少选择一种复权类型才能提交；5) 保持向后兼容（默认全选与原有行为一致）。

**变更时间**: 2026-05-13  
**变更原因**: 用户对下载功能的灵活性需求，允许仅下载特定复权类型的数据

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.4.2, Vue 3.4.21  
**Primary Dependencies**: stock-sdk (K线数据获取，支持adjust参数), Pinia 3.0.4 (状态管理), sql.js 1.14.1 (本地数据库), Electron 28.2.10 (桌面框架)  
**Storage**: SQLite via sql.js (kline_data表增加adjust_type字段)  
**Testing**: vitest (项目已配置)  
**Target Platform**: Windows desktop (Electron应用)
**Project Type**: desktop-app (Electron + Vite + Vue3)  
**Performance Goals**: 单只股票1年两种复权数据15秒内完成；50只自选股自动下载120秒内完成；K线弹窗1秒内渲染完成（100条以内）；拖动60fps流畅  
**Constraints**: 必须使用 stock-sdk 库的 adjust 参数；所有K线数据同一张表通过adjust_type区分；自动下载串行执行避免API限流；K线弹窗完全依赖数据库；迁移脚本可重复执行  
**Scale/Scope**: 单用户桌面应用，自选股数量50只以内

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Project constitution file not configured. Using project best practices instead.

### Code Quality Gates
- [x] TypeScript strict mode compliance (project uses TypeScript)
- [x] Electron IPC communication for main/renderer process
- [x] Local database persistence via sql.js with migration support
- [x] 中文注释 (项目规则要求)
- [x] Database migration script idempotency (可重复执行)

### Architecture Consistency
- [x] Follow existing project structure (electron/services/, electron/database.ts)
- [x] Database operations in electron/database.ts
- [x] Type definitions in shared/types/index.ts
- [x] Service pattern in electron/services/

### No Violations Detected

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
electron/
├── database.ts                          # 修改：kline_data表增加adjust_type字段，更新saveKlineData支持复权类型，getKlineData增加adjustType参数
├── index.ts                             # 修改：kline:download返回两种复权类型统计，kline:get-chart-data从数据库查询
└── services/
    └── klineDownloadService.ts          # 修改：downloadKline同时下载两种复权类型，新增downloadSingleAdjust内部函数，自动下载串行策略调整

sql/
└── init.sql                             # 修改：整合所有DDL语句，包括kline_data表的adjust_type字段

shared/types/
└── index.ts                             # 修改：KlineData增加adjustType字段，KlineDownloadResult增加unadjustedCount/adjustedCount

preload/
└── index.ts                             # 修改：klineAPI返回值调整

src/
├── components/
│   ├── StockItem.vue                    # 修改：下载结果提示显示两种复权类型统计
│   ├── StockList.vue                    # 无变化
│   ├── KlineDownloadDialog.vue          # 修改：增加复权类型复选框组，添加验证逻辑，传递adjustTypes参数
│   └── KlineChartDialog.vue             # 修改：从数据库加载数据，无数据时显示提示，不再调用stock-sdk
├── composables/
│   └── useKlineChart.ts                 # 修改：getChartData从数据库查询，无数据返回空数组
├── stores/
│   └── watchlist.ts                     # 修改：downloadKline方法接收并传递adjustTypes参数
└── types.ts                             # 修改：重新导出更新后的类型
```

**Structure Decision**: 采用现有Electron + Vue3项目结构，在electron/services/中扩展klineDownloadService.ts处理两种复权类型的下载逻辑，在electron/database.ts中增加adjust_type字段支持和迁移脚本执行，UI层修改主要集中在结果提示和数据源切换。

## Key Design Decisions

1. **UI交互设计**: 在KlineDownloadDialog.vue中使用Element Plus的el-checkbox-group组件实现复权类型复选框组，包含"前复权"和"不复权"两个选项
2. **默认行为**: 复选框默认全部勾选（v-model初始值为['', 'qfq']），保持与原有"同时下载两种类型"的行为一致
3. **验证逻辑**: 在提交前验证至少选择一个复权类型，若未选择则禁用确定按钮并显示错误提示"请至少选择一种复权类型"
4. **参数传递**: watchlist.ts的downloadKline方法接收adjustTypes数组参数（'' | 'qfq'），直接传递给IPC handler和stock-sdk，无需转换
5. **后端适配**: klineDownloadService.ts的downloadKline函数接收adjustTypes参数，遍历数组依次下载每种复权类型
6. **结果展示**: 下载完成后仅显示用户选择的复权类型的统计信息，格式为"下载完成，共获取 N 条不复权数据，M 条前复权数据"（仅显示已选择的类型）
7. **向后兼容**: 默认全选确保老用户的使用习惯不受影响，新用户可根据需要灵活选择
8. **参数一致性**: UI层、Store层、Service层均使用与stock-sdk一致的adjust参数值（''表示不复权，'qfq'表示前复权），避免不必要的映射转换

## Complexity Tracking

| Area | Complexity | Notes |
|------|-----------|-------|
| UI复选框组件集成 | Low | 使用Element Plus现成组件，简单绑定v-model |
| 验证逻辑实现 | Low | 简单的数组长度检查，禁用按钮或显示提示 |
| 参数传递链路调整 | Low | watchlist.ts → IPC → service，逐层传递adjustTypes数组，无需转换 |
| 下载逻辑调整 | Medium | service层遍历adjustTypes数组，依次下载每种类型，分别统计结果 |
| 结果提示更新 | Low | 仅显示用户选择的复权类型的统计信息 |
| 向后兼容性保证 | Low | 默认全选保持原有行为，不影响老用户 |
| 参数一致性设计 | Low | UI层直接使用stock-sdk的adjust参数值，避免映射转换 |

## Phase Completion Summary

### Phase 0: Research ✅ COMPLETE (无需修改)
- [x] 所有NEEDS CLARIFICATION已解决
- [x] research.md生成完成 (545行)
- [x] stock-sdk集成方案确定
- [x] 交易日判断策略确定
- [x] K线图渲染技术选型确定(Canvas 2D)
- [x] 交易标注实现方案确定(复用TradeRecord)
- [x] 可复用组件清单整理完成

**Note**: 本次变更不涉及新的技术研究，Phase 0文档无需修改。

### Phase 1: Design & Contracts ✅ UPDATED
- [x] data-model.md更新完成 - 手动下载流程增加复权类型选择步骤
- [x] contracts/ipc-api.md更新完成 - downloadKline接口增加adjustTypes参数
- [x] quickstart.md更新完成 - 使用说明增加复权类型选择说明
- [x] migration.sql已存在 - 数据库迁移脚本无需修改
- [x] Agent context更新脚本执行(generic类型)

**Note**: 本次变更主要是UI层交互增强，数据模型和接口契约需要更新以支持adjustTypes参数。

### Constitution Check Re-evaluation ✅ PASSED
- [x] TypeScript strict mode compliance
- [x] Electron IPC communication
- [x] Local database persistence with migration support
- [x] 中文注释规范
- [x] Database migration script idempotency
- [x] Architecture consistency maintained

## Artifacts Generated

### Documentation
- ✅ **research.md** (545行) - Phase 0研究文档（无需修改）
- ✅ **data-model.md** (424行) - Phase 1数据模型定义（已更新手动下载流程）
- ✅ **contracts/ipc-api.md** (345行) - Phase 1 IPC接口契约（已更新downloadKline接口）
- ✅ **quickstart.md** (116行) - Phase 1快速开始指南（已更新使用说明）
- ✅ **migration.sql** (110行) - 数据库迁移脚本（已存在）
- ⏳ **tasks.md** - Phase 2任务列表（已添加Phase 9新任务）

### Source Code Changes Required
- src/components/KlineDownloadDialog.vue - 增加复权类型复选框组和验证逻辑
- src/stores/watchlist.ts - downloadKline方法增加adjustTypes参数
- electron/services/klineDownloadService.ts - downloadKline函数接收并处理adjustTypes参数
- shared/types/index.ts - 更新KlineDownloadInput和KlineDownloadResult接口
- electron/index.ts - IPC handler接收adjustTypes参数
- preload/index.ts - API暴露无需修改（参数可选）

## Next Steps

Plan phase complete. Ready for task generation with `/speckit.tasks` command.

本次变更主要集中在UI层和参数传递链路：
- UI层：KlineDownloadDialog.vue增加复选框组件和验证逻辑
- Store层：watchlist.ts传递adjustTypes参数
- Service层：klineDownloadService.ts根据adjustTypes下载对应复权类型
- 类型定义：更新接口以支持adjustTypes参数

所有设计决策已记录，Phase 0和Phase 1文档已更新以反映本次变更。

Proceed to Phase 2 (Task Generation) when ready.
