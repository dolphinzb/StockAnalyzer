## Why

应用当前在界面上完全看不到版本号，导致：

1. **排障困难**：反馈问题时无法确认对方运行的是哪个版本（尤其是刚完成的数据库引擎替换这类底层改动）；
2. **无法自查是否装上了新包**：`npm run deploy` 之后只能靠文件时间戳判断，界面上没有可核对的信息；
3. **缺少关键路径信息**：数据库文件与日志目录位置只在代码里，用户排查「数据没落盘」「日志在哪」时需要额外询问。

## What Changes

- 在**左侧导航底部**常驻显示版本号（形如 `v2.0.0`，开发模式追加 `(dev)`）。
- 在**设置页新增「关于」区**，集中显示：版本号、数据库文件路径、日志目录，并提供「打开日志目录」按钮。
- 版本号来源统一为主进程 `app.getVersion()`，通过新增的 `app:info` IPC 暴露给渲染进程（渲染侧调用入口为 `window.electronAPI.getAppInfo()`）；MUST NOT 在前端硬编码版本字符串。
- 复用现有 `logApi.getLogPath()` / `openLogDirectory()`，不新增日志相关通道。

## Capabilities

### New Capabilities

- `app-version-display`：版本号与运行环境信息在界面上的可见性、数据来源与展示位置。

### Modified Capabilities

（无）

## Impact

- **主进程**：`electron/index.ts` 新增 `app:info`（返回 version / isDev / dbPath / logDir）与 `app:open-db-directory`（打开数据库文件所在目录）两个处理函数
- **preload**：`preload/index.ts` 在 `windowAPI` 上暴露 `getAppInfo()`
- **共享类型**：`shared/types/index.ts` 新增 `AppInfo` 类型并扩展 `WindowAPI`
- **渲染进程**：`src/components/SideNav.vue`（底部版本号）、`src/views/SettingsView.vue`（关于区）
- **测试**：`tests/unit/ipcChannelContracts.test.ts` 仅覆盖 `handleValidated` 的带 schema 通道；`app:info` 无入参、走普通 `ipcMain.handle`，**无需登记**，不会因它失败
- **数据**：无变化

## Non-Goals

- 不引入自动更新/检查更新能力。
- 不在标题栏、状态栏等位置重复显示版本号。
- 不展示构建时间或 commit hash（当前构建链未注入，留作后续）。
- 不改变 `package.json` 的版本管理流程。
