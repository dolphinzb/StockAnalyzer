## Context

当前日志由 `electron-log` v5.4.3 的 file transport 管理，代码只覆盖了级别：

```ts
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
```

其余全部走默认值：`maxSize = 1 MiB`，超过后 `archiveLogFn` 把 `main.log` 整体 `renameSync` 为 `main.old.log`（覆盖旧的），随后新建空文件。结果是磁盘上恒定只有 2 个文件、合计约 2 MiB。

读取侧同样固定：`log:read` 与 `log:get-path` 都硬编码 `join(app.getPath('userData'), 'logs', 'main.log')`，前端 `LogPage` 只有一个轮询刷新，没有文件选择能力。

已完成的日志降噪（高频过程日志降为 `debug`）使单日日志量从「一两天写满 1 MiB」降到「每天几十 KB 量级」，这是改成按天分文件的前提。

## Goals / Non-Goals

**Goals:**
- 日志按自然日分文件，跨天自动切换，无需重启
- 保留最近 30 天，超期自动清理
- 日志页可选择日期查看历史日志，并能打开日志目录
- 存量日志不丢失

**Non-Goals:**
- 不改日志格式、不引入结构化日志（JSON）或外部日志服务
- 不做日志内容搜索、过滤、级别筛选（本次只解决"选哪一天"）
- 不做日志打包导出/上传
- 不调整现有的日志级别策略

## Decisions

### 1. 用 `resolvePathFn` 按天分文件，而不是 `archiveLogFn`

| 方案 | 做法 | 问题 |
|---|---|---|
| A（选用） | `resolvePathFn` 返回当天文件路径 + `maxSize = 0` 关闭按大小轮转 | 无 |
| B | 保留 `archiveLogFn`，在轮转时改名带日期 | 轮转由**大小**触发，一天内可能产生多个文件，粒度不对 |
| C | 自建文件写入器替代 electron-log | 重造轮子，丢失现有格式化与渲染进程转发能力 |

采用 A：`resolvePathFn` 是 electron-log 提供的路径决策入口。

跨天能切换的依据来自源码，不是猜测。每次写日志都会重新求路径：

```js
function getFile(msg) {
  initializeOnFirstAccess();
  const filePath = transport.resolvePathFn(pathVariables, msg);   // 每条日志重新计算
  return registry.provide({ filePath, writeAsync: !transport.sync, writeOptions: transport.writeOptions });
}
```

而注册表以**绝对路径**为键，未命中才新建 File：

```js
provide({ filePath, writeOptions = {}, writeAsync = false }) {
  filePath = path.resolve(filePath);
  if (this.store[filePath]) return this.store[filePath];   // 命中则复用
  file = this.createFile({ filePath, writeOptions, writeAsync });
  this.store[filePath] = file;
  return file;
}
```

因此「路径每天变 → 键每天变 → 自然新建 File 实例并写入新文件」在当前版本（v5.4.3）是确定行为。

`resolvePathFn` 的第二个参数 `msg` 携带消息自身的 `date` 字段，日期应优先取自 `msg.date`，仅在缺失时回退到 `new Date()`。这样即使写入发生在跨零点之后（消息产生于前一天末尾），也能归入正确的日期文件。

需要正视的依赖是：这套机制建立在第三方库的内部实现上，并非其公开契约。若未来大版本改变注册表的分键方式，行为会静默变化——因此仍保留一条验证任务作为回归检查，而不是当作已证实的永久保障。

### 2. 日期必须取本地时间

不能用 `toISOString().slice(0, 10)`——那是 UTC。在 UTC+8，**凌晨 0:00 到 8:00 写入的日志会被归到前一天**，导致"今天的日志里没有今天凌晨的记录"。

统一用 `getFullYear()/getMonth()+1/getDate()` 拼 `YYYY-MM-DD`，并补零。该计算集中在 `logService.formatDate()`，全项目只有一处实现。

### 3. `resolvePathFn` 内只做纯计算，不碰文件系统

`resolvePathFn` 在**每一条**日志写入前都会被调用。若在其中做目录扫描或清理，日志写入会被同步 IO 拖慢，且高频日志会放大这个问题。

因此把职责拆开：

- `resolvePathFn`：只返回 `logs/main-<今天>.log`，无 IO
- 独立的 1 分钟定时器：检测日期是否变化；变化时执行一次「清理超期文件」

这样跨天清理与日志写入完全解耦，也顺带覆盖"应用连续运行多天"的场景。

### 4. 存量迁移在 electron-log 初始化之前执行

顺序必须是：

```
app ready 前 → migrateLegacyLogs() → 配置 transports → 正常记录日志
```

