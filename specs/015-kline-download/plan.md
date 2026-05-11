# Implementation Plan: 自选股K线数据下载功能（含前复权支持）

**Branch**: `015-kline-download` | **Date**: 2026-05-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-kline-download/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

扩展现有K线下载功能，增加前复权数据的下载、存储和展示能力。**核心变更**：1) 手动下载时同时获取不复权和前复权两种数据；2) 自动下载时也下载两种复权类型，采用串行策略（股票A不复权→前复权→股票B...）；3) 数据库kline_data表增加adjust_type字段区分复权类型；4) K线弹窗完全依赖本地数据库数据，不再实时调用stock-sdk；5) 提供数据库迁移脚本安全添加字段。使用 stock-sdk 的 adjust 参数（''不复权，'qfq'前复权）获取数据，所有数据存储在同一张表中，按股票代码+日期+复权类型UPSERT去重。

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
└── 015-kline-download.sql               # 新增：数据库迁移脚本（添加adjust_type字段，重建约束和索引）

shared/types/
└── index.ts                             # 修改：KlineData增加adjustType字段，KlineDownloadResult增加unadjustedCount/adjustedCount

preload/
└── index.ts                             # 修改：klineAPI返回值调整

src/
├── components/
│   ├── StockItem.vue                    # 修改：下载结果提示显示两种复权类型统计
│   ├── StockList.vue                    # 无变化
│   ├── KlineDownloadDialog.vue          # 无变化（下载流程对用户透明）
│   └── KlineChartDialog.vue             # 修改：从数据库加载数据，无数据时显示提示，不再调用stock-sdk
├── composables/
│   └── useKlineChart.ts                 # 修改：getChartData从数据库查询，无数据返回空数组
├── stores/
│   └── watchlist.ts                     # 修改：下载状态管理支持两种复权类型统计
└── types.ts                             # 修改：重新导出更新后的类型
```

**Structure Decision**: 采用现有Electron + Vue3项目结构，在electron/services/中扩展klineDownloadService.ts处理两种复权类型的下载逻辑，在electron/database.ts中增加adjust_type字段支持和迁移脚本执行，UI层修改主要集中在结果提示和数据源切换。

## Key Design Decisions

1. **数据存储**: kline_data表增加adjust_type字段（TEXT NOT NULL DEFAULT ''），联合唯一约束改为UNIQUE(stock_code, trade_date, adjust_type)，复合索引idx_kline_data_stock_date_adjust
2. **下载策略**: 手动下载时两种复权类型可并行或串行（保证原子性），自动下载时必须串行（股票A不复权→前复权→股票B...）避免API限流
3. **K线弹窗**: 完全依赖数据库数据，打开时先查询对应复权类型，无数据显示"暂无XXX复权数据，请先下载"，切换时同样查询数据库
4. **迁移脚本**: 存放在sql/015-kline-download.sql，使用临时表机制保证可重复执行，事务保护，包含验证查询
5. **错误处理**: 一种复权类型失败不影响另一种，分别记录结果；自动下载每种复权类型独立重试1次
6. **性能调整**: 手动下载从10秒放宽至15秒，自动下载从60秒放宽至120秒（数据量翻倍）
7. **向后兼容**: 迁移脚本为已有数据设置adjust_type=''，现有查询功能不受影响

## Complexity Tracking

| Area | Complexity | Notes |
|------|-----------|-------|
| stock-sdk 集成 | Low | 成熟npm包，adjust参数支持''和'qfq' |
| 数据库表结构变更 | Medium | 需重建表以修改UNIQUE约束，迁移脚本需保证数据安全 |
| 迁移脚本设计 | Medium | 需可重复执行，事务保护，验证数据完整性 |
| 下载逻辑调整 | Medium | 同时下载两种复权类型，分别统计成功/失败 |
| 自动下载串行策略 | Medium | 每只股票依次下载不复权→前复权，重试策略调整 |
| K线弹窗数据源切换 | Low | 从实时获取改为数据库查询，无数据时显示提示 |
| UI结果提示更新 | Low | 显示两种复权类型的统计信息 |
| 向后兼容性 | Low | 已有数据设置adjust_type=''，查询功能正常 |
