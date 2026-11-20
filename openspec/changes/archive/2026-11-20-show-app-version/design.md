## Context

**现状**

- 渲染进程通过 `preload/index.ts` 的 `contextBridge.exposeInMainWorld` 拿到若干 API（`electronAPI` / `configAPI` / `logApi` 等）；
- `WindowAPI`（`shared/types/index.ts:4`）已暴露 `platform` 与 `versions: { node, chrome, electron }`，这些值在 preload 阶段由 `process.versions` 直接读取；
- 标题栏是自绘的 `TitleBar.vue`：左侧 `StockAnalyzer` 文案位于拖拽区，右侧是三个窗口按钮；
- 左侧导航 `SideNav.vue` 只有 `nav-items`，没有底部区域；
- 设置页 `SettingsView.vue` 已有 4 个 `settings-section`（交易时间段 / 轮询 / API / 数据备份）；
- 日志相关能力已具备：`logApi.getLogPath()`（返回当天日志**文件**路径，不是目录）、`logApi.openLogDirectory()`（打开**目录**，失败返回 `{ success: false, error }`）；`LogPage.vue` 已有「打开日志目录」入口，并对失败做了 toast 提示。

**约束**

- 渲染进程是沙箱化的，不能 `require('electron')`，也读不到可靠的 `package.json`（打包后代码在 `app.asar` 内，版本信息以 `app.getVersion()` 为准）；
- 主进程已有 `handleValidated()` 封装（带 IPC 入参校验），无入参的只读查询通道走普通 `ipcMain.handle`；
- 界面强调极简，新增元素不能干扰主流程（K 线图与自选股列表是主角）。

## Goals / Non-Goals

**Goals：**

- 用户无需打开任何菜单即可看到当前版本；
- 排障所需的「版本 + 数据库路径 + 日志目录」集中在一处，并能一键打开日志目录；
- 版本号只有一个来源：改 `package.json` 并**重新构建**后生效。

**Non-Goals：**

- 不做检查更新、不做构建时间/commit hash（构建链未注入）；
- 不在标题栏重复显示；
- 不改变现有备份、日志、配置逻辑。

## Decisions

### D1：新增 `app:info` 单通道，聚合版本与环境信息

**决策**：主进程注册 `ipcMain.handle('app:info', ...)`，返回：

```ts
interface AppInfo {
  version: string;   // app.getVersion()，即 package.json 的 version
  isDev: boolean;    // !app.isPackaged
  dbPath: string;    // getDatabasePath()
  logDir: string;    // 日志目录绝对路径
}
```

preload 在 `windowAPI` 上新增 `getAppInfo(): Promise<AppInfo>`（`ipcRenderer.invoke('app:info')`）。渲染侧的调用入口是 **`window.electronAPI.getAppInfo()`** —— `windowAPI` 只是 preload 内部变量名，通过 `contextBridge.exposeInMainWorld('electronAPI', windowAPI)` 暴露，不要在渲染进程里找 `window.windowAPI`。

**理由**：

1. 渲染进程读不到可信的 `package.json`；`process.versions` 也不含应用版本，`app.getVersion()` 只有主进程有；
2. 用**一个**通道聚合四个字段，避免为「版本/路径/目录」各开一个通道，也便于后续扩展；
3. 与既有模式一致（`logApi` 等也是 invoke 风格），不需要 `contextBridge` 之外的机制。

**代价**：多一次 IPC 往返（启动时一次），可忽略。

### D2：侧边栏底部常驻 + 设置页「关于」区详情

**决策**：

- `SideNav.vue` 增加底部区域，显示 `v2.0.0`（dev 时 `v2.0.0 (dev)`），字号 11px、`--text-secondary` 色、不可点击；
- **宽度约束**：侧边栏固定 `width: 56px`，11px 字号下 `v2.0.0 (dev)` 约 60–66px，**一行放不下**。因此明确允许**两行显示**（`(dev)` 自然折行），行高 1.2、容器留 2–4px 上下 padding；MUST NOT 使用 `white-space: nowrap` 或 `overflow: hidden` 把内容裁掉；
- **收缩约束**：`.nav-items` 当前没有 `flex: 1` / `min-height: 0` / `overflow-y`，仅给版本块加 `flex-shrink: 0` 不足够（`min-height: auto` 会拒绝收缩，把版本块顶出可视区）。实现时需同时给 `.nav-items` 加 `flex: 1; min-height: 0; overflow-y: auto`（可隐藏滚动条）；
- `SettingsView.vue` 末尾新增「关于」`section`：版本、数据库文件、日志目录三行 + 「打开日志目录」按钮。

