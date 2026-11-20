## Purpose

本规格定义桌面应用的运行时基线（Electron / Node 版本）以及升级运行时后必须保持不回归的行为约束，避免因运行时过旧阻塞依赖升级或缺失安全修复。

## Requirements

### Requirement: 桌面运行时版本基线

应用 SHALL 基于 Electron 35 及以上版本构建与分发，其内置 Node.js 版本 MUST 不低于 22。版本基线 MUST 在 `package.json` 中以依赖声明固化，并可通过 `process.versions.electron` 校验。

#### Scenario: 版本基线校验
- **WHEN** 以开发模式或安装版启动应用
- **THEN** `process.versions.electron` 不低于 35，且 `process.versions.node` 不低于 22

### Requirement: 升级后既有行为不回归

运行时升级后，应用的窗口、托盘、通知、IPC 契约与存储路径 SHALL 保持升级前的行为，不得因升级产生功能缺失。

#### Scenario: 启动与窗口显示
- **WHEN** 启动安装版应用
- **THEN** 主窗口正常显示，K 线图表可加载，说明主进程与渲染进程的 IPC 通信正常

#### Scenario: 关闭窗口隐藏到托盘
- **WHEN** 用户点击窗口关闭按钮（非退出）
- **THEN** 窗口隐藏而非退出进程，托盘图标仍可见

#### Scenario: 托盘退出
- **WHEN** 用户通过托盘菜单选择退出
- **THEN** 应用执行退出流程（记录退出日志、停止各调度器）

#### Scenario: 备份失败通知
- **WHEN** 数据库备份失败
- **THEN** 系统仍能弹出系统通知提示失败原因

#### Scenario: 存储路径不变
- **WHEN** 应用读取数据库或写日志
- **THEN** 数据库仍位于 `~/.stockanalyzer/stockanalyzer.db`，日志仍位于 `%APPDATA%\stockanalyzer\logs\`，与升级前一致

### Requirement: 打包与部署链路可用

运行时升级后，`npm run deploy` SHALL 仍能一步完成构建、打包与安装目录同步，产出的安装版可正常启动。

#### Scenario: 部署成功
- **WHEN** 执行 `npm run deploy`
- **THEN** 命令成功结束，安装目录包含可运行的可执行文件，且文件数量与 `release/win-unpacked` 一致

#### Scenario: 安装版可启动
- **WHEN** 从安装目录启动应用
- **THEN** 应用能加载现有数据库并显示窗口，不需要任何额外配置
