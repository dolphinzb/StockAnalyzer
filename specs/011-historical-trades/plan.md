# Implementation Plan: 历史开仓记录

**Branch**: `011-historical-trades` | **Date**: 2026-04-23 | **Spec**: [spec.md](file:///e:/StockAnalyzer/specs/011-historical-trades/spec.md)
**Input**: Feature specification from `/specs/011-historical-trades/spec.md`

## Summary

实现历史开仓记录页面，展示每只股票从开仓（持股数0首次买入）到清仓（持股数变为0）完整交易周期的统计数据。核心功能包括：交易周期识别、统计数据计算（买入/卖出次数、金额、分红金额、手续费、盈利）、列表展示（支持展开交易明细）、刷新功能（点击刷新按钮重新加载数据）。技术实现上，在 Electron 主进程新增历史交易查询与计算服务，渲染进程新增 Vue 页面组件展示数据。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia, sql.js (SQLite)
**Storage**: SQLite (sql.js) - 复用现有 trade_record 表
**Testing**: Vitest (单元测试), Playwright (E2E 测试)
**Target Platform**: Windows 桌面应用 (Electron)
**Project Type**: Desktop App (Electron + Vue 3)
**Performance Goals**: 历史记录查询与计算在 1 秒内完成（支持最多 1000 条交易记录）
**Constraints**: 所有计算在主进程完成，避免阻塞渲染进程；内存中处理 SQLite 数据
**Scale/Scope**: 单用户本地使用，数据量有限（数百至数千条交易记录）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

> 项目 constitution 为模板状态，无具体门控要求。遵循项目现有约定：
> - 类型定义在 `types.ts` 或 `shared/types/index.ts` 中
> - 代码使用中文注释
> - 公共接口需要 Javadoc 风格注释

## Project Structure

### Documentation (this feature)

```text
specs/011-historical-trades/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── historical-trade-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── HistoricalTradeItem.vue      # 单条历史记录项组件
│   └── HistoricalTradeDetail.vue    # 展开的交易明细组件
├── views/
│   └── HistoricalTradesView.vue     # 历史开仓记录页面
├── stores/
│   └── historicalTrades.ts          # Pinia store 管理历史交易状态
├── composables/
│   └── useHistoricalTrades.ts       # 历史交易数据获取与计算组合式函数
└── types.ts                         # 新增历史交易相关类型定义

electron/
├── services/
│   └── historicalTradeService.ts    # 历史交易周期识别与计算服务
└── database.ts                      # 扩展数据库查询方法

shared/
└── types/
    └── index.ts                     # 新增共享类型定义
```

**Structure Decision**: 采用现有单项目结构，在 `src/` 下新增 Vue 组件和 store，在 `electron/` 下新增主进程服务。复用现有 `trade_record` 表和数据库连接。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | 无 | 无 |
