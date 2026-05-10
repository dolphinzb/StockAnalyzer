# Implementation Plan: 资金统计标签页

**Branch**: `016-fund-statistics` | **Date**: 2026-05-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-fund-statistics/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

为资金管理页面增加"资金统计"标签页（第一个位置），包括：
1. 当前资金概览：显示账户余额和持仓金额的数值卡片
2. 饼图展示：直观显示账户余额与持仓金额在总资产中的占比，支持鼠标悬停tooltip
3. 折线图趋势：展示过去60个月（每月一个数据点）的账户余额、持仓金额和总资产的变化趋势，支持鼠标悬停查看详细信息

技术实现：复用现有Canvas图表组件（useProfitChart composable），从transfer_records、trade_records、kline_data三个数据表获取数据。

## Technical Context

**Language/Version**: TypeScript 5.x, Vue 3.x, Electron 28.x  
**Primary Dependencies**: Vue 3 Composition API, Pinia (状态管理), SQLite (better-sqlite3)  
**Storage**: SQLite数据库 (transfer_records, trade_records, kline_data表)  
**Testing**: Vitest (单元测试), Playwright (E2E测试)  
**Target Platform**: Windows桌面应用 (Electron)  
**Project Type**: Desktop application (Electron + Vue3)  
**Performance Goals**: 
- 页面加载后2秒内显示完整资金概览
- 60个月折线图数据3秒内加载并渲染完成
- 鼠标悬停tooltip 0.3秒内响应
**Constraints**: 
- 使用Canvas技术绘制图表（与现有ProfitChart保持一致）
- 复用现有Modal组件显示错误提示
- 无需自动刷新，仅页面进入时加载一次
**Scale/Scope**: 
- 最多60个数据点（月度聚合）
- 单个用户本地数据存储

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASSED - No constitution violations detected
- 项目为Electron桌面应用，符合现有架构
- 复用现有组件和composable，遵循KISS原则
- 无新增外部依赖，保持技术栈一致性

## Project Structure

### Documentation (this feature)

```text
specs/016-fund-statistics/
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
├── components/
│   ├── FundStatistics.vue        # 新增：资金统计主组件
│   └── ProfitChart.vue           # 现有：复用饼图和折线图绘制逻辑
├── composables/
│   └── useProfitChart.ts         # 现有：Canvas图表绘制 composable（需扩展支持饼图）
├── stores/
│   └── fundManagement.ts         # 现有：扩展API方法获取统计数据
└── views/
    └── FundManagementView.vue    # 现有：调整标签页顺序，增加资金统计标签

electron/
├── services/
│   └── fundService.ts            # 现有：扩展API方法计算月度数据
└── database.ts                   # 现有：数据库查询方法

shared/types/
└── index.ts                      # 现有：扩展类型定义（FundOverview, MonthlyFundData等）
```

**Structure Decision**: 采用单项目结构，在现有资金管理模块基础上扩展。
- 新增 FundStatistics.vue 组件作为资金统计标签页的主组件
- 扩展现有 useProfitChart.ts composable 以支持饼图绘制（目前仅支持柱状图）
- 在 fundService.ts 中新增获取当前资金概览和月度历史数据的方法
- 在 fundManagement store 中扩展对应的状态管理和API调用
- 调整 FundManagementView.vue 的标签页顺序

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |

## Phase Completion Status

### ✅ Phase 0: Research - COMPLETED

- [x] research.md 已生成
- [x] 所有 NEEDS CLARIFICATION 已解决
- [x] 技术决策已记录

### ✅ Phase 1: Design & Contracts - COMPLETED

- [x] data-model.md 已生成
- [x] 实体定义完整（FundOverview, MonthlyFundData, PositionSnapshot, PieChartDataItem）
- [x] 数据流和关系已明确
- [x] quickstart.md 已生成
- [ ] contracts/ - 跳过（本项目为内部功能，无外部接口契约）
- [ ] Agent context update - 跳过（无新增技术栈）

### ⏸️ Phase 2: Task Planning - PENDING

- [ ] tasks.md 待生成（由 /speckit.tasks 命令执行）
