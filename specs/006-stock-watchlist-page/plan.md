# Implementation Plan: 自选股页面

**Branch**: `006-stock-watchlist-page` | **Date**: 2026-04-04 | **Spec**: [spec.md](../006-stock-watchlist-page/spec.md)
**Input**: Feature specification from `/specs/006-stock-watchlist-page/spec.md`

## Summary

实现自选股页面功能，用户可在 Electron 桌面应用中管理自选股列表、设置价格阈值、开启/关闭监控，并通过定时任务自动获取股票价格。告警通过页面显示和系统通知方式提醒用户，数据持久化到 SQLite 数据库。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia, sql.js
**Storage**: SQLite (sql.js)
**Testing**: Vitest (前端), Electron 测试
**Target Platform**: Windows 桌面 (Electron)
**Project Type**: Desktop Application (Electron + Vue3)
**Performance Goals**: 列表加载 <3s, 阈值校验 <100ms
**Constraints**: 必须使用 IPC 通信，禁止直接数据库访问
**Scale/Scope**: 单用户本地应用，支持 100+ 股票

## Constitution Check

| 原则 | 状态 | 说明 |
|------|------|------|
| 性能优先 | ✅ | 页面切换使用 computed 缓存，定时任务不阻塞 UI |
| 数据完整性 | ✅ | 阈值校验、API 重试机制、数据库事务 |
| 安全性 | ✅ | IPC 通信通过 preload，参数化查询防注入 |
| 可维护性 | ✅ | TypeScript 严格模式，组件化设计 |
| 用户体验 | ✅ | 加载状态、错误提示、视觉反馈 |

## Project Structure

### Documentation (this feature)

```text
specs/006-stock-watchlist-page/
├── plan.md              # 本文件
├── research.md          # Phase 0 研究文档
├── data-model.md        # Phase 1 数据模型
├── quickstart.md        # Phase 1 快速入门
├── contracts/           # Phase 1 接口契约
│   └── ipc-contract.md  # IPC 通信接口定义
└── tasks.md             # Phase 2 任务清单 (由 /speckit.tasks 生成)
```

### Source Code

```text
src/
├── main/                           # Electron 主进程
│   ├── index.ts                    # 主进程入口
│   ├── database/
│   │   ├── index.ts                # 数据库初始化
│   │   └── watchlist.ts            # 自选股数据访问
│   ├── services/
│   │   ├── priceFetcher.ts         # 价格获取服务
│   │   └── alertService.ts         # 告警服务
│   └── ipc/
│       └── handlers.ts             # IPC 处理器
├── preload/
│   └── index.ts                    # Preload 脚本 (暴露 API)
└── renderer/                       # Vue 渲染进程
    ├── views/
    │   └── WatchlistView.vue        # 自选股页面
    ├── components/
    │   ├── StockList.vue            # 股票列表
    │   ├── StockItem.vue            # 列表项
    │   ├── StockEditor.vue          # 添加/编辑对话框
    │   └── RefreshButton.vue        # 刷新按钮
    ├── stores/
    │   └── watchlist.ts             # Pinia 状态管理
    └── composables/
        └── useStockWatcher.ts       # 股票监控组合式函数

tests/
├── unit/
│   ├── watchlist.test.ts           # 单元测试
│   └── alertService.test.ts        # 告警服务测试
└── integration/
    └── ipc.test.ts                  # IPC 集成测试
```

**Structure Decision**: 基于 Electron + Vue3 架构，自选股功能作为独立模块。主进程处理数据库和定时任务，渲染进程负责 UI 展示。

## Complexity Tracking

> 无复杂度违规

## 技术决策

### 1. 数据库: SQLite + sql.js

- 轻量级本地数据库，适合桌面应用
- sql.js 是 SQLite 的 JavaScript 实现，适合 Electron 环境
- 配置存储在 config 表的 app_config JSON 字段中
- 跨平台支持，无需额外安装

### 2. 定时任务: setInterval + 状态管理 + 交易时间段检查

- 简单可靠，适合桌面应用
- 可通过 Electron 生命周期事件清理
- 与 Pinia store 集成
- 定时任务只在交易时间段内执行（上午09:30-11:30，下午13:00-15:00）

### 3. 系统通知: Electron Notification API

- 原生支持，跨平台
- 与系统通知中心集成
- 无需额外依赖

### 4. 告警防抖: 内存级别 Map

- 防抖只需运行时有效
- 5分钟超时自动清除
- 不需要持久化
