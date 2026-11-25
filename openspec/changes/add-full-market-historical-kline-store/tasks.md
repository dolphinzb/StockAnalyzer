## 1. 技术验证与迁移骨架

- [x] 1.1 按已验证结果确认深交所退市清单的 JSON `CATALOGID / TABKEY / PAGENO` 参数组合，并确认无需引入 xlsx 依赖
- [x] 1.2 扩展 `electron/migrations.ts`，支持显式迁移目录参数并新增行情库目录解析
- [x] 1.3 扩展 `scripts/copy-migrations.mjs`，构建时同时复制 `sql/migrations/` 与 `sql/market-migrations/`

## 2. 行情库结构与初始化

- [x] 2.1 新增 `sql/market-migrations/001_init.sql`，按 `design.md` D12 的列定义创建 `meta / securities / trading_calendar / kline_daily_raw / adjust_factors / kline_weekly_raw / kline_monthly_raw / sync_state / data_quality_issues` 及索引
- [x] 2.2 新增 `electron/marketDatabase.ts`，封装独立连接、PRAGMA、迁移调用、单例获取与关闭，禁止与业务库混用连接或 ATTACH 后省略库名
- [x] 2.3 为 `market_data.db` 实现 WAL checkpoint 与 `journal_size_limit` 配置；不生成迁移前整库备份
- [x] 2.4 在应用启动流程中初始化 `market_data.db`，失败时记录日志并展示可见错误
- [x] 2.5 验证 `stockanalyzer.db` 的既有迁移、备份和启动流程未受影响

## 3. 证券池与交易日历

- [x] 3.1 实现 `active_codes` 任务：分别拉取上交所 `commonQuery.do`、深交所 `/ShowReport/data` JSON 分页、北交所 `nqxxCnzq.do` POST 分页，写入 `securities`
- [x] 3.2 实现 `delisted_codes` 任务：拉取上交所 `COMPANY_STATUS=3` 退市清单，确认并接入深交所退市清单 JSON 参数，北交所退市用人工/静态兜底
- [x] 3.3 实现字段映射：上交所 `A_STOCK_CODE / COMPANY_ABBR / LIST_DATE`、深交所 `agdm / agjc / agssrq`（剥离 HTML）、北交所“证券代码 / 证券简称 / 上市日期”
- [x] 3.4 实现 `sdk_active` 兜底与 `manual` 最高优先级合并，记录 `code_source`
- [x] 3.5 实现东财 F10 `LISTING_DATE` 与 `stock-sdk search` 名称兜底，禁止从 K 线最早日期推断 `list_date`
- [x] 3.6 实现 `calendar` 任务：读取源文件全部交易日（含未来已公布日期），单事务内整表替换，写入 `meta.calendar_source / calendar_synced_at`
- [x] 3.7 为沪深北代码纳入、B 股排除、退市合并、字段映射和代码去重编写单元测试
- [x] 3.8 单元测试：日历整表替换，源文件新增/删除日期正确反映，未来交易日不参与“最新交易日”计算

## 4. 下载任务、限速与同步状态

- [x] 4.1 定义 `task_key` 生成规则、`data_kind` 枚举与 `meta.sync_control_state`，写入 `sync_state`
- [x] 4.2 实现 raw/qfq/hfq 日线全量回填任务生成，起始日期统一为 `19900101`
- [x] 4.3 实现手动增量任务生成：仅 `is_active = 1`，每只证券每种 `data_kind` 从 `last_success_date` 的下一个交易日补到最新交易日，计算 `earliestMissingDate / latestTradeDate / incrementalTaskCount`，不注册自动调度器
- [x] 4.4 实现基于 `sync_state` 的任务调度器：并发默认 3/上限 5，另加 1 秒滑动窗口 RPS 默认 3/上限 5；所有请求含重试都计入限速
- [x] 4.5 实现失败重试：最多 3 次，基础 1000ms、指数因子 2、最大 60000ms、0～500ms 抖动，支持 `Retry-After`；重启时保留任务但不自动继续，`running` 回退 `pending`，控制状态置 `idle`
- [x] 4.6 新增 `MarketSyncStatus` 类型（`state / mode / counts / earliestMissingDate / latestTradeDate / incrementalTaskCount / current / lastError / updatedAt`）与 IPC 入参 schema 校验
- [x] 4.7 实现 `market:sync:status` IPC，返回总数、待处理、运行中、成功、失败、当前任务、当前证券和最近错误
- [x] 4.8 实现 `market:sync:start`：首次先完成证券池/日历任务，再幂等生成 raw/qfq/hfq 任务；已有任务时恢复调度
- [x] 4.9 实现 `market:sync:retry-failed`：只把 `failed` 改为 `pending`、`retry_count = 0`、`next_retry_at = now`；不重置 `success`，不重新生成全量任务，不影响已完成股票
- [x] 4.10 实现 `market:sync:incremental`：手动触发增量补跑，未完成全量回填或存在未完成全量任务时拒绝
- [x] 4.11 实现全量/增量互斥：`sync_mode` 为 `full` 或 `incremental`，一个运行中时拒绝另一种启动
- [x] 4.12 单元测试：调度器并发上限，默认 3、最大 5、配置 10 时实际不超过 5
- [x] 4.13 单元测试：1 秒滑动窗口 RPS，快速响应和重试场景下任意 1 秒窗口不超过 3 次请求
- [x] 4.14 单元测试：指数退避 1s/2s/4s、最大 60s、抖动、`Retry-After`，以及 3 次重试后置为 `failed`
- [x] 4.15 单元测试：断点续跑，`running` 回退 `pending`、控制状态 `idle`、重启不自动执行、用户继续后只执行未完成任务
- [x] 4.16 单元测试：部分失败重试只重置 `failed`，`success` 任务和已完成股票数据保持不变
- [x] 4.17 单元测试：重复调用 `start` 不重复生成任务；增量任务从各自 `last_success_date` 接续并正确计算 `earliestMissingDate`
- [x] 4.18 单元测试：全量与增量互斥，运行中拒绝另一种模式

