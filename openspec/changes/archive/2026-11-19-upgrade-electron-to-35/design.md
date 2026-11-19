## Context

**现状**

- `electron@^28.2.10`（实际安装 28.3.3）：内置 Node 18.18.2、ABI 119、N-API 9。
- 打包：`electron-builder@24.13.3`，`npm run deploy` 调用 `scripts/build-and-deploy.ps1`（build → electron-builder --win → robocopy 镜像到 `%LOCALAPPDATA%\Programs\StockAnalyzer`）。
- 主进程使用的 Electron API：`app`、`BrowserWindow`、`Tray`、`Menu`、`Notification`、`dialog`、`shell`、`ipcMain`、`nativeImage`（`electron/index.ts`）。
- 应用无其它原生依赖（`sql.js` 是 WASM），因此升级只为满足 Node 版本要求与安全基线。

**POC 实测数据（2026-11-19）**

| 组合 | 结果 |
|---|---|
| better-sqlite3 13.2.0 + Electron 28.3.3（Node 18.18） | `require` 成功，`new Database()` 进程崩溃 |
| better-sqlite3 13.2.0 + Node 22.20（ABI 127） | 正常 |
| better-sqlite3 13.2.0 + Electron 35.7.5（Node 22.16、ABI 133） | 正常 |
| better-sqlite3 11.x | 无 Node 22 预编译产物，本机无 MSVC，安装失败 |
| better-sqlite3 12.x | `engines.node` 为 20+，Electron 28 不满足 |

**约束**

- 单机桌面应用，安装目录需可运行；用户数据（`%APPDATA%\stockanalyzer\`、`~/.stockanalyzer\`）不得受影响。
- Windows + PowerShell 5.1 的部署脚本已稳定，改动需保持其编码与调用约束（见既有 build-and-deploy skill 的硬性约束）。

## Goals / Non-Goals

**Goals：**

- 运行时满足 Node ≥ 22，解除 `better-sqlite3@13` 的阻塞。
- 升级后应用行为不回归：托盘、隐藏窗口、通知、IPC、数据库与日志路径。
- 打包与部署链路仍然一条命令可用（`npm run deploy`）。

**Non-Goals：**

- 不引入 SQLite 引擎、不改持久化实现。
- 不重构主进程代码、不改前端。
- 不处理「退出后进程残留」这一独立缺陷。

## Decisions

### D1：目标版本锁定 Electron 35.x

**决策**：`electron@^35.7.5`（Node 22.16、Chromium 134）。

**理由**：

1. 满足 `better-sqlite3@13` 的 `engines.node >= 22`，且 POC 已验证能正常加载；
2. 相比直接跳到最新版（38+），35.x 与项目现有 electron-builder 的兼容概率更高，升级面更小；
3. 若后续需要更高版本，`engines` 约束已满足，可在同一基线上继续小步升级。

**代价**：Chromium 28 → 134 跨度较大，渲染层存在行为差异可能，需按 D4 做安装版冒烟。

### D2：升级范围限定在依赖与打包，不改业务代码

**决策**：除 `package.json` / `package-lock.json` 与（必要时的）electron-builder 配置外，不改动 `electron/`、`src/` 源码。若升级导致 API 行为变化引起回归，只做最小修复，并在 tasks 中记录。

**理由**：把「运行时升级」与「功能改动」隔离，回归失败时能明确定位是升级导致还是代码导致。

### D3：打包链先沿用 electron-builder 24.13.3，不兼容再升

**决策**：先以现有 `electron-builder@24.13.3` 打包 Electron 35；若失败（如无法识别 Electron 版本、`asarUnpack` 行为变化），升级到 25/26 并验证 `files` 配置与 `scripts/build-and-deploy.ps1` 无需改动。

**理由**：builder 升级会牵动打包行为（asar、签名、安装器），能不动就不动。

### D4：验收以「安装版冒烟」为准

**决策**：验收必须包含 `npm run deploy` 后在安装目录启动真实 exe，并逐项确认：

1. 窗口正常显示、K 线图表可加载（主进程↔渲染进程 IPC 正常）；
2. 关闭窗口隐藏到托盘，托盘图标与菜单可用，「退出」能触发退出流程；
3. 备份失败通知（`Notification`）仍可弹出；
4. 手动单只/批量下载可完成，进度事件能推送；
5. 数据库路径仍为 `~/.stockanalyzer/stockanalyzer.db`，日志仍写入 `%APPDATA%\stockanalyzer\logs\`。

**理由**：`npm run build` 通过不能证明运行时可用，Electron 升级的回归通常出现在 API 行为与资源路径上。

### D5：回滚策略

**决策**：升级提交独立成一个 commit；若安装版冒烟失败且短期无法修复，回退 `package.json`/`package-lock.json` 到 28.x 即可恢复，数据库与用户数据不受影响。

## Risks / Trade-offs

| 风险 | 影响 | 处置 |
|---|---|---|
| Chromium 28 → 134 渲染差异 | 图表/布局错位、字体或滚动行为变化 | D4 冒烟逐项确认；必要时最小 CSS 修复 |
| 托盘/通知 API 行为变化 | 托盘图标不显示、通知不弹 | 冒烟覆盖；必要时按新 API 调整 |
| electron-builder 24 不兼容 Electron 35 | 打包失败或产物缺文件 | 升级 builder 并验证 `files`/`asarUnpack` |
| npm 安装 Electon 35 体积/网络 | 安装耗时（实测约 3 分钟） | 一次性成本；必要时配置镜像 |
| 企业安全软件对新版 electron.exe 的拦截 | 安装版无法启动 | 冒烟发现后加白名单；保留回滚路径 |
| 升级后仍需回来做持久化重构 | 两次交付、两次验证 | 已明确拆分，`migrate-to-sqlite-engine` 保持暂停 |

## Migration

无数据迁移。用户数据与数据库路径不变；安装目录由 `robocopy /MIR` 覆盖更新。
