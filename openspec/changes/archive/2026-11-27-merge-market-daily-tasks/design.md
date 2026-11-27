## Context

当前全市场行情库的全量回填与增量补跑按「证券 × 数据类型」拆任务：`DAILY_KINDS = ['raw_daily', 'qfq_daily', 'hfq_daily']`（`electron/services/marketSyncPolicy.ts:253`），每只证券 3 个任务，全市场约 1.7 万个任务。

关键事实：

- 搜狐 `hisHq` 只返回不复权日线。qfq/hfq 完全由 `sohuKlineClient.getHistoryKline()` 在本地推导（`electron/services/sohuKlineClient.ts:228`）：先 `fetchRaw` 拿原始日线，再用 `deriveSohuFactors()` 从「收盘价 − 涨跌额」反推事件因子，最后 `applySohuFactors()` 生成复权序列。**三个任务请求的是同一份 raw 数据。**
- `raw_daily` 与 `qfq_daily` 的请求 URL 相同，能共享 `requestCache`；但 `hfq_daily` 在拿到可用因子后会改用 `fetchRaw(symbol, previousYmd(startDate), endDate)`（`sohuKlineClient.ts:251`），缓存键变成 `19891231` 而必然再拉一次全历史。
- 数据库只有 `kline_daily_raw` 与 `adjust_factors`（`sql/market-migrations/001_init.sql`），qfq/hfq 任务没有事实表，唯一产物是会话内的收盘价 Map，供 `maybeRefreshFactors()` 在**三类任务全部成功后**推导因子（`electron/services/marketDataSyncService.ts:780`）。会话缓存上限 500（`SESSION_CACHE_LIMIT`），超过 500 只证券后条目会被淘汰，重启/补跑路径还会再补拉全历史。
- 全量回填默认 3 req/s 匀速放行（`marketSyncPolicy.ts:134`），耗时由请求数决定：约 1 万次请求 ≈ 56 分钟；合并后约 5600 次（含市场级任务）≈ 28 分钟。此外每只证券的全历史 JSON（约 8000 行）被解析与推导 2～3 遍，CPU 与 GC 压力同比例浪费。

## Goals / Non-Goals

**Goals:**

- 每只证券的全量回填只请求一次搜狐数据源，一次任务内产出原始日线、qfq/hfq 因子、周/月派生与质量异常。
- 增量补跑同样只请求一次；区间除权除息的重标定改为库内重算，不再补拉全历史。
- 任务键、`last_success_date` 断点、失败退避重试、并发与限速语义保持不变；旧库升级不重跑已完成证券。
- 删除 `maybeRefreshFactors` 会话缓存机制与搜狐适配器的复权分支。

**Non-Goals:**

- 不修改 `market_data.db` 表结构、周/月派生算法、质量检查规则。
- 不修改 IPC 通道与校验、图表读取路径、自选股 K 线下载链路（`klineDownloadService.ts` 仍走 stock-sdk）。
- 不引入新的数据源，不改变搜狐请求参数与 GBK 解码方式。
- 不新增“因子补算”独立 UI 状态或按钮，复用现有 pending 计数与“继续”操作。

## Decisions

### D1 任务粒度：一证券一任务，复用 `raw_daily` 键

`DAILY_KINDS` 收敛为 `['raw_daily']`，`buildTaskKey()` 与 `sync_state` 主键格式不变，因此存量 `raw_daily` 的 `last_success_date` 可直接作为断点续跑依据，无需数据迁移即可复用。`qfq_daily / hfq_daily` 枚举值保留在类型中（兼容历史 `sync_state` 行与前端标签），但不再生成。

**替代方案 A：保留三任务，只修 `hfq` 的请求键**（去掉 `previousYmd` 偏移，使三者共享同一 URL）。请求数同样能降到 1 次/证券，但保留 3 倍任务调度、3 倍任务状态写入、3 倍全历史 JSON 解析，且会随 10 分钟 TTL 或 256 条缓存淘汰重新放大到 2～3 次请求；重启/补跑路径依然不可控。放弃。

