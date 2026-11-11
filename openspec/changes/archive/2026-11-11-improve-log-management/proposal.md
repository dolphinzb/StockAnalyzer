## Why

当前日志只有一个 `main.log`，超过 1 MiB 就被整体改名为 `main.old.log`（旧的被覆盖），磁盘上永远只有 2 份、合计约 2 MiB。这带来三个问题：

- **无法回看历史**：想确认「上周某次自动下载是否失败」，日志早已被写入挤掉。
- **日志页只能看当前文件**：`LogPage` 固定读取 `logs/main.log`，没有选择其他文件的入口。
- **定位文件路径麻烦**：路径是 `%APPDATA%\stockanalyzer\logs\main.log`，需要自己拼；界面上只有文本路径，没有直接打开的方式。

日志降噪已完成（高频过程日志降为 `debug`），磁盘占用大幅下降，此时改为按天分文件才具备可行性——否则 30 天会产生远超预期的体积。

## What Changes

- 日志改为**按自然日分文件**，文件名 `main-YYYY-MM-DD.log`，日期取本地时间。
- 关闭 electron-log 的按大小轮转（`maxSize = 0`），改由应用自行按天切分。
- 应用启动时**清理超过 30 天的日志文件**；运行期间跨天时自动切换到新文件。
- 首次启用时**迁移存量日志**：`main.log` / `main.old.log` 按最后修改日期重命名为 `main-<日期>.log`，避免用户丢失已有记录。
- 日志页新增**日期切换**：可选择最近 30 天内任意一天查看；默认今天。
- 日志页新增**「打开日志目录」按钮**，调用系统文件资源管理器定位到日志目录。
- **自动刷新仅在查看「今天」时启用**；查看历史日期时关闭轮询，因为历史文件不再变化。

## Capabilities

### New Capabilities

- `daily-log-files`: 日志文件按自然日生成、按天自动切换、保留最近 30 天并清理超期文件、存量日志迁移。
- `log-viewer-navigation`: 日志页按日期切换查看、展示可用日期范围、打开日志目录按钮、自动刷新与所选日期的联动规则。

### Modified Capabilities

（无。现有 `openspec/specs/` 下没有日志相关能力，本次均为新增。）

## Impact

**主进程**
- `electron/index.ts`：日志初始化配置（`resolvePathFn` / `maxSize`）、新增 IPC `log:list`、扩展 `log:read` 支持日期参数、新增 `log:open-directory`。
- 新增 `electron/services/logService.ts`：日志目录与文件名计算、日期解析、清理超期文件、存量迁移，便于单测。

**渲染进程**
- `src/views/LogPage.vue`：日期选择器、打开目录按钮。
- `src/stores/logStore.ts`：新增可用日期列表、当前所选日期、按日期拉取。
- `src/components/LogViewer.vue`：仅按需扩展空状态文案，结构不变。

**IPC 与类型**
- `preload/index.ts`：`logAPI` 增加 `listLogDates()`、`openLogDirectory()`，`readLog()` 增加可选日期参数。
- `shared/types/index.ts`：`LogAPI` 接口同步扩展。

**依赖与磁盘**
- 不新增依赖，复用已安装的 `electron-log` v5 与 Electron `shell`。
- 磁盘占用上限从约 2 MiB 变为约 30 个日志文件；由于高频日志已降为 `debug`，正常使用下每天为几十 KB 量级。
