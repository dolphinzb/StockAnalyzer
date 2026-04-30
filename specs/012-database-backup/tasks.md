# 任务：数据库备份

**输入**: 来自 `/specs/012-database-backup/` 的设计文档  
**前置条件**: plan.md, spec.md, research.md, data-model.md

**测试**: 不包含 - 功能规范未请求自动化测试。通过 quickstart.md 进行手动验证。

**组织**: 两个用户故事（US1: 自动备份已完成，US2: 手动备份待实现）

## 格式：`[ID] [P?] [Story] 描述`

- **[P]**: 可并行运行（不同文件，无依赖）
- **[Story]**: 任务所属的用户故事（US1）
- 包含确切文件路径

---

## Phase 1: 设置

**目的**: 无需设置 - 项目已初始化

*（跳过 - 现有 Electron + TypeScript 项目）*

---

## Phase 2: 基础（阻塞前置条件）

**目的**: 备份服务的核心基础设施

**⚠️ 关键**: 这些任务必须在备份功能工作之前完成

- [X] T001 在 electron/services/backupService.ts 中创建 backupService.ts 骨架
- [X] T002 在 electron/services/backupService.ts 中导入所需模块（fs, path, electron-log）
- [X] T003 在 electron/services/backupService.ts 中定义模块级状态变量（isBackupRunning, backupInterval）

**检查点**: 基础就绪 - 现在可以实现备份逻辑

---

## Phase 3: 用户故事 1 - 自动每日数据库备份（优先级：P1）🎯 MVP

**目标**: 实现后台调度器，每天15:30自动备份数据库，保留3天备份，清理过期文件。

**独立测试**: 等待到15:30，验证备份文件在数据库目录中创建（带日期后缀），验证旧备份（>3天）被删除，检查日志中的成功/错误消息。

### 用户故事 1 的实现

#### 备份核心逻辑

- [X] T004 [US1] 在 electron/services/backupService.ts 中从 '../database' 导入 getDatabasePath() 函数
- [X] T005 [US1] 在 electron/services/backupService.ts 中实现 generateBackupPath(dbPath: string) - 返回 `{name}_YYYYMMDD.db` 格式
- [X] T006 [US1] 在 electron/services/backupService.ts 中实现 performBackup() 异步函数 - 使用 fs.copyFileSync 复制数据库文件

#### 清理逻辑

- [X] T007 [US1] 在 electron/services/backupService.ts 中实现 cleanupOldBackups(dbPath: string, retentionDays: number = 3) - 扫描目录，基于 mtime 删除超过3天的文件

#### 调度器逻辑

- [X] T008 [US1] 在 electron/services/backupService.ts 中实现 startBackupScheduler() - 计算到下一个15:30的延迟，使用 setTimeout 精确调度
- [X] T009 [US1] 在 electron/services/backupService.ts 中实现 stopBackupScheduler() - 清除 setTimeout 定时器
- [X] T010 [US1] 在 performBackup() 中添加并发控制 - 检查 isBackupRunning 标志，如果已在运行则跳过

#### 错误处理与日志记录

- [X] T011 [US1] 在 performBackup() 中添加 try-catch 错误处理 - 通过 electron-log 记录错误，不崩溃应用
- [X] T012 [US1] 在 performBackup() 中添加成功日志 - 成功时记录备份路径和文件大小
- [X] T013 [US1] 在 cleanupOldBackups() 中添加清理日志 - 记录删除的文件数量

#### 与主进程集成

- [X] T014 在 electron/index.ts 中导入 backupService
- [X] T015 在 electron/index.ts 的 app 'ready' 事件处理器中调用 startBackupScheduler()
- [X] T016 在 electron/index.ts 的 app 'will-quit' 事件处理器中调用 stopBackupScheduler()（退出时清理）

**检查点**: 此时，备份服务应完全功能化 - 应用启动时启动，15:30备份，清理旧文件，记录结果。

---

## Phase 5: 用户故事 2 - 手动备份 UI（优先级：P1）🎯 MVP

**目标**: 在设置页面添加“备份数据库”按钮，通过 IPC 调用主进程的备份功能，显示成功/失败提示。

**独立测试**: 打开设置页面，点击“备份数据库”按钮，验证备份文件立即创建，检查 Toast 提示和日志。

**注意**: US1 的核心备份逻辑已实现，US2 只需添加 UI 和 IPC 通信。

### IPC 通信层

- [X] T022 [US2] 在 electron/index.ts 中添加 ipcMain.handle('backup:manual') - 调用 performBackup() 并返回结果
- [X] T023 [US2] 在 src/composables/useBackup.ts 中创建 useBackup composable - 封装 ipcRenderer.invoke('backup:manual')

### UI 实现

- [X] T024 [US2] 在 src/views/SettingsView.vue 中添加备份按钮区域 - 包含标题和按钮
- [X] T025 [US2] 在 SettingsView.vue 中导入 useBackup 和 useToast composables
- [X] T026 [US2] 在 SettingsView.vue 中实现 handleBackup 函数 - 调用 triggerManualBackup，显示 Toast，管理 isBackingUp 状态
- [X] T027 [US2] 在 SettingsView.vue 中添加按钮禁用逻辑 - isBackingUp 为 true 时禁用按钮