**替代方案 B：保留三任务，qfq/hfq 任务只读库内 `kline_daily_raw`**。能省请求，但引入任务间依赖（raw 未成功时 qfq/hfq 必须等待或失败重试），并需要额外的“跳过未满足前置条件的任务”逻辑，复杂度高于合并本身。放弃。

### D2 因子推导直接用累计乘数，不再生成复权价格

`deriveSohuFactors()` 返回的 `qfq / hfq` Map 本身就是累计因子，可直接落 `adjust_factors.qfq_factor / hfq_factor`，无需 `applySohuFactors()` 生成复权收盘再算「复权收盘 ÷ 原始收盘」。这去掉每只证券两次全历史 `map/filter/round2`，也消除了“两个比值口径”带来的舍入偏差。

全量路径：`bars`（已按日期过滤）→ `deriveSohuFactors(bars)` → `factorRows`（`tradeDate + qfqFactor + hfqFactor`）→ `replaceAdjustFactors()`（单事务删除+全量写入）。

`sohuAdjustment.ts` 保留 `deriveSohuFactors / mergeSohuFactors / hasUsableFactors`，`applySohuFactors` 从同步链路移除（函数与对应测试一并删除）。

### D3 增量请求起点前移一个交易日，在任务内完成因子合并

`marketSyncPolicy.ts` 新增纯函数 `previousTradingDay(calendar, date)`。增量任务的实际请求起点 = `previousTradingDay(calendar, 起点)`；请求结果仍只把 `>= 起点` 的行作为新增数据，但多带回的上一交易日让 `deriveSohuFactors` 能识别「区间首日是否除权」。

- `last_success_date` 仍按区间内最后一根 bar 推进，不受起点前移影响（该日数据 UPSERT 幂等）。
- 起点前移后若找不到前一交易日（日历首日或上市首日附近），按原起点请求，视为区间内无事件。

因子写入：`stored = readAdjustFactors(db, code, 'qfq'/'hfq')` 作为绝对因子基准；用 `mergeSohuFactors(stored, bars)` 仅做事件判定（见 D4）。**未检测到事件时不能直接把 `mergeSohuFactors` 的窗口值写入**——`deriveSohuFactors` 对窗口内的因子是相对值（无事件时恒为 1），直接写会把绝对值覆盖成 1。正确做法：复权因子在相邻事件之间恒定，新区间沿用库内最近的因子值（`lastStoredFactor`），只对区间日期 `upsertAdjustFactors()`（历史行不动）。这是实现期对 D3 的修正。

### D4 区间除权重标定改为库内重算

`kline_daily_raw` 已存 `change_amount / change_percent`，`MarketDailyRawRow` 可直接映射为 `MarketKlineItem`。检测到事件时：`readDailyRaw(db, code)` 取全历史 → `deriveSohuFactors()` → `replaceAdjustFactors()` 全量替换。**零网络请求**，替代现有 `rescaleQfqHistory()` 补拉全历史 qfq 的做法。

事件判定沿用现有 `detectCorporateAction()`：先把区间新因子与库内最近一个历史因子拼成采样序列，避免区间首日跳变漏检。

### D5 存量迁移：清理旧任务行 + 因子补算

在 `marketRepository` 新增两个幂等操作，由 `createMarketSyncService()` 构造时执行一次：

1. `purgeLegacyDailyTasks(db)`：`DELETE FROM sync_state WHERE data_kind IN ('qfq_daily','hfq_daily')`。这些任务没有数据产物，删除不影响 `kline_daily_raw / adjust_factors`。
2. `listStocksWithIncompleteFactors(db)`：选出 `raw_daily` 为 success 且 `adjust_factors` 行数少于 `kline_daily_raw` 行数的证券，置为 `pending`（`retry_count=0`）。这些证券在下一次全量回填/继续时只需 1 次请求补算因子。

不重置因子完整的证券，保证升级后不产生额外下载。执行结果写 `log.info`（清理任务数、待补算证券数）。