## 5. 行情写入、复权因子与派生周期

- [x] 5.1 实现 `kline_daily_raw` 批量 UPSERT，使用事务和可复用 prepared statement
- [x] 5.2 实现 raw/qfq/hfq 配对生成 `adjust_factors`，处理 `raw_close` 为 0/null 的情况，不保存版本列
- [x] 5.3 实现因子刷新时按股票全量替换：同一事务内删除旧因子并写入新因子
- [x] 5.4 实现 `kline_weekly_raw / kline_monthly_raw` 不复权派生聚合：主键 `(stock_code, period_start_date)`，周起始为周一、月起始为 `YYYY-MM-01`，`period_end_date` 可随新交易日推进，写入 `is_final / source / generated_at`
- [x] 5.5 实现复权周/月线读取：先对日线逐日应用因子，再按周/月聚合，禁止用周/月 OHLC 乘单一因子
- [x] 5.6 实现按 `period_start_date` 的删除/重建谓词：单周期 `= ?`、区间 `>= ?`、全量按 `stock_code` 全删；禁止用 `period_end_date` 作为周期身份
- [x] 5.7 单元测试：`kline_daily_raw` 重复 UPSERT 不新增行，行情字段与 `fetched_at` 正确更新
- [x] 5.8 单元测试：`adjust_factors` 按股票全量替换，旧因子删除、新因子写入，失败时事务回滚且不产生部分更新
- [x] 5.9 单元测试：`kline_weekly_raw / kline_monthly_raw` 同一 `period_start_date` 周中推进只更新一行，`period_end_date` 推进且 `is_final` 正确
- [x] 5.10 实现增量前复权重标定：区间内无除权除息时局部 UPSERT；检出 hfq 因子跳变（事件判据随价格自适应，阈值 = 舍入噪声 × 3，下限 1e-4）时补拉一次全历史 qfq 并按股票全量替换，历史 hfq 因子沿用库内原值
- [x] 5.11 单元测试：增量区间发生除权除息时触发一次全历史 qfq 重拉、历史 qfq 因子整体重标定、hfq 历史因子保持不变、新日期取新基准；无事件时请求数不增加且历史因子不变

## 6. 数据质量与备份策略

- [x] 6.1 实现 `gap / ohlc_invalid / duplicate / price_jump / stale / factor_invalid` 质量异常检测并写入 `data_quality_issues`
- [x] 6.2 确保质量异常只记录不阻断行情导入
- [x] 6.3 实现 `meta / securities / sync_state / adjust_factors` 的轻量快照导出
- [x] 6.4 验证 `market_data.db` 不生成迁移前或每日整库备份，仅保留元数据轻量快照

## 7. 行情库管理页面

- [x] 7.1 扩展 `ViewId` 为 `market-data`，在 `App.vue` 注册 `MarketDataView`，在侧边栏增加“行情库”入口
- [x] 7.2 新增 `MarketDataView.vue`：状态卡片、任务统计、当前任务/证券、最近错误、失败任务表，以及全量回填和增量更新两个操作区
- [x] 7.3 新增 `useMarketDataSync.ts`：挂载立即查询、1 秒轮询、卸载清理、控制命令封装与错误提示
- [x] 7.4 扩展 `shared/types` 与 preload，暴露 `market:sync:status/start/incremental/retry-failed`
- [x] 7.5 实现首次打开显示“未开始”且不自动执行全量或增量；展示最早缺失日期、最新交易日、待补任务数，并按状态禁用开始/重试按钮
- [x] 7.6 实现失败任务列表与“重试失败”操作，展示重试次数、最近错误和下次重试时间
- [ ] 7.7 手工验收：全量开始 → 部分失败 → 重试失败，确认只重试失败任务且已完成股票不受影响；关闭几天后增量更新从最早缺失日补到最新；全量与增量互斥

## 8. 验证与验收

- [ ] 8.1 使用 100～200 只股票做小样本回填，记录写入耗时、库大小和索引开销，验证 `WITHOUT ROWID` 方案
- [ ] 8.2 抽样对比数据源 raw/qfq/hfq 与新库存储结果，确认因子推导正确
- [ ] 8.3 抽样对比日线派生周/月线与数据源口径，记录差异并确认以派生口径为事实
- [ ] 8.4 模拟同步中断并重启，验证任务保留、控制状态为 `idle` 且不会自动继续
- [ ] 8.5 模拟多日未执行增量，验证从最早缺失日补到最新交易日、应用启动不自动执行，且退市股票被跳过
- [ ] 8.6 回归现有自选股下载、图表展示、资金估值和形态识别，确认读取路径未被切换
- [ ] 8.7 输出验收报告，确认双轨运行状态并列出后续分析层切换的待办
- [ ] 8.8 模拟部分股票或数据类型失败，验证重试只重置失败任务，已完成股票和成功任务的数据不变
- [ ] 8.9 验证任意 1 秒窗口请求数不超过 RPS，失败退避按约 1s/2s/4s 递增，3 次重试后任务置为 `failed`
- [ ] 8.10 选取近期发生除权除息的股票，执行增量后确认前复权历史被整体重标定、拼接处无假跳空，后复权历史因子未变化
