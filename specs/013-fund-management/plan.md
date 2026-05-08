# Implementation Plan: 资金管理功能

**Branch**: `feature/fund-detail-upgrade` | **Date**: 2026-05-03 | **Updated**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-fund-management/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

实现资金管理功能页面，包含两个标签页：资金明细管理和盈亏统计。资金明细支持增删改查操作，采用无限滚动加载，系统自动计算每条记录的账户余额；盈亏统计基于用户选择的时间段，使用公式"盈亏金额=(期末账户余额+期末持仓市值)-(期初账户余额+期初持仓市值)+(转出金额-转入金额)"计算盈亏情况。其中，期末/期初账户余额来自transfer_records表，期末/期初持仓市值来自kline_data表各持股收盘价×持仓数量之和，转入/转出金额来自trade_record表。使用模态对话框进行编辑和删除确认。

## Technical Context

**Language/Version**: TypeScript 5.4.2, Vue 3.4.21  
**Primary Dependencies**: Pinia 3.0.4 (状态管理), sql.js 1.14.1 (本地数据库), Electron 28.2.10 (桌面框架)  
**Storage**: SQLite via sql.js (本地数据库存储资金明细记录和账户配置)  
**Testing**: 暂无测试框架 (NEEDS CLARIFICATION - 项目未配置测试框架)  
**Target Platform**: Windows desktop (Electron应用)  
**Project Type**: desktop-app (Electron + Vite + Vue3)  
**Performance Goals**: 资金明细列表初始20条记录1秒内加载，后续每批20条0.5秒内加载；盈亏统计1秒内计算完成；账户余额自动计算在100ms内完成  
**Constraints**: <1秒响应时间，离线可用（本地数据库），中文界面  
**Scale/Scope**: 支持最多1000+条资金明细记录，单用户桌面应用

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
│   ├── TransferRecordList.vue    # 资金明细列表组件（无限滚动）- 需重命名为FundDetailList.vue
│   ├── TransferRecordItem.vue    # 资金明细单项组件 - 需重命名为FundDetailItem.vue
│   ├── TransferEditor.vue        # 资金明细编辑模态对话框 - 需重命名为FundDetailEditor.vue
│   ├── ProfitStatistics.vue      # 盈亏统计组件
│   └── DateRangePicker.vue       # 日期范围选择器组件
├── stores/
│   └── fundManagement.ts         # 资金管理Pinia store
├── composables/
│   └── useFundManagement.ts      # 资金管理组合式函数
└── types.ts                      # 扩展类型定义（TransferRecord/FundDetailRecord等）

electron/
├── database.ts                   # 扩展现有数据库操作（添加account_balance字段到transfer_records表）
└── services/
    └── fundService.ts            # 资金管理Electron服务（IPC handlers，增加账户余额自动计算逻辑）

shared/types/
└── index.ts                      # 扩展现有类型定义（TransferRecord更名为FundDetailRecord，增加accountBalance字段，扩展type枚举）
```

**Structure Decision**: 采用单项目结构（Option 1），遵循现有项目架构模式。前端使用Vue 3组件化开发，状态管理使用Pinia，后端使用Electron IPC通信，数据存储使用sql.js本地数据库。新增功能模块与现有代码结构保持一致。

**Key Changes from Original Design**:
1. 组件命名：建议将Transfer*组件重命名为FundDetail*以反映新功能
2. 数据库变更：在transfer_records表中增加account_balance字段
3. 业务逻辑：增加账户余额自动计算和级联更新逻辑
4. 类型扩展：资金类型从2种扩展到4种（IN/OUT/DIVIDEND/DIVIDEND_TAX）

**Key Changes on 2026-05-08**:
1. 盈亏统计公式更新：从"盈利=转出金额+账户余额+当前持仓金额-转入金额"改为"盈亏金额=(期末账户余额+期末持仓市值)-(期初账户余额+期初持仓市值)+(转出金额-转入金额)"
2. 数据来源变更：账户余额从transfer_records表获取（期初/期末分别取对应日期最近记录），持仓市值从kline_data表获取（收盘价×持仓数量），转入/转出金额从trade_record表获取（BUY/SELL类型交易）
3. 盈亏统计展示字段更新：期初账户余额、期末账户余额、期初持仓市值、期末持仓市值、转入总额、转出总额、盈亏金额
4. 新增IPC接口：getOpeningBalance（已存在）、getClosingBalance、getHoldingsMarketValue(date)、getTradeStatsInRange

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No complexity tracking needed** - All design decisions follow existing project patterns and best practices. No architectural violations detected.