### D6 计数与判定口径改为单任务

- `areDailyTasksSucceeded()` 改为 `raw_daily` 单行判定，或直接从 `executeTask` 移除（因子已同任务内完成，不再需要跨任务等待）。
- `summarizeIncrementalTasks()` 已有 SQL 走 `data_kind IN ('raw_daily','qfq_daily','hfq_daily')`，迁移后只剩 `raw_daily` 行，统计自然为「证券数」；`incremental()` 中的前置校验 `activeTaskCount < countSecurities(db, true) * 3` 改为 `* 1`。
- `resetTasksForStocks()` 的循环 kinds 收敛为 `['raw_daily']`。

### D7 适配器收敛为只提供原始日线

`sohuKlineClient` 删除 `readFactors` 注入、`factorCache`、`hfq` 的 `previousYmd` 偏移与 `applySohuFactors` 调用；`adjust !== ''` 时抛 `SOHU_UNSUPPORTED_ADJUST`（当前无调用方）。`requestCache` 保留：同一证券的重试与并发去重仍有价值，可作为第二道去重保护。`MarketSdkLike.getHistoryKline` 的 `adjust` 参数保留（混合客户端契约不变）。

`marketDataSyncService` 中 `fetchBars()` 固定传 `adjust: ''`；`adjustOfKind()`、`rememberCloses()`、`SessionEntry`、`maybeRefreshFactors()`、`rescaleQfqHistory()` 全部删除。

### D8 失败粒度

单任务内按「原始日线 UPSERT → 周/月派生 → 质量异常 → 因子」顺序执行，任一步异常即任务失败，走现有退避重试（最多 3 次）。原始日线 UPSERT 幂等，重试不会产生重复行；因子写入在单事务内全量替换，不会留下半成品。

## Risks / Trade-offs

- **失败粒度变粗**：原可按复权类型单独重试，合并后一只证券一次失败即三类产物都未写 → 缓解：三类产物本就同源（qfq/hfq 依赖 raw），不存在真实独立性；退避重试次数与 `retry-failed` 语义不变，且重试成本由 2～3 次请求降为 1 次。
- **升级补算可能一次重置较多证券**（旧库中因子缺失者）→ 缓解：仅重置「因子行数少于原始日线」的证券；每只只需 1 次请求，且用户可随时中断继续。日志输出数量便于评估。
- **增量起点前移一天的边界**：`last_success_date` 为上市首日时前一交易日无数据 → 缓解：找不到前一交易日时按原起点请求，视为无事件；上市首日不存在除权除息。
- **库内重算依赖 `change_amount/change_percent` 完整性**：若历史行由早期流程写入且两列为 null → 缓解：`impliedPreviousClose()` 优先用 `change`，其次 `changePercent`，均缺失时该日不产生事件（与现状一致，不新增失败路径），并由 `factor_invalid` 质量异常兜底。
- **回滚成本**：任务键未变，回滚到旧代码后 `ensureDailyTasksForAllSecurities()` 会幂等补建 `qfq_daily/hfq_daily` 并重新下载一遍（数据正确但多花一轮请求）；因子口径一致，不会产生错误数据。

## Migration Plan

1. 升级后首次构造同步服务：删除旧 `qfq_daily/hfq_daily` 任务行；对因子不完整的证券把 `raw_daily` 置 `pending`；记录日志。
2. 用户点击“开始/继续”触发全量回填：已成功且因子完整的证券被跳过，待补算证券各发 1 次请求。
3. 回归校验：任务总数 = 市场级任务数 + 证券数；同一证券在一次回填中出现的数据源请求数 ≤ 1；增量除权日前后 `qfq_factor` 全历史连续。
4. 回滚：无需数据库回滚脚本；旧版本启动后会按旧口径补建任务（见上）。

## Open Questions

- 无。任务键复用 `raw_daily` 与“因子不完整才重置”的迁移策略已足够避免全量重跑，若后续需要在 UI 区分“补算因子”可另起 change。
