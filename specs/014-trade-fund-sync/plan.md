# Implementation Plan: 交易记录新增时自动同步资金明细

**Branch**: `014-trade-fund-sync` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)

## Summary

在用户新增交易记录(trade_record)时，自动在资金明细表(transfer_records)中创建对应的资金流水记录。买入自动创建STOCK_BUY、卖出自动创建STOCK_SELL和DIVIDEND_TAX(按FIFO逐批计算股息税)、股息自动创建DIVIDEND。transfer_records表结构不变，不新增关联字段。同步失败时通过Toast通知提示用户，但不阻止交易记录保存。

## Technical Context

**Language/Version**: TypeScript 5.4.2, Vue 3.4.21  
**Primary Dependencies**: Pinia 3.0.4 (状态管理), sql.js 1.14.1 (本地数据库), Electron 28.2.10 (桌面框架)  
**Storage**: SQLite via sql.js (现有transfer_records表，不新增字段)  
**Testing**: vitest (项目已配置)  
**Target Platform**: Windows desktop (Electron应用)  
**Project Type**: desktop-app (Electron + Vite + Vue3)  
**Performance Goals**: 自动同步在交易记录保存后100ms内完成；FIFO股息税计算在50ms内完成  
**Constraints**: 不修改transfer_records表结构，不新增字段；不涉及修改/删除交易记录的同步；不涉及盈利统计页面  
**Scale/Scope**: 单用户桌面应用，交易记录数量级百条以内

## Constitution Check

*GATE: Must pass before Phase 0 research.*

**Note**: Project constitution file not configured. Using project best practices instead.

### Code Quality Gates
- [x] TypeScript strict mode compliance (project uses TypeScript)
- [x] Electron IPC communication for main/renderer process
- [x] Local database persistence via sql.js
- [x] 中文注释 (项目规则要求)

### Architecture Consistency
- [x] Follow existing project structure (electron/services/, electron/database.ts)
- [x] Database operations in electron/database.ts
- [x] Type definitions in shared/types/
- [x] FundService in electron/services/fundService.ts

### No Violations Detected

## Project Structure

### Documentation (this feature)

```text
specs/014-trade-fund-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code Changes (repository root)

```text
electron/
├── database.ts                          # 修改：addTradeRecord中调用同步逻辑
├── index.ts                             # 修改：无（已有IPC handlers）
└── services/
    ├── fundService.ts                   # 修改：无（已有addTransferRecord方法）
    └── tradeService.ts                  # 修改：新增calcDividendTax函数，导出手续费计算辅助函数

shared/types/
└── index.ts                             # 无变更（TransferRecord类型已包含STOCK_BUY/STOCK_SELL/DIVIDEND_TAX）

src/
└── components/
    └── PositionItem.vue                 # 修改：Toast通知逻辑（同步失败时提示）
```

**Key Design Decision**: 自动同步逻辑放在 `tradeService.ts` 中实现，在 `database.ts` 的 `addTradeRecord` 函数中调用。这样保持数据库操作的原子性，同时复用现有的 `FundService.addTransferRecord` 方法。

## Complexity Tracking

No complexity tracking needed - All design decisions follow existing project patterns.
