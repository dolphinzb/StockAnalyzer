## 1. 日志文件服务

- [x] 1.1 新建 `electron/services/logService.ts`，导出本地日期格式化、日志目录、指定日期文件路径三个基础函数（日期必须用本地时间拼接，不得使用 `toISOString`）
- [x] 1.2 实现 `listLogDates()`：扫描日志目录，只接受严格匹配 `^main-\d{4}-\d{2}-\d{2}\.log$` 的文件，解析日期后倒序返回，并限制在最近 30 个自然日
- [x] 1.3 实现 `cleanupExpiredLogs(today)`：删除日期早于 `today - 29 天` 的匹配文件，非匹配文件一律不动
- [x] 1.4 实现 `migrateLegacyLogs()`：把 `main.log` / `main.old.log` 按各自 mtime 的本地日期重命名为 `main-<日期>.log`；目标已存在时跳过并记录 warn，不覆盖
- [x] 1.5 为 `logService` 补充单测：日期解析与排序、保留窗口边界（第 30 天保留 / 第 31 天删除）、非匹配文件不受影响、迁移幂等且不覆盖

## 2. 主进程日志配置

- [x] 2.1 在 `electron/index.ts` 中，于 electron-log 产生第一条日志之前调用 `migrateLegacyLogs()`
- [x] 2.2 设置 `log.transports.file.maxSize = 0`，关闭基于大小的轮转，避免生成 `main.old.log`
- [x] 2.3 配置 `log.transports.file.resolvePathFn` 返回当天日志文件路径；日期优先取自第二个参数 `msg.date`，缺失时回退 `new Date()`；函数内只做字符串拼接与日期缓存，不得执行文件系统操作
- [x] 2.4 验证跨天切换：将系统时间推进一天，确认新日志写入新日期文件、旧文件内容不变（依据为注册表按绝对路径分键，路径变化即新建 File 实例）；若升级 electron-log 后行为变化，改为在检测到日期变化时重建 file transport
- [x] 2.5 增加 1 分钟间隔的日期检查定时器，日期变化时调用 `cleanupExpiredLogs()`，使长时间运行也能清理超期文件
- [x] 2.6 在 `before-quit` 中清除该定时器，避免退出时残留句柄

## 3. IPC 与类型

- [x] 3.1 扩展 `shared/types/index.ts` 的 `LogAPI`：`readLog(date?: string)`、`listLogDates(): Promise<string[]>`、`openLogDirectory(): Promise<{ success: boolean; error?: string }>`
- [x] 3.2 新增 `log:list` IPC，调用 `listLogDates()` 返回日期数组，目录不存在时返回空数组而非报错
- [x] 3.3 扩展 `log:read` IPC 支持可选 `date`：先校验 `^\d{4}-\d{2}-\d{2}$`，非法直接返回参数错误；文件不存在返回 `LOG_FILE_NOT_FOUND`
- [x] 3.4 新增 `log:open-directory` IPC，目录不存在时先 `mkdir -p`，再用 `shell.openPath` 打开，返回失败原因
- [x] 3.5 在 `preload/index.ts` 的 `logAPI` 中补充上述三个方法，与 IPC 通道对应

## 4. 日志页交互

- [x] 4.1 在 `src/stores/logStore.ts` 中增加 `availableDates`、`selectedDate`、`isToday` 状态，`fetchLog` 支持按日期读取
- [x] 4.2 进入页面时先拉取可用日期列表，默认选中今天并加载当天日志
- [x] 4.3 `LogPage.vue` 在既有 `header-actions` 容器内最左侧增加日期选择控件（下拉或日期选择器），切换后立即拉取该日期日志
- [x] 4.4 自动刷新逻辑改为仅 `isToday` 为真时启动；切换到历史日期时停止，切回今天时恢复
- [x] 4.5 `LogPage.vue` 在日期选择控件右侧增加「打开日志目录」按钮（不新增手动刷新按钮），调用 `window.logApi.openLogDirectory()`，失败时通过 Toast 提示
- [x] 4.6 `LogViewer.vue` 空状态区分「该日期无日志」与「日志文件为空」，历史日期无文件时不显示为读取失败

## 5. 验证

- [x] 5.1 启动应用后确认 `logs` 目录生成 `main-<今天>.log`，且不再产生新的 `main.log`
- [x] 5.2 预置一个旧 `main.log` 后启动，确认被迁移为 `main-<mtime日期>.log` 且内容不变
- [x] 5.3 将系统时间推进一天后确认新文件生成、前一天文件内容未被截断
- [x] 5.4 制造一个 31 天前的日志文件，触发清理后确认已被删除，窗口内文件保留
- [x] 5.5 手工验证日志页：默认展示今天、切换历史日期能看到内容、历史日期下不再自动刷新、打开目录按钮可正常唤起资源管理器
- [x] 5.6 用一份行数明显偏多的日志验证日志页完整渲染、可滚动到末尾，确认未截断未分页
- [x] 5.7 运行 `npm run typecheck`、`npx eslint`、`npm test`，确认全部通过
