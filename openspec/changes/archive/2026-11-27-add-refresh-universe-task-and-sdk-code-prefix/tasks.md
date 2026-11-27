## 1. 类型与共享工具

- [x] 1.1 `shared/types/index.ts`：`MarketSyncMode` 增加 `universe`；`MarketDataAPI` 增加 `refreshUniverse(): Promise<MarketSyncControlResult>`
- [x] 1.2 `electron/services/marketSdkClient.ts`：新增并导出 `toSdkCode(code, exchange)`（`SH→sh`、`BJ→bj`、其它→`sz`）
- [x] 1.3 `electron/services/marketDataSyncService.ts`：`sdkSymbol()` 改为复用 `toSdkCode()`，保持现有 K 线调用行为不变

## 2. stock-sdk 兜底代码前缀修正

- [x] 2.1 `electron/services/marketUniverseService.ts`：`enrichMissingNames()` 调用 `getAllQuotesByCodes()` 前用 `toSdkCode(item.code, item.exchange)` 转换；响应仍剥离 `sh/sz/bj` 前缀后映射回内部纯代码
- [x] 2.2 `tests/unit/marketUniverse.test.ts`：增加 `430047 + BJ → bj430047`、`600519 + SH → sh600519` 与 SDK 返回 `bj430047` 时名称写入纯代码记录的断言

## 3. 同步服务新增刷新证券池入口

- [x] 3.1 `electron/services/marketDataSyncService.ts`：新增 `refreshUniverse()`，校验调度器空闲后重置 `active_codes / delisted_codes` 任务为 `pending`，设置 `running / universe`，顺序执行这两个市场级任务；不执行 `calendar`
- [x] 3.2 `refreshUniverse()`：市场级任务全部成功后调用 `ensureDailyTasksForAllSecurities()` 补建新证券日线任务，再 `startScheduler()` 执行；任一市场级任务失败则中止、控制状态置 `failed`、不补建任务
- [x] 3.3 `readMode()` 接纳 `universe`；`finish()` 为 `universe` 模式写 `last_universe_refresh_at`，不写 `last_full_backfill_at / last_incremental_at`
- [x] 3.4 `start()` 与 `incremental()` 增加 `sync_mode = universe` 时的拒绝分支与提示语
- [x] 3.5 `tests/unit/marketSync.test.ts`：覆盖刷新只跑证券池任务、新股任务补建与执行、重复刷新幂等、市场任务失败中止、三种模式互斥

## 4. IPC 与页面控制

- [x] 4.1 `electron/ipcValidation.ts`：新增 `marketSyncRefreshUniverse` 空参数 schema
- [x] 4.2 `electron/index.ts`：注册 `market:sync:refresh-universe` 处理器，调用 `refreshUniverse()` 并记录日志
- [x] 4.3 `preload/index.ts`：在 `marketDataAPI` 中暴露 `refreshUniverse()` 桥接
- [x] 4.4 `src/composables/useMarketDataSync.ts`：`MarketControlAction` 增加 `'refresh-universe'`，新增处理函数并复用 `runControl()`/Toast/状态刷新
- [x] 4.5 `src/views/MarketDataView.vue`：全量回填操作区新增“刷新证券池”按钮，模式标签支持 `universe`，`busy` 时禁用三个控制按钮
- [x] 4.6 `tests/unit/ipcChannelContracts.test.ts`：补充 `market:sync:refresh-universe` 通道契约断言

## 5. 验证与回归

- [x] 5.1 运行项目既有单测与 TypeScript 类型检查，修复新增代码引入的错误
- [x] 5.2 手工回归：全量完成后在交易所名录中模拟新增证券 → 点击“刷新证券池” → 新证券完成全历史下载 → “增量更新”恢复可用；确认交易日历与已有成功任务未被重跑
