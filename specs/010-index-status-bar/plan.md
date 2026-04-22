# Implementation Plan: 指数状态栏显示

**Branch**: `010-index-status-bar` | **Date**: 2026-04-21 | **Spec**: [spec.md](file:///E:/StockAnalyzer/specs/010-index-status-bar/spec.md)

## Summary

在现有股票监控系统的基础上，增加上证指数和深成指数数据的获取与显示。在每分钟定时任务和手动刷新时，一并获取指数数据，并在窗口底部状态栏中展示。状态栏支持红涨绿跌黑持平的颜色规则，以及箭头指示涨跌方向。

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia, better-sqlite3
**Storage**: SQLite (better-sqlite3) for local persistence
**Testing**: 暂无
**Target Platform**: Windows desktop
**Project Type**: desktop-app (Electron)
**Performance Goals**: 5秒内显示指数数据
**Constraints**: 必须使用现有监控定时任务的API调用接口，禁止单独调用
**Scale/Scope**: 2个指数（上证指数、深成指数）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

无 Constitution 约束（constitution.md 为模板状态）

## Project Structure

### Documentation (this feature)

```text
specs/010-index-status-bar/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── IndexStatusBar.vue    # 新增：指数状态栏组件
├── composables/
│   └── useIndexData.ts       # 新增：指数数据状态管理
├── stores/
│   └── watchlist.ts          # 修改：增加指数数据状态
└── views/
    └── WatchlistView.vue      # 修改：集成状态栏

electron/
├── services/
│   └── priceFetcher.ts       # 修改：增加指数数据获取
└── index.ts                  # 修改：IPC 通道扩展

shared/
└── types/
    └── index.ts              # 修改：新增指数数据类型
```

**Structure Decision**: 在现有 Electron + Vue 项目结构上，新增 IndexStatusBar 组件和 useIndexData composable，复用现有价格获取服务

## Complexity Tracking

无复杂度违规
