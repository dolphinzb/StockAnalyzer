# show-app-version 文档审查记录

审查范围：proposal.md / design.md / specs/app-version-display/spec.md / tasks.md
审查方式：逐条对照实际代码，并用 `openspec validate show-app-version --strict` 校验（已通过）
审查结论：整体方向合理，存在 4 项影响实现可行性的必改问题，以及 6 项文档准确性建议。

## 必须修正（影响实现正确性/可行性）

### 1. 侧边栏 56px 宽，`v1.0.0 (dev)` 一行放不下

- 依据：`src/components/SideNav.vue` 固定 `width: 56px`；11px 字号下 `v1.0.0 (dev)` 约 60px，版本号位数增加后更严重。
- 问题：design D2 只规定 11px 字号与 `--text-secondary` 颜色，未定义换行/截断策略。实现者很可能加 `overflow: hidden` 或 `white-space: nowrap`，直接违反 spec「常驻可见」要求。
- 建议：明确 `(dev)` 换行到第二行（容器留少量 padding、行高 1.2）；tasks 2.1 写明「允许两行、禁止 nowrap / overflow:hidden」。

### 2. spec 的「高度受限仍固定底部」场景，tasks 未真正落实

- 依据：`src/components/SideNav.vue` 中 `.nav-items` 目前没有 `flex: 1`、`min-height: 0`、`overflow-y: auto`。
- 问题：仅给版本块 `flex-shrink: 0` 不足够——`.nav-items` 的 `min-height: auto` 会拒绝收缩，把版本块顶出可视区。当前窗口 `minHeight: 600` 暂时够用，但 spec 已明确写了该场景。
- 建议：tasks 2.1 补充给 `.nav-items` 加 `min-height: 0; overflow-y: auto`（可隐藏滚动条）。

### 3. 设置页「关于」区缺失败处理

- 依据：`src/views/LogPage.vue` 对 `openLogDirectory()` 返回的 `{ success: false }` 已有 toast 提示；SettingsView 已引入 `useToast`。
- 问题：spec 只描述成功场景，tasks 2.3 只写「调用」，未要求失败提示；同时未约定「关于」区相对 `<form>` 的位置。
- 建议：tasks 2.3 补充失败时 toast 提示；明确「关于」区放在 `<form>` 之外（参照现有 backup section 的位置），避免按钮误触表单提交。

### 4. spec 与 tasks 对「路径过长」的要求不一致

- 依据：spec 要求「不撑破布局，**且**完整路径仍可通过悬停查看」；tasks 2.4 写成「break-all（**或**省略号 + title）」。
- 问题：若采用 break-all 而未加 `title`，不满足 spec 的「且」。
- 建议：统一为「break-all + 始终保留 title」，或放宽 spec 措辞。

## 建议修正（文档准确性）

### 5. `logDir` 不等于 `getLogPath()`

- 依据：`electron/index.ts` 中 `log:getPath` 返回当天日志**文件**路径（`getLogFilePath(LOG_DIR, ...)`）；「关于」区需要的是**目录**，应取 `electron/services/logService.ts` 的 `getLogDir()`。
- 建议：design D4 与 tasks 1.2 直接写出 `getLogDir()`，避免实现者误用 `logApi.getLogPath()` 展示成「日志目录」。

### 6. IPC 暴露名不准确

- 依据：渲染侧实际调用为 `window.electronAPI.getAppInfo()`（`preload/index.ts` 中 `contextBridge.exposeInMainWorld('electronAPI', windowAPI)`），`windowAPI` 只是 preload 内部变量名。
- 建议：proposal / design D1 补充渲染侧调用路径，避免实现者去渲染进程查找 `window.windowAPI`。

### 7. 契约测试可以定论，不必留条件

- 依据：`tests/unit/ipcChannelContracts.test.ts` 只枚举走 `handleValidated` 的带 schema 通道。
- 结论：`app:info` 无入参、走普通 `ipcMain.handle`，**无需登记**，也不可能因它失败。
- 建议：proposal Impact 的条件句与风险表中的「契约测试失败」直接改为结论，减少实现时的无效排查。

### 8. 未说明与日志页已有入口的关系

- 依据：`src/views/LogPage.vue` 已有「打开日志目录」按钮，design 的 Context 未提及。
- 建议：在 design 中说明「关于」区是第二个入口，属有意为之（排障信息集中），否则评审会质疑重复建设。

### 9. `isDev` 同名不同义

- 依据：主进程已有 `isDev = process.env.NODE_ENV === 'development' || !app.isPackaged`；新增 `AppInfo.isDev` 只用 `!app.isPackaged`。
- 建议：design D3 明确「不得复用现有常量」，或对渲染侧字段加注释说明语义差异。

### 10. 失败场景覆盖不全

- 依据：`app:info` 是聚合接口，失败时 `version` 与 `dbPath`、`logDir` 同时拿不到。
- 建议：spec 的失败场景改为「关于区整体降级（占位/隐藏）」，并说明侧边栏与设置页各自独立调用、独立降级。

## 小问题

- design 的 Goals 中「改 `package.json` 即生效」不够严谨，应改为「重新构建后生效」（spec 场景已写「并重新构建」，需保持一致）。
- tasks 3.4 的 `npm run deploy` 验证依赖用户手工安装包，建议注明「需用户确认后执行」，与项目打包规则保持一致。

## 核对无问题的部分

- `WindowAPI` 位于 `shared/types/index.ts` 第 4 行，`versions` 确由 preload 读取 `process.versions`。
- `getDatabasePath()` 存在且返回绝对路径（`app.getPath('home')/.stockanalyzer/stockanalyzer.db`）。
- 主进程 `handleValidated()` 的用法与「无入参只读通道走普通 `ipcMain.handle`」的描述一致。
- 设置页确有 4 个 `settings-section`（交易时间段 / 轮询 / API / 数据备份）。
- `npm run test`、`npm run typecheck`、`npm run build:electron`、`npm run deploy` 脚本均存在。
- 应用当前无任何版本号展示，`app.getVersion()` 在 dev（`electron .`）下读取项目 `package.json`，为 `1.0.0`，与文档示例一致。
