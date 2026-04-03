# Quickstart Guide: 搭建项目基础框架

**Feature**: 001-project-scaffold
**Date**: 2026-04-03

## Prerequisites

- Node.js 20.x LTS
- Git
- Windows 10/11 (x64)

## Setup Steps

### 1. Clone and Install

```bash
# 克隆项目
git clone <repository-url>
cd StockAnalyzer

# 安装依赖
npm install
```

### 2. Start Development Server

```bash
# 启动开发服务器
npm run dev
```

应用将在几秒内启动，Electron 窗口将自动打开。

### 3. Build for Production

```bash
# 构建生产版本
npm run build
```

构建完成后，可执行文件位于 `dist/win-unpacked/` 目录。

### 4. Run Built Application

```bash
# 方式一：直接运行
.\dist\win-unpacked\StockAnalyzer.exe

# 方式二：使用 npm preview
npm run preview
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览构建结果 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run lint:fix` | 自动修复 ESLint 问题 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |

## Troubleshooting

### Node.js Version Error

如果遇到版本错误，确保已安装 Node.js 20.x：

```bash
node --version  # 应该显示 v20.x.x
```

### Build Fails

确保已安装所有依赖：

```bash
rm -rf node_modules
npm install
```

### Windows SmartScreen Warning

首次运行 .exe 文件时，Windows SmartScreen 可能会显示警告。点击 "更多信息" → "仍要运行" 即可。

## Project Structure Overview

```
StockAnalyzer/
├── electron/          # 主进程代码
├── src/               # Vue 渲染进程代码
├── preload/           # 预加载脚本
├── shared/            # 共享类型定义
└── dist/              # 构建输出
```

## Next Steps

- 查看 [SPEC.md](../../SPEC.md) 了解功能规范
- 查看 [specs/001-project-scaffold/spec.md](./spec.md) 了解详细需求
- 开始开发新功能