**理由**：

1. 用户在报问题时通常直接截图整个界面，侧边栏底部的版本号能自然入镜，且不需要任何点击；
2. 「关于」区承载详细信息，避免把长路径塞进侧边栏；
3. 标题栏是拖拽区且右侧已被窗口按钮占满，塞版本号会挤压且与系统按钮视觉冲突，故不采用。

**代价**：侧边栏高度较矮时需保证底部不被 `nav-items` 挤出（用 flex 布局 + 底部固定）。

### D3：开发模式标识来自 `app.isPackaged`

**决策**：`isDev = !app.isPackaged`，仅用于在版本号后追加 `(dev)`。

**注意（同名不同义）**：`electron/index.ts` 已有 `const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged`（`:182`）。版本展示 MUST NOT 复用该常量，也不要在渲染侧把 `AppInfo.isDev` 当成「开发环境」通用标志 —— 它的语义仅是「当前是未打包运行」。`AppInfo.isDev` 需在类型定义处写明这一点，避免后人误用。

### D4：复用现有日志能力，不新增通道

**决策**：

- 「打开日志目录」直接调用 `window.logApi.openLogDirectory()`；「打开数据库目录」调用新增的 `window.electronAPI.openDbDirectory()`（主进程 `app:open-db-directory`，目录由 `getDatabasePath()` 推导，**不接受渲染进程传入路径**，避免任意路径打开）。两者失败（`{ success: false }` 或抛错）时都 `showToast(..., 'error')`（与 `LogPage.vue:74-80` 一致）；
- 「日志目录」路径展示取 `app:info` 返回的 `logDir`，主进程侧由 `logService.getLogDir()` 提供。

**理由**：`log:getPath` 返回的是**当天日志文件**路径（`getLogFilePath(LOG_DIR, ...)`），不是目录；若用它展示「日志目录」会显示成 `...\logs\main-2026-11-20.log`，与打开按钮指向的目录不一致。少发一次 IPC 只是附带好处。

**说明（与日志页的关系）**：`LogPage.vue` 已有「打开日志目录」按钮；设置页「关于」区是**第二个入口**，属有意为之 —— 排障时「版本 + 库路径 + 日志目录」集中在一处，避免用户在两页之间来回找。

### D5：版本号变更流程不变

**决策**：仍以 `package.json` 的 `version` 为唯一来源，发版时手改；不在界面上做任何缓存或构建期注入。

**理由**：避免为「显示版本」引入构建期变量注入的复杂度；代价是发版时需记得改 version（写入 tasks 的发布检查项）。

## Risks / Trade-offs

| 风险 | 影响 | 处置 |
|---|---|---|
| 发版忘记改 `package.json` 版本 | 界面显示旧版本，误导排障 | 在 tasks 中列为发布检查项；后续可加 CI 校验 |
| 新增 IPC 通道未登记 | ——（已核实不存在该风险） | `ipcChannelContracts.test.ts` 只遍历 `SCHEMAS.*`（`handleValidated` 通道），`app:info` 无入参走普通 `ipcMain.handle`，无需登记 |
| 侧边栏 56px 放不下 `v2.0.0 (dev)` | 版本号被裁切或挤出 | 允许两行、禁止 `nowrap`/`overflow:hidden`；`.nav-items` 加 `flex:1; min-height:0; overflow-y:auto` |
| 侧边栏高度不足导致版本号被挤掉 | 看不到版本 | 版本块 `flex-shrink: 0` + `.nav-items` 可滚动 |
| 长路径撑破设置页布局 | 排版错乱 | 等宽字体 + `word-break: break-all` **并始终保留 `title`**（两者同时满足，不二选一） |
| `app:info` 失败导致三个字段一起缺失 | 关于区显示空白 | 关于区整体降级（占位/隐藏）并提示；侧边栏与设置页各自独立调用、独立降级 |

## Migration

无数据迁移。仅新增 IPC 通道与界面元素。