如果先配置 transports，当天文件会先被创建，之后迁移 `main.log` 时可能撞名。

迁移规则：`main.log` / `main.old.log` 按各自 `mtime` 的本地日期重命名为 `main-<日期>.log`；若目标已存在，**跳过而不覆盖**，并记录一条 warn（迁移本身产生的那条 warn 会写入新文件）。

### 5. 文件名解析用严格正则，防止误删误读

- 识别：`^main-(\d{4}-\d{2}-\d{2})\.log$`
- 清理只删除匹配该模式且日期早于 `今天 - 29 天` 的文件
- 用户手动放进目录的其他文件一律不动

`log:read` 的日期参数同样先校验 `^\d{4}-\d{2}-\d{2}$` 再用模板拼路径，避免路径穿越。

### 6. 打开目录用 `shell.openPath`

`shell.showItemInFolder(file)` 是"在资源管理器中选中某个文件"，需要文件存在；`shell.openPath(dir)` 是"打开这个目录"，即使当天还没有日志文件也能用。本次语义是"打开日志所在目录"，选后者。

### 7. 自动刷新与所选日期联动

- 默认选中今天
- 选中今天时保持现有 30 秒轮询
- 选中历史日期时**停止轮询**——历史文件不会再变化，轮询只会白白读盘
- 切换日期时立即拉取一次

### 8. 单日文件不设大小上限

明确不为单日文件增加兜底的体积上限（如超过 20 MiB 就切分成 `main-YYYY-MM-DD.2.log`）。

理由：

- 高频过程日志已降为 `debug`，正常使用下单日体积在几十 KB 量级
- 若真的出现异常刷屏（循环报错、逐帧日志），大文件本身就是需要被发现的信号；切分反而会掩盖它
- 总量天然收敛：每天一个文件、保留 30 天，上限与单日体积成正比但不会无限增长

代价是极端情况下单日文件可能偏大。与之配套的显示策略同样是明确的：**日志页完整展示所选日期的全部内容，不做截断、不做分页**。

这与上面的取舍是同一个判断的两面——如果单日文件大到影响渲染，说明出现了需要正面处理的异常，此时需要看到完整日志才能定位问题；截断恰好会把关键报错切掉。

### 9. 日志页控件布局

现有 `LogPage.vue` 的页头只有标题和一个右对齐的纯文本「最后刷新: hh:mm:ss」，**没有任何按钮**，刷新完全依赖 30 秒定时器。因此本次不引入手动刷新按钮，只在既有 `.header-actions` 容器内追加两个控件：

```
┌──────────────────────────────────────────────────────────────┐
│ 日志查看            [日期选择器 ▾] [打开日志目录] 最后刷新: 15:10:32 │
└──────────────────────────────────────────────────────────────┘
```

顺序与位置说明：

- **日期选择器**放在最左——它是页面主操作，且切换后立即拉取，位置固定便于重复使用
- **「打开日志目录」按钮**紧随其后，属于辅助动作，不抢占主位置
- **「最后刷新」文本**保持在最右，沿用现有 `.last-refresh` 样式
- 不新增刷新按钮：查看今天时有 30 秒自动刷新，查看历史日期时文件不再变化，手动刷新的场景基本不存在

若后续确实需要手动刷新，再作为独立小改动加入，不影响本次结构。

## Risks / Trade-offs

- **[跨天切换依赖第三方库内部实现]** → 当前版本行为已由源码确认，但非公开契约；升级 `electron-log` 大版本时需回归验证 2.4 场景。若行为变化，退化为"检测到日期变化时重建 file transport"。
- **[单日文件不设大小上限]** → 已决策接受。理由：高频日志已降为 `debug`，正常使用单日为几十 KB 量级；异常刷屏属于需要被发现的故障，此时大文件本身即是信号。总量由「每天一个文件 + 保留 30 天」天然收敛，不会无限增长。
- **[迁移时目标文件已存在]** → 跳过不覆盖，宁可保留两份也不静默丢数据。
- **[`resolvePathFn` 被高频调用]** → 纯字符串拼接 + 缓存当天日期，成本可忽略；不在其中做 IO。
- **[用户手动删除/重命名日志文件]** → 列表以目录扫描为准，不存在即不展示；读取不存在的日期返回 `LOG_FILE_NOT_FOUND`。

## Migration Plan

1. 启动时执行存量迁移（幂等：目标存在则跳过）
2. 配置 `resolvePathFn` 与 `maxSize = 0`
3. 启动清理定时器
4. 回滚方式：还原 `electron/index.ts` 的日志配置即可；已按天生成的文件不会影响回滚后的 `main.log` 写入
