## Context

当前 `market:sync:start` 只在 `sync_state` 中日线任务数为 0 时执行 `bootstrapFullBackfill()`，其中才运行 `active_codes / delisted_codes / calendar` 市场级任务。全量完成后再次点击“开始/继续全量回填”只走断点续跑分支，不会刷新证券池；而 `incremental()` 发现本地证券数多于日线任务数时会拒绝并提示“请先执行全量回填”，形成死循环。另有 `enrichMissingNames()` 把库内纯 6 位代码直接传给 `stock-sdk.getAllQuotesByCodes()`，北交所 `430047` 等缺少 `bj` 前缀，SDK 无法正确识别市场。

约束：K 线仍由搜狐提供，stock-sdk 只承担证券池/日历/名称补全/搜索；已有成功任务与历史行情数据不得重置；同步服务与渲染进程通过现有 IPC/preload 通道通信。

## Goals / Non-Goals

**Goals:**

- 提供独立的“刷新证券池”入口，可重复执行且只更新证券名录。
- 刷新后幂等补建新上市证券的日线任务并补齐其历史，随后增量更新可恢复可用。
- 保证全量回填、增量更新、刷新证券池三种模式互斥。
- stock-sdk 兜底调用按 `exchange` 传带市场前缀代码（如 `bj430047`）。

**Non-Goals:**

- 不重跑交易日历，不删除或重置已有证券的日线任务与行情数据。
- 不改变 K 线数据源、复权推导、限速与失败退避策略。
- 不新增自动定时刷新；仍需用户显式点击。
- 不修改 `getAShareCodeList({ simple: true })` 的返回格式（那是 SDK 输出选项，不是输入代码格式）。

## Decisions

### D1：新增独立控制命令与运行模式

新增 IPC `market:sync:refresh-universe` → `MarketSyncService.refreshUniverse()`，并扩展 `MarketSyncMode` 为 `'full' | 'incremental' | 'universe'`。控制状态写入 `meta.sync_mode = universe`，完成时间写入 `meta.last_universe_refresh_at`；`finish()` 对该模式不再写 `last_full_backfill_at` 或 `last_incremental_at`。

理由：复用 `full` 模式会让状态标签显示“全量回填”并污染全量完成时间；新增模式使页面与状态查询能准确表达当前操作。

替代方案：让 `start()` 在已有任务时也重跑市场级任务。否决原因：会让“继续全量回填”语义膨胀，且无法单独刷新证券池。

### D2：刷新证券池的任务范围与执行顺序

`refreshUniverse()` 执行顺序：

1. 校验 `schedulerPromise` 为空，否则拒绝。
2. 用 `insertPendingTasks` 保证 `active_codes / delisted_codes` 任务行存在，再用 `setTasksPending` 将这两行（即使此前为 `success`）重置为 `pending`。
3. 设置控制状态 `running / universe`，直接顺序执行这两个市场级任务（复用 `executeTask`，市场级任务优先与重试语义不变）。不重置也不执行 `calendar`。
4. 两个任务均成功后调用 `ensureDailyTasksForAllSecurities()`，只为本地名录中缺失 `raw_daily` 任务的证券建新任务；已存在的成功任务不动。
5. 调用 `startScheduler()` 执行新补建的日线任务，由 `finish()` 统一收尾并写 `last_universe_refresh_at`。

理由：市场级任务必须在新股日线任务创建前完成；若市场级任务失败则中止，不创建日线任务，避免基于错误名录补数据。直接顺序执行市场级任务可避免调度器顺带拾取与本操作无关的待办任务。

替代方案：把市场级任务交给调度器并在其后补建日线任务。否决原因：需要额外的完成钩子，且无法保证补建发生在市场任务成功之后。

### D3：三种模式互斥

- `refreshUniverse()`：只要 `schedulerPromise` 非空就拒绝，不区分当前模式。
- `start()` / `incremental()`：已有守卫基础上，若当前 `sync_mode = universe` 也拒绝（增量提示“刷新证券池尚未完成”，全量提示“刷新证券池正在进行”）。
- UI：`busy` 时禁用“开始/继续全量回填”“增量更新”“刷新证券池”三个按钮；模式标签显示“刷新证券池”。

### D4：stock-sdk 兜底代码加前缀

在 `marketSdkClient.ts` 新增并导出 `toSdkCode(code, exchange)`（`SH → sh`、`BJ → bj`、其它 → `sz`），`marketDataSyncService.sdkSymbol()` 改为复用该函数。`enrichMissingNames()` 调用 `getAllQuotesByCodes()` 前用 `toSdkCode(item.code, item.exchange)` 生成代码；响应仍按 `replace(/^(sh|sz|bj)/, '')` 剥离前缀后映射回内部纯代码。

理由：`marketUniverseService` 已依赖 `marketSdkClient`，放在此处不会与 `marketDataSyncService` 形成循环依赖；按 `exchange` 转换比按代码段推断更可靠。

替代方案：复用 `quoteProviders/code.ts` 的 `toPrefixedCode()`。否决原因：它按代码数字段推断市场，无法处理交易所字段与代码段冲突的情况，且属于行情报价层，不应反向依赖。

### D5：IPC 与类型契约

`electron/ipcValidation.ts` 新增空参数 schema `marketSyncRefreshUniverse`；`electron/index.ts` 注册 `market:sync:refresh-universe`；`shared/types/index.ts` 的 `MarketDataAPI` 增加 `refreshUniverse()`；`preload/index.ts` 暴露桥接；`useMarketDataSync` 增加 `'refresh-universe'` 动作与处理函数。

## Risks / Trade-offs

- [刷新证券池使新增股票立即开始全历史下载，耗时较长] → 复用现有进度轮询与状态展示，用户可观察；不自动触发，必须显式点击。
- [市场级任务失败后 `sync_state` 留下 `pending` 市场任务，可能干扰后续全量/增量] → 刷新入口可被再次点击重试；后续 `start()` 会先重置中断任务，且市场级任务优先级最高，会被优先执行。
- [SDK 返回代码大小写或格式差异导致名称映射不到] → 仅剥离小写 `sh/sz/bj` 前缀，与现有 `parseSdkCodes()` 保持一致；测试覆盖 `bj430047`。
- [扩展 `MarketSyncMode` 影响既有状态展示与 meta 读取] → `readMode()` 显式接纳 `universe`，`finish()` 只对新模式写新 meta 键，旧值读取保持兼容。

## Migration Plan

无需数据库结构迁移。旧库中 `sync_mode` 不会是 `universe`；新增 meta 键缺省时按未刷新过处理。发布后用户可在行情库页面手动点击“刷新证券池”补录全量回填后新上市的股票。回滚时需移除 IPC 通道与 `universe` 模式分支，已写入的证券与日线任务保留，不产生数据损坏。

## Open Questions

无。
