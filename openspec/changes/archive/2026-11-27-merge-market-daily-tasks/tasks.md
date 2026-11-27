## 1. 任务口径与策略原语

- [x] 1.1 `electron/services/marketSyncPolicy.ts`：`DAILY_KINDS` 收敛为 `['raw_daily']`，保留 `qfq_daily / hfq_daily` 类型与标签（仅用于兼容历史行），更新模块注释说明“一证券一日线任务”
- [x] 1.2 新增纯函数 `previousTradingDay(calendar, date)`（返回日历中严格早于 date 的最近交易日，无则 null），并补单测
- [x] 1.3 `electron/services/marketRepository.ts`：新增 `purgeLegacyDailyTasks(db)`（删除 `qfq_daily/hfq_daily` 行）与 `listStocksWithIncompleteFactors(db)`（`raw_daily` 为 success 且 `adjust_factors` 行数 < `kline_daily_raw` 行数）
- [x] 1.4 `resetTasksForStocks()` 的 kinds 循环收敛为 `['raw_daily']`；`areDailyTasksSucceeded()` 改为按 `raw_daily` 单行判定（或删除并清理调用方）

## 2. 同步服务合并执行

- [x] 2.1 `runDailyTask()`：全量模式下取一次原始日线 → `upsertDailyRaw` → `rebuildDerivedPeriods`（周/月）→ `collectRawIssues` 质量检查 → `deriveSohuFactors(bars)` → `replaceAdjustFactors` 全量替换因子
- [x] 2.2 增量模式：请求起点由 `previousTradingDay(calendar, startDate)` 前移一天（找不到则保持原起点），`last_success_date` 仍按区间内最后一根 bar 推进
- [x] 2.3 增量因子写入：`readAdjustFactors` 作为绝对基准，`mergeSohuFactors` 只用于事件判定；无事件时新区间沿用库内最近因子值并 `upsertAdjustFactors`（不写窗口相对值），历史行不变
- [x] 2.4 除权除息处理：用 `detectCorporateAction` 判定区间事件；命中时 `readDailyRaw(全历史)` → `deriveSohuFactors` → `replaceAdjustFactors` 全量重算，删除 `rescaleQfqHistory()` 的全历史网络补拉
- [x] 2.5 删除 `maybeRefreshFactors()`、`SessionEntry`、`SESSION_CACHE_LIMIT`、`rememberCloses()`、`adjustOfKind()`，`executeTask()` 不再在任务成功后调用因子刷新
- [x] 2.6 `fetchBars()` 固定传 `adjust: ''`；`incremental()` 前置校验由 `countSecurities(db, true) * 3` 改为按证券数（×1）
- [x] 2.7 单任务内异常顺序处理：原始日线写入与因子替换各自幂等，失败抛出交给现有退避重试，不留下半成品因子

## 3. 搜狐适配器收敛

- [x] 3.1 `electron/services/sohuKlineClient.ts`：删除 `readFactors` 注入、`factorCache`、qfq/hfq 分支与 `previousYmd` 偏移；`adjust !== ''` 抛 `SOHU_UNSUPPORTED_ADJUST`
- [x] 3.2 保留 `requestCache`（同证券重试/并发去重），确认只按 `symbol|startDate|endDate` 缓存原始日线
- [x] 3.3 `electron/services/sohuAdjustment.ts`：删除 `applySohuFactors()` 及 `sohuAdjustment.test.ts` 中相关用例；保留 `deriveSohuFactors / mergeSohuFactors / hasUsableFactors`
- [x] 3.4 `marketDataSyncService.getMarketSyncService()` 去掉 `factorReader` 注入，`createSohuKlineClient()` 无参构造

## 4. 存量迁移与状态口径

- [x] 4.1 `createMarketSyncService()` 构造时执行一次幂等迁移：`purgeLegacyDailyTasks` → `listStocksWithIncompleteFactors` 对应证券置 `pending`（`retry_count=0`），并 `log.info` 输出清理任务数与待补算证券数
- [x] 4.2 校验 `countTasks()`、`summarizeIncrementalTasks()`、`listDailyTasks()`、`countDailyTasks()`、`countUnfinishedDailyTasks()` 在单任务口径下的统计结果（无需改 SQL，确认不再出现 3N）
- [x] 4.3 `getStatus()` 的 `incrementalTaskCount`、`earliestMissingDate` 按证券口径复核；`failedTasks` 的 `dataKind` 仅剩 `raw_daily`

## 5. 前端展示

- [x] 5.1 `src/views/MarketDataView.vue`：`KIND_LABELS` 保留旧键用于历史行展示，确认任务总数/待补任务数说明与新口径一致（每只证券一个任务）
- [x] 5.2 确认失败任务表“任务类型”对单任务显示为“原始日线”，无空标签
- [x] 5.3 `src/composables/useMarketDataSync.ts` 与 `shared/types/index.ts` 复核：无新增字段，类型联合不报错

## 6. 测试与验证

- [x] 6.1 更新 `tests/unit/marketSync.test.ts`：断言每证券只生成/执行一个日线任务、任务总数按证券统计、重试与断点语义不变
- [x] 6.2 新增用例：一次全量任务只向 mock SDK 发起 1 次 `getHistoryKline`，且同时写入 `kline_daily_raw` 与 `adjust_factors`
- [x] 6.3 新增用例：增量请求起点比 `last_success_date` 早一交易日；无除权时只 upsert 新区间因子；有除权时不发起额外请求且全量替换因子
- [x] 6.4 新增用例：旧库迁移删除 `qfq_daily/hfq_daily` 行、因子完整的证券保持 success、因子缺失的证券被置 pending
- [x] 6.5 更新 `tests/unit/marketDataSource.test.ts`（`DAILY_KINDS` 断言）与 `tests/unit/sohuKlineClient.test.ts`（复权请求改为报错断言）
- [x] 6.6 运行 `npm test`（或项目既有单测命令）与 TypeScript 类型检查，确认全部通过
- [x] 6.7 手工回归：真实库执行“继续全量回填”，观察日志中同一证券的搜狐请求数 ≤ 1，任务总数 = 市场级任务数 + 证券数
