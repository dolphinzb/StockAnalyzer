# Feature Specification: 搭建项目基础框架

**Feature Branch**: `001-project-scaffold`
**Created**: 2026-04-03
**Status**: Draft
**Input**: User description: "搭建项目基础框架，确保可以构建并运行"

## User Scenarios & Testing

### User Story 1 - 开发者搭建项目环境 (Priority: P1)

作为开发者，我希望在克隆项目后能够快速搭建开发环境并启动应用。

**Why this priority**: 这是所有开发工作的基础，没有可运行的项目骨架就无法进行后续开发。

**Independent Test**: 可以通过执行 `npm install && npm run dev` 验证开发服务器能否启动。

**Acceptance Scenarios**:

1. **Given** 项目克隆到本地，**When** 执行 `npm install`，**Then** 所有依赖安装成功，无错误输出
2. **Given** 依赖安装完成，**When** 执行 `npm run dev`，**Then** Electron 应用窗口成功打开，显示主界面
3. **Given** 开发服务器运行中，**When** 修改前端代码，**Then** 页面自动热更新，无需重启应用

---

### User Story 2 - CI/CD 构建验证 (Priority: P1)

作为持续集成系统，我需要能够成功构建生产版本。

**Why this priority**: CI/CD 流水线必须能够成功构建项目才能进行自动化部署。

**Independent Test**: 可以通过执行 `npm run build` 验证构建是否成功。

**Acceptance Scenarios**:

1. **Given** 项目代码完整，**When** 执行 `npm run build`，**Then** 构建过程无错误完成
2. **Given** 构建完成，**When** 检查 `dist` 目录，**Then** 存在 `win-unpacked` 子目录
3. **Given** 构建完成，**When** 检查 `win-unpacked` 目录，**Then** 存在 `.exe` 可执行文件

---

### User Story 3 - 用户运行打包后的应用 (Priority: P2)

作为最终用户，我希望能够运行打包后的应用程序。

**Why this priority**: 用户需要使用打包后的应用，而不是开发版本。

**Independent Test**: 可以通过运行打包后的 `.exe` 文件验证应用能否正常启动。

**Acceptance Scenarios**:

1. **Given** 应用已打包，**When** 用户双击 `.exe` 文件，**Then** 应用窗口成功打开
2. **Given** 应用运行中，**When** 用户点击窗口关闭按钮，**Then** 应用正常退出，无崩溃

---

### Edge Cases

- Node.js 版本不兼容时，显示清晰的版本要求提示
- 网络问题导致依赖下载失败时，提供重试机制或使用镜像的建议
- 构建环境缺少必要工具（如 Visual C++ Build Tools）时，提供清晰的错误信息

## Requirements

### Functional Requirements

- **FR-001**: 项目必须在 `package.json` 中声明所有必要的依赖（Electron, Vite, Vue3, TypeScript 等）
- **FR-002**: 项目必须包含正确的 Vite 配置，支持 Electron 主进程和渲染进程
- **FR-003**: 项目必须包含 Electron 主进程入口文件，正确配置 BrowserWindow
- **FR-004**: 项目必须包含预加载脚本（preload），启用上下文隔离
- **FR-005**: 项目必须包含 Vue 3 渲染进程入口，正确配置 Composition API
- **FR-006**: 项目必须支持 `npm run dev` 启动开发服务器
- **FR-007**: 项目必须支持 `npm run build` 进行生产构建
- **FR-008**: 生产构建必须生成 Windows 可执行文件（`.exe`）
- **FR-009**: 项目必须配置 TypeScript 严格模式
- **FR-010**: 项目必须配置 ESLint 和 Prettier 代码规范

### Key Entities

- **ElectronMain**: Electron 主进程入口，负责创建窗口和管理应用生命周期
- **PreloadScript**: 预加载脚本，负责在渲染进程和主进程之间建立安全的通信桥梁
- **VueRenderer**: Vue 3 渲染进程，负责 UI 展示和用户交互
- **ViteConfig**: Vite 构建配置，定义开发服务器和生产构建规则

## Success Criteria

### Measurable Outcomes

- **SC-001**: 开发者执行 `npm install && npm run dev` 后，应用在 30 秒内启动并显示窗口
- **SC-002**: 执行 `npm run build` 后，生成的文件在 `dist/win-unpacked/` 目录下包含 `.exe` 文件
- **SC-003**: 打包后的 `.exe` 文件大小不超过 200MB
- **SC-004**: TypeScript 编译无错误，类型检查通过
- **SC-005**: ESLint 检查通过，无代码规范错误

## Assumptions

- 目标平台为 Windows 操作系统（x64 架构）
- 开发者已安装 Node.js 20.x LTS 和 Git
- 构建工具链包括 electron-builder 用于打包
- 项目采用明确定义的目录结构：main/（主进程）、preload/（预加载）、renderer/（渲染进程）

## Clarifications

### Session 2026-04-03

- Q: 功能范围边界 → A: 初始版本仅包含空白的应用框架，业务功能后续迭代
- Q: 开发期间的可观测性 → A: 配置 electron-log 进行主进程日志记录
- Q: 测试策略 → A: 初始骨架包含测试配置和占位测试文件，覆盖率检查非强制
- Q: 窗口管理功能 → A: 实现最小化、最大化、关闭按钮，窗口可调整大小
- Q: Git 提交规范 → A: 使用 Conventional Commits 格式，配置 commitlint 进行校验

## Out of Scope

- 股票数据获取功能
- 股票数据展示功能
- 技术指标计算功能
- 用户认证功能
- 数据持久化功能
