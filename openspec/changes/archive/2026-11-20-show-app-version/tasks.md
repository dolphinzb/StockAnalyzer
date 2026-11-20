## 1. 主进程与 IPC

- [x] 1.1 `shared/types/index.ts` 新增 `AppInfo` 类型（`version` / `isDev` / `dbPath` / `logDir`），并在 `WindowAPI` 上新增 `getAppInfo(): Promise<AppInfo>`；`isDev` 需注释说明语义仅为「未打包运行」，与 `electron/index.ts:182` 的 `isDev` 不同义
- [x] 1.2 `electron/index.ts` 注册 `ipcMain.handle('app:info')`，返回 `app.getVersion()`、`!app.isPackaged`、`getDatabasePath()` 与 **`getLogDir()`**（`logService` 的日志目录，注意 `log:getPath` 返回的是当天日志**文件**路径，不能直接用来展示目录）
- [x] 1.3 `preload/index.ts` 在 `windowAPI` 中暴露 `getAppInfo: () => ipcRenderer.invoke('app:info')`；渲染侧调用入口为 `window.electronAPI.getAppInfo()`
- [x] 1.4 契约测试核对结论：`tests/unit/ipcChannelContracts.test.ts` 只覆盖 `handleValidated` 的带 schema 通道，`app:info` 无入参走普通 `ipcMain.handle`，**无需登记**，也不会因此失败

## 2. 界面

- [x] 2.1 `src/components/SideNav.vue`：底部新增版本号区域（`v<version>`，dev 追加 `(dev)`）
  - 侧边栏固定 `width: 56px`，`v2.0.0 (dev)` 一行放不下 → **允许两行**（`(dev)` 自然折行，行高 1.2、上下 padding 2–4px），禁止 `white-space: nowrap` 与 `overflow: hidden`
  - 版本块加 `flex-shrink: 0`；同时给 `.nav-items` 加 `flex: 1; min-height: 0; overflow-y: auto`（可隐藏滚动条），否则 `min-height: auto` 会拒绝收缩、把版本块顶出可视区
- [x] 2.2 `src/views/SettingsView.vue`：新增「关于」`section`，展示版本、数据库路径、日志目录；放在 `<form>`（`:89-185`）**之外**，与 `backup-section` 同级，避免按钮误触表单提交
- [x] 2.3 「关于」区加两个按钮：「打开日志目录」（`logApi.openLogDirectory()`）与「打开数据库目录」（`window.electronAPI.openDbDirectory()` → 主进程 `app:open-db-directory`，由 `getDatabasePath()` 推导目录后 `shell.openPath`）；返回 `{ success: false }` 或抛错时 `showToast(..., 'error')` 提示失败原因（参照 `LogPage.vue:74-80`），MUST NOT 静默失败
- [x] 2.4 长路径处理：等宽字体 + `word-break: break-all`，**并且始终设置 `title`** 提示完整路径（两者同时满足，不二选一）
- [x] 2.5 启动时获取 `AppInfo` 失败时：侧边栏不显示版本、关于区整体降级为占位或隐藏，两处独立降级，不阻塞页面渲染

## 3. 验证

- [x] 3.1 `npm run typecheck` 与 `npm run build:electron` 通过
- [x] 3.2 `npm run test` 全量通过（契约测试不受影响）
- [x] 3.3 `npm run dev` 验证：侧边栏显示两行 `v2.0.0` / `(dev)`；设置页关于区三条信息正确；「打开日志目录」与「打开数据库目录」均能打开对应的资源管理器目录
- [x] 3.4 经用户确认后执行 `npm run deploy`，用安装版验证：侧边栏显示 `v2.0.0`（无 dev 标识），版本与 `package.json` 一致
- [x] 3.5 发布检查项：发版前确认 `package.json` 的 `version` 已更新，且重新构建后界面版本同步变化
