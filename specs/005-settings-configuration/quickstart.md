# Quick Start: 设置页面配置功能

**Branch**: `feature/005-settings-configuration`
**Date**: 2026-04-04

## 快速开始

### 1. 查看规范

在开始实现之前，请先阅读 [spec.md](../005-settings-configuration/spec.md) 了解功能需求。

### 2. 查看实现计划

查看 [plan.md](../005-settings-configuration/plan.md) 了解技术方案和任务分解。

### 3. 运行 lint 检查

```bash
npm run lint
```

### 4. 运行类型检查

```bash
npm run typecheck
```

### 5. 启动开发服务器

```bash
npm run dev
```

### 6. 访问设置页面

在应用侧边栏点击"设置"，查看设置页面。

## 开发任务清单

| # | 任务 | 依赖 |
|---|------|------|
| 1 | 创建 AppConfig 类型定义 | - |
| 2 | 实现 INI 解析/序列化 | Task 1 |
| 3 | 实现 loadConfig() | Task 2 |
| 4 | 实现 saveConfig() | Task 2 |
| 5 | 实现 getConfigPath() | - |
| 6 | 创建 electron/config.ts | Tasks 1-5 |
| 7 | 注册 IPC handlers | Task 6 |
| 8 | 暴露 preload API | Task 7 |
| 9 | 创建 useConfig.ts | Task 8 |
| 10 | 实现 SettingsView.vue | Task 9 |

## 验证步骤

1. 修改配置并保存
2. 重启应用，验证配置已加载
3. 删除 `~/.stockanalyzer/config.ini`
4. 重启应用，验证使用默认配置并创建文件

## 常见问题

**Q: 配置文件路径在哪？**
A: `~/.stockanalyzer/config.ini`（用户目录下的 .stockanalyzer 文件夹）

**Q: 如何重置配置？**
A: 点击设置页面的"重置"按钮，配置将恢复为默认值。