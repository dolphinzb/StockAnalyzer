# Tasks: 自选股K线数据下载功能（含前复权支持）

**Input**: Design documents from `/specs/015-kline-download/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - not explicitly requested in the feature specification. Implementation tasks only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Project structure**: Electron + Vue3 desktop app
- Backend: `electron/`, `shared/types/`, `preload/`
- Frontend: `src/`
- Database migration: `sql/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization - already complete (existing project)

*No setup tasks needed - project already exists with all infrastructure*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T001 [P] Update KlineData type definition in shared/types/index.ts (add adjustType field)
- [ ] T002 [P] Update KlineDownloadResult type in shared/types/index.ts (add unadjustedCount/adjustedCount)
- [ ] T003 Execute database migration script sql/015-kline-download.sql to add adjust_type column
- [ ] T004 Verify database migration success and data integrity
- [ ] T005 Update saveKlineData function signature in electron/database.ts to accept adjustType parameter
- [ ] T006 Update getKlineData function in electron/database.ts to filter by adjustType parameter
- [ ] T007 Add idx_kline_data_stock_date_adjust index creation to migration script

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - 手动下载历史K线数据（含前复权） (Priority: P1) 🎯 MVP

**Goal**: 用户点击下载K线按钮后，系统同时下载不复权和前复权两种数据，并分别显示成功条数

**Independent Test**: 在自选股列表中选择一只股票，点击下载K线按钮，选择日期范围后确认，验证数据库中是否同时存在不复权和前复权两种数据，且结果提示正确显示两种类型的数据条数

### Implementation for User Story 1

- [ ] T008 [US1] Add downloadSingleAdjust internal function in electron/services/klineDownloadService.ts
- [ ] T009 [US1] Modify downloadKline function in electron/services/klineDownloadService.ts to download both adjust types
- [ ] T010 [US1] Update kline:download IPC handler in electron/index.ts to return dual statistics
- [ ] T011 [US1] Update preload klineAPI.downloadKline return type in preload/index.ts
- [ ] T012 [US1] Update StockItem.vue download result toast to show both adjust type counts
- [ ] T013 [US1] Add error handling for partial success (one type fails, other succeeds) in klineDownloadService.ts
- [ ] T014 [US1] Add loading state management in watchlist store for download button disable

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - 自动下载当日K线数据（含前复权） (Priority: P1)

**Goal**: 交易日15:10自动串行下载所有自选股的两种复权类型数据，日志分别统计成功/失败数量

**Independent Test**: 在交易日15:10前后观察系统是否自动触发下载，检查日志文件中是否分别记录了不复权和前复权的下载结果；在非交易日验证系统不执行下载

### Implementation for User Story 2

- [ ] T015 [US2] Modify autoDownloadKlineData function in electron/services/klineDownloadService.ts for serial strategy
- [ ] T016 [US2] Implement per-stock serial download: stockA none → stockA qfq → stockB none → stockB qfq
- [ ] T017 [US2] Add independent retry logic for each adjust type (retry once if fails)
- [ ] T018 [US2] Update log format to show separate statistics for none and qfq types
- [ ] T019 [US2] Handle network interruption gracefully (keep completed stocks, mark incomplete as failed)
- [ ] T020 [US2] Add concurrency control to prevent API rate limiting

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - K线弹窗展示（完全依赖本地数据） (Priority: P1)

**Goal**: K线弹窗从数据库查询对应复权类型数据，无数据时显示明确提示，不再调用stock-sdk实时获取

**Independent Test**: 在自选股列表中点击一只已有K线数据的股票名称，验证K线弹窗是否正确从数据库加载数据并展示；删除数据库中某复权类型数据后，验证弹窗是否显示正确的提示信息

### Implementation for User Story 3

- [ ] T021 [US3] Modify getChartData function in electron/services/klineDownloadService.ts to query database by adjustType
- [ ] T022 [US3] Update kline:get-chart-data IPC handler in electron/index.ts to use database query
- [ ] T023 [US3] Modify KlineChartDialog.vue to show "暂无XXX复权数据，请先下载" when no data
- [ ] T024 [US3] Update adjust type switch logic in KlineChartDialog.vue to query database first
- [ ] T025 [US3] Keep current view unchanged when target adjust type has no data
- [ ] T026 [US3] Remove stock-sdk real-time fetch calls from KlineChartDialog.vue
- [ ] T027 [US3] Update useKlineChart.ts composable to handle empty data array gracefully

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: User Story 4 - 数据库迁移与兼容性 (Priority: P1)

**Goal**: 提供可重复执行的数据库迁移脚本，安全添加adjust_type字段，保证向后兼容

**Independent Test**: 执行迁移脚本，验证adjust_type字段是否正确添加，已有数据是否设置为''（不复权），查询功能是否正常，应用是否可正常启动和使用

### Implementation for User Story 4

