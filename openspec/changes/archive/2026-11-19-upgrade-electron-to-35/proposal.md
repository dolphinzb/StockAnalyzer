## Why

持久化重构（change `migrate-to-sqlite-engine`）选定的引擎 `better-sqlite3@13` 要求 Node ≥ 22，而当前应用运行在 Electron 28（内置 Node 18.18、ABI 119）。POC 实测：

- `better-sqlite3@13` + Electron 28：`require` 成功，但 `new Database()` 直接崩溃（无 JS 异常），包声明 `engines.node >= 22`；
- `better-sqlite3@13` + Electron 35.7.5（Node 22.16、ABI 133）：`new Database()` 正常，sqlite 3.54.1；
- 降级到 `better-sqlite3@11` 不可行（无 Node 22 预编译产物，本机无 MSVC 工具链，编译失败）；`12.x` 同样要求 Node ≥ 20。

同时，Electron 28 已是较旧版本，长期停留意味着缺失 Chromium/Node 的安全与稳定性修复。因此把运行时升级单独作为一个 change 先完成，为持久化重构解除阻塞。

## What Changes

- 依赖升级：`electron` 由 `^28.2.10` 升级到 `^35.7.5`（内置 Node 22.16）。
- 打包链验证与必要调整：确认 `electron-builder` 能处理 Electron 35 产物；若当前 `24.13.3` 不兼容则同步升级，并验证 `files` / `asarUnpack` 配置与 `scripts/build-and-deploy.ps1` 仍可用。
- 行为保持不变：托盘、隐藏到托盘、通知、IPC 契约、窗口尺寸与数据库/日志路径均不得改变。
- POC 期间已在分支上临时验证过 Electron 35 能加载原生模块，本 change 将其转为正式交付。

## Capabilities

### New Capabilities

- `desktop-runtime`：桌面运行时的版本基线与升级后的行为不回归约束。

### Modified Capabilities

（无）

## Impact

- **依赖**：`package.json` / `package-lock.json`（electron、可能 electron-builder）
- **打包**：`scripts/build-and-deploy.ps1`、electron-builder 配置、安装目录产物
- **代码**：预期无需改动；若升级导致 API 行为变化（托盘点击、通知、窗口事件），按回归结果最小修改
- **数据**：无变化，数据库与日志路径不变
- **下游**：解除 `migrate-to-sqlite-engine` 的引擎版本阻塞

## Non-Goals

- 不在此 change 内引入 SQLite 引擎、不改持久化模型。
- 不追求最新 Electron 版本，35.x 稳定版即满足需求。
- 不修改前端 UI/交互，除非升级造成明确回归。
- 不修复已知的「退出后进程可能残留」问题（独立事项，本次仅记录是否复现）。
