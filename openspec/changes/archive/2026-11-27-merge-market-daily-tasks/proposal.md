## Why

全量回填为每只证券生成 `raw_daily / qfq_daily / hfq_daily` 三个任务，但搜狐只提供不复权日线，qfq/hfq 全部由同步适配器基于 raw 在本地推导——三个任务请求的是同一份数据。更严重的是 `hfq_daily` 任务在拿到因子后会把请求起点改写成 `previousYmd(startDate)`，缓存键与 `raw_daily` 不同，必然再拉一次全历史。结果是全市场约 1.7 万个任务下，网络请求约为必要量的 2 倍，全历史 JSON（每只约 8000 行）被解析与推导 2～3 遍，全量回填耗时被无谓拉长。

## What Changes

- 每只证券只保留 **一个日线任务**，任务键沿用 `stock_code:raw_daily`（断点、`last_success_date`、重试语义与键格式不变）；不再生成 `qfq_daily / hfq_daily` 任务。
- 该任务一次请求取回全历史原始日线后，在本地依次完成：推导 qfq/hfq 因子 → UPSERT `kline_daily_raw` → 全量替换 `adjust_factors` → 重建周/月派生 → 写入质量异常。因子直接取 `deriveSohuFactors()` 的累计乘数，不再需要"先取 qfq/hfq 收盘价再算比值"。
- 增量补跑同样只跑一个任务：请求区间向前多带一个交易日（同一次请求内，用于识别区间首日除权），本地合并因子；区间内发生除权除息时，用库内已有原始日线全历史重算 qfq 因子，**不再补拉一次全历史 qfq 请求**。
- 搜狐适配器收敛为"只提供原始日线"：删除 qfq/hfq 分支、因子缓存与 `readFactors` 注入；`applySohuFactors` 不再参与同步链路。
- **BREAKING（行为与状态口径）**：`sync_state` 中每只证券的日线任务数由 3 变为 1，失败粒度由"按复权类型"变为"按证券"；管理页面"任务总数/待补任务数"含义相应变化。
- 存量数据升级：删除 `qfq_daily / hfq_daily` 任务行（它们没有数据产物）；对 `raw_daily` 已成功但 `adjust_factors` 不完整的股票重置为 `pending` 以补算因子。
- 移除 `maybeRefreshFactors` 与其会话缓存（`SESSION_CACHE_LIMIT`、`SessionEntry`）：因子在同一任务内一次算完，不再需要"三类任务全成功后再刷新"。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `market-data-sync`: 日线回填任务粒度由"证券 × raw/qfq/hfq"改为"证券 × 1"；因子在同一任务内由原始日线单次推导；失败重试与增量断点按证券收敛；增量除权重标定改为库内重算。
- `market-data-storage`: 因子推导来源表述改为"单次原始日线推导"，删除"适配器产生的 qfq/hfq 序列仅用于任务配对"的约束；因子全量替换与来源标识要求不变。
- `market-data-management-ui`: 同步状态中的任务计数按"每只证券一个日线任务"统计；失败任务表的任务类型仅剩原始日线。

## Impact

- 修改：`electron/services/marketDataSyncService.ts`（任务执行、因子推导、增量除权处理、移除会话缓存）、`electron/services/marketSyncPolicy.ts`（`DAILY_KINDS`）、`electron/services/marketRepository.ts`（存量任务清理与因子补算查询；`areDailyTasksSucceeded`、`summarizeIncrementalTasks`、`listDailyTasks` 等按单任务口径收敛）。
- 修改：`electron/services/sohuKlineClient.ts`（只保留 raw 路径）、`electron/services/sohuAdjustment.ts`（保留推导与合并，`applySohuFactors` 退出同步链路）。
- 修改：`src/views/MarketDataView.vue`（任务类型标签与计数口径）、`shared/types/index.ts`（如需调整任务类型联合）。
- 修改测试：`tests/unit/marketSync.test.ts`、`tests/unit/marketDataSource.test.ts`、`tests/unit/sohuKlineClient.test.ts`、`tests/unit/sohuAdjustment.test.ts`。
- 数据库：无表结构变更，只有 `sync_state` 行级迁移（删除两类旧任务、按需重置待补算因子的股票）。
- 收益：全市场全量回填的搜狐请求量由约 2 次/证券降至 1 次/证券（默认 3 req/s 下由 ~56 分钟降至 ~28 分钟），全历史解析与因子推导次数由 2～3 次降至 1 次；增量补跑同样由 2～3 次请求降至 1 次。
- 不修改：IPC 通道与校验、`market_data.db` 表结构、图表读取路径、自选股 K 线下载链路、周/月派生算法与质量检查规则。