- [ ] T028 [US4] Create migration script sql/015-kline-download.sql with ALTER TABLE approach
- [ ] T029 [US4] Add idempotency checks using temporary table mechanism
- [ ] T030 [US4] Implement transaction protection (BEGIN TRANSACTION / COMMIT)
- [ ] T031 [US4] Add data validation queries in migration script comments
- [ ] T032 [US4] Set existing records adjust_type = '' (unadjusted) in migration
- [ ] T033 [US4] Rebuild UNIQUE constraint to include adjust_type
- [ ] T034 [US4] Create composite index idx_kline_data_stock_date_adjust
- [ ] T035 [US4] Test migration script idempotency (run twice, verify no errors)
- [ ] T036 [US4] Verify backward compatibility - existing queries work without modification

**Checkpoint**: Database migration complete and verified

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T037 [P] Update TypeScript type exports in src/types.ts
- [ ] T038 [P] Add Chinese comments to all new code (项目规则要求)
- [ ] T039 Update documentation for K线下载功能 in README or docs/
- [ ] T040 Performance testing: verify manual download completes within 15 seconds
- [ ] T041 Performance testing: verify auto download of 50 stocks completes within 120 seconds
- [ ] T042 Performance testing: verify K线弹窗 renders within 1 second (≤100 records)
- [ ] T043 Edge case testing: one adjust type succeeds, other fails
- [ ] T044 Edge case testing: stock-sdk doesn't support certain adjust type
- [ ] T045 Edge case testing: user closes dialog during download
- [ ] T046 Code cleanup and refactoring
- [ ] T047 Security review: validate all user inputs and SQL queries

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - already complete
- **Foundational (Phase 2)**: BLOCKS all user stories - must complete first
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (all P1, can choose order)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Manual download with dual adjust types - depends on T001-T007
- **User Story 2 (P1)**: Auto download with serial strategy - depends on T001-T007
- **User Story 3 (P1)**: K线弹窗 database-only mode - depends on T001-T007
- **User Story 4 (P1)**: Database migration - depends on T001-T002 (types), can run in parallel with US1-3 implementation

### Within Each User Story

- Types before services (T001-T002 before T008-T009)
- Services before IPC handlers (T008-T009 before T010)
- IPC handlers before UI updates (T010 before T012)
- Core implementation before edge cases

### Parallel Opportunities

- **Phase 2**: T001, T002 can run in parallel (different type definitions)
- **Phase 2**: T005, T006 can run in parallel (different database functions)
- **Phase 3**: T008, T009 can run in parallel (service layer functions)
- **Phase 3**: T010, T011 can run in parallel (IPC and preload updates)
- **Phase 5**: T021, T022 can run in parallel (service and IPC)
- **Phase 5**: T023, T024, T025 can run in parallel (UI component updates)
- **Phase 6**: T028-T034 can run in parallel (migration script development)
- **Phase 7**: All polish tasks marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all type updates together:
Task: "Update KlineData type definition in shared/types/index.ts"
Task: "Update KlineDownloadResult type in shared/types/index.ts"

# Launch service layer functions together:
Task: "Add downloadSingleAdjust internal function in electron/services/klineDownloadService.ts"
Task: "Modify downloadKline function in electron/services/klineDownloadService.ts"

# Launch IPC and preload updates together:
Task: "Update kline:download IPC handler in electron/index.ts"
Task: "Update preload klineAPI.downloadKline return type in preload/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001-T007) - CRITICAL
2. Complete Phase 3: User Story 1 (T008-T014)
3. **STOP and VALIDATE**: Test manual download with dual adjust types
4. Verify database has both adjust_type values
5. Verify toast shows correct counts
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational (Phase 2) → Foundation ready
2. Add User Story 1 (Phase 3) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (Phase 4) → Test independently → Deploy/Demo
4. Add User Story 3 (Phase 5) → Test independently → Deploy/Demo
5. Add User Story 4 (Phase 6) → Test migration → Verify compatibility
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational (Phase 2) together
2. Once Foundational is done:
   - Developer A: User Story 1 (Manual download)
   - Developer B: User Story 2 (Auto download)
   - Developer C: User Story 3 (K线弹窗)
   - Developer D: User Story 4 (Migration script)
3. Stories complete and integrate independently

---

## Summary Statistics

- **Total tasks**: 47
- **Phase 2 (Foundational)**: 7 tasks
- **Phase 3 (US1 - Manual Download)**: 7 tasks
- **Phase 4 (US2 - Auto Download)**: 6 tasks
- **Phase 5 (US3 - K线弹窗)**: 7 tasks
- **Phase 6 (US4 - Migration)**: 9 tasks
- **Phase 7 (Polish)**: 11 tasks
- **Parallel opportunities**: 15+ tasks marked [P]

## Independent Test Criteria

- **US1**: Database contains both adjust_type values for downloaded stock; toast shows correct counts
- **US2**: Log file shows separate statistics for none and qfq; serial execution verified
- **US3**: K线弹窗 loads from database; shows prompt when no data; no stock-sdk calls
- **US4**: Migration script runs successfully twice; existing data has adjust_type=''; queries work

## Suggested MVP Scope

**Minimum Viable Product**: User Story 1 (Manual Download with Dual Adjust Types)
- Users can manually download both unadjusted and forward-adjusted K-line data
- Results show separate counts for each adjust type
- Database stores both types with proper adjust_type field
- Existing functionality remains intact

This delivers immediate value: users no longer need to download twice for different adjust types.