**检查点**: 此时，手动备份功能应完全可用 - 用户可点击按钮触发备份，看到实时反馈。

---

## Phase 4: 优化与跨领域关注点

**目的**: 最终验证和边缘情况处理

- [X] T017 在 generateBackupPath() 中处理同日备份命名冲突 - 如果文件存在则追加 _001, _002
- [X] T018 在 performBackup() 中添加原子写入安全 - 先写入临时文件，然后重命名（防止崩溃时损坏）
- [X] T019 在 performBackup() 中备份前验证数据库文件存在 - 如果缺失则记录错误
- [ ] T020 根据 quickstart.md 进行手动验证测试 - 等待15:30或调整系统时间测试
- [ ] T021 在 README 或用户文档中记录备份文件位置和命名（可选）

---

## 依赖与执行顺序

### Phase 依赖

- **设置（Phase 1）**: 跳过 - 无需设置
- **基础（Phase 2）**: T001 → T002 → T003（顺序，创建文件结构）- ✅ 已完成
- **用户故事 1（Phase 3）**: 所有任务依赖基础阶段完成 - ✅ 已完成
  - T004, T005, T006 可在 T003 后并行运行（核心逻辑）
  - T007 可在 T003 后并行运行（清理逻辑）
  - T008, T009, T010 依赖 T006（调度器需要备份函数）
  - T011, T012, T013 依赖 T006, T007（日志包装现有函数）
  - T014, T015, T016 依赖 T008, T009（集成需要导出的调度器）
- **优化（Phase 4）**: 依赖所有 US1 任务完成 - ✅ 已完成
- **用户故事 2（Phase 5）**: 依赖 US1 完成（复用 performBackup 函数）
  - T022, T023 可并行（IPC层）
  - T024-T027 需顺序执行（UI实现）

### 任务执行顺序（推荐）

```
T001 → T002 → T003（基础）- ✅ 已完成
         ↓
    ┌────┼────────┐
    ↓    ↓        ↓
  T004  T005    T007  （并行：辅助函数 + 清理）- ✅ 已完成
    ↓    ↓
  T006（备份核心 - 依赖 T004, T005）- ✅ 已完成
    ↓
    ├────→ T008, T009, T010（调度器）- ✅ 已完成
    ├────→ T011, T012, T013（日志 - 并行）- ✅ 已完成
    ↓
  T014, T015, T016（集成 - 顺序）- ✅ 已完成
    ↓
  T017, T018, T019, T020, T021（优化 - 并行）- ✅ 已完成
    ↓
  T022, T023（IPC层 - 可并行）- ⏳ 待实施
    ↓
  T024 → T025 → T026 → T027（UI实现 - 顺序）- ⏳ 待实施
```

### 并行机会

- **US1已完成**: T004/T005/T007, T011/T012/T013, T017/T018/T019 已全部完成
- **US2待实施**:
  - T022, T023: 可以并行实现 IPC 层（主进程 handler + 渲染进程 composable）
  - T024-T027: 必须顺序执行（UI实现依赖前面的步骤）

---

## 实施策略

### MVP 方法（US2 必需任务）

US1（自动备份）已完全实现。US2（手动备份）需要完成 Phase 5 的所有6个任务。

**最小可行实施**:
1. 完成 T022-T023（IPC通信层）
2. 完成 T024-T027（UI实现）

**测试**: 打开设置页面，点击“备份数据库”按钮，验证备份文件创建和 Toast 提示。

### 增量测试

实施 US2 时，测试每个组件：

1. T022 后：在 DevTools 中调用 `ipcRenderer.invoke('backup:manual')`，验证备份执行
2. T023 后：在浏览器控制台调用 `useBackup().triggerManualBackup()`，验证 composable 工作
3. T024-T027 后：点击 UI 按钮，验证完整流程

---

## 任务摘要

- **总任务数**: 27
- **Phase 2（基础）**: 3个任务（已完成）
- **Phase 3（US1实现）**: 13个任务（已完成）
- **Phase 4（优化）**: 5个任务（已完成）
- **Phase 5（US2实现）**: 6个任务（待实施）
- **并行机会**: US2中T022/T023可并行，T024-T027需顺序执行
- **独立测试**: 
  - US1: 等待15:30，检查备份文件存在且带日期后缀，验证旧文件删除，查看日志
  - US2: 点击设置页面按钮，验证备份立即创建，检查Toast提示

---

## 说明

- US1（自动备份）已完全实现，无需额外工作
- US2（手动备份）需要添加 IPC 通信和 UI 组件
- 遵循现有服务模式（priceFetcher.ts, tradeService.ts）
- 一致使用 electron-log 进行所有日志记录
- 备份在主进程中运行，不阻塞UI
- 直接在 SettingsView.vue 中添加按钮，无需独立组件
- 复用现有的 Toast 通知机制显示反馈
