# 实施计划：数据库备份

**分支**: `012-database-backup` | **日期**: 2026-04-29 | **规范**: [spec.md](./spec.md)
**输入**: 来自 `/specs/012-database-backup/spec.md` 的功能规范

**注意**: 此模板由 `/speckit.plan` 命令填充。参见 `.specify/templates/plan-template.md` 了解执行工作流。

## 摘要

实现数据库备份功能，包括两个用户故事：
1. **自动备份**：每天15:30自动备份SQLite数据库文件到同一目录，使用日期后缀命名（YYYYMMDD格式），保留最近3天的备份并自动清理过期文件。
2. **手动备份**：在设置页面添加“备份数据库”按钮，用户点击后立即执行备份，复用自动备份的核心逻辑，显示成功/失败提示。

备份失败时记录日志，不影响主程序运行。

## 技术上下文

**语言/版本**: TypeScript 5.4.2, Node.js (Electron运行时)  
**主要依赖**: fs模块(内置), electron-log 5.1.1, Vue 3 (UI组件)  
**存储**: 通过文件系统复制备份SQLite数据库文件  
**测试**: 自动备份通过检查文件和日志验证，手动备份通过UI交互测试  
**目标平台**: Windows桌面 (Electron应用)  
**项目类型**: 桌面应用 - 后台服务 + UI交互  
**性能目标**: 备份在5秒内完成，不阻塞UI线程  
**约束**: 同时只能执行一个备份任务，需防止重复触发  
**规模/范围**: 每日自动备份 + 按需手动备份，保留3个文件

## 章程检查

*门控：必须在 Phase 0 研究之前通过。Phase 1 设计后重新检查。*

✅ **通过** - 项目章程处于模板状态，无有效约束。

- 无库优先要求违反（功能扩展现有 Electron 应用）
- 无 CLI 接口要求（带 GUI 的桌面应用）
- 测试策略将在任务阶段定义
- 无集成测试冲突
- 无版本控制或破坏性变更预期

**设计后重新评估**: ✅ **仍然通过**
- 自动备份设计遵循现有服务模式（priceFetcher.ts, tradeService.ts）
- 手动备份需要添加 IPC 通信和 UI 组件
- 未引入新的外部依赖
- 保持单项目架构

## 项目结构

### 文档（此功能）

```text
specs/012-database-backup/
├── plan.md              # 此文件 (/speckit.plan 命令输出)
├── research.md          # Phase 0 输出 (/speckit.plan 命令)
├── data-model.md        # Phase 1 输出 (/speckit.plan 命令)
├── quickstart.md        # Phase 1 输出 (/speckit.plan 命令)
└── tasks.md             # Phase 2 输出 (/speckit.tasks 命令 - 不由 /speckit.plan 创建)
```

### 源代码（仓库根目录）

```text
electron/
├── services/
│   └── backupService.ts      # 现有：备份服务核心逻辑（已实现自动备份）
├── database.ts               # 现有：获取数据库路径
└── index.ts                  # 主进程：已集成备份调度器，需添加 IPC handler

src/
├── views/
│   └── SettingsView.vue      # 修改：在设置页面添加备份按钮
└── composables/
    └── useBackup.ts          # 新增：备份功能的 composable，处理 IPC 通信
```

**结构决策**: 
- **自动备份**（已完成）：极简实现，仅在 `electron/services/` 中创建 backupService.ts
- **手动备份**（新增）：直接在 SettingsView.vue 中添加按钮，通过 composable 调用 IPC，无需独立组件

## 复杂度跟踪

> **仅在章程检查有违反需要证明时填写**

| 违反 | 为何需要 | 拒绝更简单方案的原因 |
|-----------|------------|-------------------------------------|
| [例如：第4个项目] | [当前需求] | [为何3个项目不够] |
| [例如：Repository模式] | [具体问题] | [为何直接DB访问不够] |
