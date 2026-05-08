# Implementation Plan: 自选股K线数据下载功能

**Branch**: `015-kline-download` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)

## Summary

为自选股列表增加K线数据下载功能，包含手动下载和自动下载两种模式。手动下载：在自选股操作列增加"下载K线"按钮，点击弹出日期选择对话框，下载指定时间段的日K线数据（不复权原始数据），完成后Toast通知结果。自动下载：交易日15:10自动串行下载所有自选股当日K线数据，失败自动重试1次，结果记录到日志。使用 stock-sdk 库获取数据，所有K线数据存储在同一张 kline_data 表中，按股票代码+日期UPSERT去重。

## Technical Context

**Language/Version**: TypeScript 5.4.2, Vue 3.4.21  
**Primary Dependencies**: stock-sdk (K线数据获取), Pinia 3.0.4 (状态管理), sql.js 1.14.1 (本地数据库), Electron 28.2.10 (桌面框架)  
**Storage**: SQLite via sql.js (新增 kline_data 表)  
**Testing**: vitest (项目已配置)  
**Target Platform**: Windows desktop (Electron应用)  
**Project Type**: desktop-app (Electron + Vite + Vue3)  
**Performance Goals**: 单只股票1年K线数据10秒内完成；50只自选股自动下载60秒内完成  
**Constraints**: 必须使用 stock-sdk 库；所有自选股K线数据同一张表；K线数据不复权；自动下载串行逐只  
**Scale/Scope**: 单用户桌面应用，自选股数量50只以内

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
- [x] Type definitions in shared/types/index.ts
- [x] Service pattern in electron/services/

### No Violations Detected

## Project Structure

### Documentation (this feature)

```text
specs/015-kline-download/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/
│   └── ipc-api.md       # IPC interface contracts
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code Changes (repository root)

```text
electron/
├── database.ts                          # 修改：新增 kline_data 表初始化、saveKlineData、getKlineData 方法
├── index.ts                             # 修改：新增 kline:download、kline:get-data IPC handlers，启动/停止自动下载调度器
└── services/
    └── klineDownloadService.ts          # 新增：K线数据下载服务（stock-sdk集成、自动下载调度、交易日判断）

shared/types/
└── index.ts                             # 修改：新增 KlineData、KlineDownloadResult、KlineDownloadInput、KlineAPI 类型

src/
├── components/
│   ├── StockItem.vue                    # 修改：增加"下载K线"按钮
│   ├── StockList.vue                    # 修改：增加"下载K线"列头
│   └── KlineDownloadDialog.vue          # 新增：K线下载日期选择对话框
├── stores/
│   └── watchlist.ts                     # 修改：增加下载状态管理
└── types.ts                             # 修改：重新导出 KlineData 等类型
```

**Key Design Decision**: K线下载逻辑放在 `klineDownloadService.ts` 中实现，通过 IPC 暴露给渲染进程。自动下载调度参考现有 `backupService.ts` 的 setTimeout 递归模式。数据库操作在 `database.ts` 中新增方法。UI 复用现有 `Modal.vue` 和 `DateRangePicker.vue` 组件。

## Complexity Tracking

| Area | Complexity | Notes |
|------|-----------|-------|
| stock-sdk 集成 | Low | 成熟npm包，TypeScript类型完整，API简单 |
| 数据库表设计 | Low | 单表设计，UPSERT语义，与现有模式一致 |
| 自动下载调度 | Medium | 参考backupService模式，需处理交易日判断和重试 |
| UI交互 | Medium | 需调整StockItem布局，新增对话框组件 |
| 交易日历缓存 | Medium | 需处理API不可用时的回退策略 |
