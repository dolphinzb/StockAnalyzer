# Specification Quality Checklist: 资金管理功能

**Purpose**: Validate specification completeness and quality before proceeding to planning  
**Created**: 2026-05-03  
**Updated**: 2026-05-06 - Updated for fund detail upgrade  
**Updated**: 2026-05-08 - Updated for profit statistics formula change  
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Plan Document Status

- [x] plan.md updated to reflect fund detail upgrade
- [x] data-model.md updated with new FundDetailRecord entity
- [x] Account balance calculation logic documented
- [x] Database schema changes documented (account_balance field)
- [x] Type definitions updated (4 fund types, accountBalance field)
- [x] Migration strategy for existing data documented
- [x] plan.md updated on 2026-05-08 for profit statistics formula change
- [x] data-model.md updated with new ProfitStatistics entity (opening/closing account balance, holdings value, trade stats)
- [x] IPC contracts updated with new interfaces (getHoldingsMarketValue, getTradeStatsInRange)
- [x] Data flow updated to reflect new calculation process

## Tasks Document Status

- [x] tasks.md updated to reflect fund detail upgrade
- [x] All task descriptions use "资金明细" instead of "转账记录"
- [x] Added tasks for account balance auto-calculation (T018a, T009, T010)
- [x] Added database migration task (T002a) for existing records
- [x] Updated acceptance criteria for 4 fund types
- [x] Task counts updated: Phase 1 (4), Phase 2 (14), Phase 3 (18)
- [x] MVP scope updated to 36 tasks (was 32)
- [x] Parallel opportunities updated with new tasks
- [x] Removed Phase 5 (Quick Entry feature) - simplified to 4 phases
- [x] Total tasks reduced from 83 to 78
- [x] **Task statuses properly set based on existing code reuse**
  - 57 tasks marked as completed `[x]` (can be reused)
  - 21 tasks marked as pending `[ ]` (need modification)
- [x] tasks.md needs update for new profit statistics formula and data sources

## Notes

- All checklist items passed validation
- Specification updated on 2026-05-06 to upgrade transfer records to fund details
- Added support for 4 fund types: IN, OUT, DIVIDEND, DIVIDEND_TAX
- Added automatic account balance calculation and persistence
- Plan and data model documents synchronized with spec changes
- Tasks document fully updated with new requirements and task counts
- Phase 5 (Quick Entry) removed to simplify implementation scope
- Final task count: 78 tasks across 5 phases
- **Smart task status**: 57 tasks completed (reusable), 21 tasks pending (need modification)
- **Code reuse strategy**: Maximize reuse of existing transfer record functionality
- **2026-05-08 update**: Profit statistics formula changed from "盈利=转出+余额+持仓-转入" to "盈亏=(期末余额+期末持仓)-(期初余额+期初持仓)+(转出-转入)"
- **New data sources**: transfer_records (account balance), kline_data (holdings market value), trade_record (trade stats)
- **New IPC interfaces**: getHoldingsMarketValue, getTradeStatsInRange (replacing getCurrentHoldingsTotal)
- Ready for `/speckit.implement` to start coding implementation
