## Context

当前自选股 K 线能力由 `stockanalyzer.db` 承载，表结构为 `kline_daily / kline_weekly / kline_monthly` 三张同构表，每张表以 `(stock_code, trade_date, adjust_type)` 为唯一键，下载入口绑定自选股，并由 Electron 主进程在 15:10 做增量补跑。这套设计适合少量自选股，但无法承担沪深北全部 A 股（含退市股）从 1990 年起的全历史行情库。

本 change 的目标是先建立可独立重建的本地事实库。现有自选股下载、图表展示、资金估值和形态识别保持不变，新库双轨运行，验证通过后再在后续 change 中切换读取路径。

已确认的技术前提：

- `stock-sdk` 的 `getHistoryKline` 支持 `'' / qfq / hfq`；
- 真实请求验证中，同一股票同一天的 raw/qfq/hfq 收盘价不同，说明 `hfq` 是数据源真实返回；
- `getAShareCodeList({ simple: true })` 返回在市股票和北交所代码，但不包含退市股票；
- `getHistoryKline` 对已知退市代码仍能返回历史数据，因此缺口在“代码发现”，不在“历史数据获取”。

## Goals / Non-Goals

**Goals:**

- 建立独立的 `~/.stockanalyzer/market_data.db`，保存沪深北全部 A 股普通股的原始日线事实、复权因子和派生周/月线。
- 覆盖已退市股票；全量回填统一从 `19900101` 发起，由数据源仅返回上市后的交易日数据。
- 支持全量回填、手动增量补跑、断点续跑、失败重试、限速、轻量质量记录和同步状态查询。
- 提供独立的“行情库”管理页面，让用户显式启动/继续全量回填，并在部分失败后重试失败任务。
- 与原 `stockanalyzer.db` 隔离，不破坏当前自选股功能。
- 为后续全市场选股、回测和横截面扫描预留可扩展结构，但本期不实现分析层。

**Non-Goals:**

- 不纳入 B 股、ETF/LOF、可转债、指数和分钟线。
- 不引入 DuckDB/Parquet。
- 不实现选股、回测、横截面扫描。
- 不切换现有图表、资金估值、形态识别的读取路径。
- 不实现多数据源交叉校验。
- 不直接保存前复权/后复权全字段 K 线作为事实源。

## Decisions

### D1: 新建独立 `market_data.db`，与现有库双轨运行

**决策**：新增独立 SQLite 数据库文件 `~/.stockanalyzer/market_data.db`；现有 `stockanalyzer.db` 的表、下载逻辑和读取逻辑本期不改。

**命名隔离**：新库 K 线表统一使用 `kline_daily_raw / kline_weekly_raw / kline_monthly_raw`，与业务库 `kline_daily / kline_weekly / kline_monthly` 明确区分。所有访问仍 MUST 通过独立 `marketDatabase` 连接，MUST NOT 与业务库混用连接或 `ATTACH` 后省略库名。

**理由**：

- 现有 K 线逻辑与自选股、基金、旧三表结构强绑定，直接改造风险高；
- 全市场库允许从数据源整体重建，和承载用户交易/配置/自选股的库生命周期不同；
- 双轨运行可以用抽样对比验证新库，再决定后续切换。

**备选方案**：在 `stockanalyzer.db` 内新增表。  
**未采用原因**：会使事实库和用户业务库耦合，备份、迁移和回滚都更复杂。

### D2: 为 `market_data.db` 建立独立版本化迁移目录

**决策**：新增 `sql/market-migrations/`，复用现有 `runMigrations / listMigrations / getUserVersion / setUserVersion` 机制，但允许显式传入迁移目录和数据库句柄。`market_data.db` 使用自己的 `PRAGMA user_version`，与 `stockanalyzer.db` 互不干扰。

**理由**：

- 现有 `migrations.ts` 已实现命名校验、版本顺序、事务原子性、基线判定和回滚，可复用；
- 现有 `getMigrationsDir()` 与 `scripts/copy-migrations.mjs` 只面向 `sql/migrations/`，需要做参数化扩展，而不是复制一套迁移引擎；
- `sql/migrations/001_init.sql` 已发布，不修改它。

**落地要点**：

- `getMigrationsDir()` 增加显式目录参数或新增 `getMarketMigrationsDir()`；
- `runMigrations(database, { dir })` 已具备 `dir` 参数，可直接复用；
- `scripts/copy-migrations.mjs` 同时复制 `sql/migrations/` 与 `sql/market-migrations/` 到 `dist-electron/sql/` 对应目录。

**备选方案**：把所有新表放进 `sql/migrations/` 的后续版本。  
**未采用原因**：会把全市场库结构写入业务库迁移序列，且无法表达两个数据库各自独立的版本状态。

**备选方案**：为新库手写一套初始化 SQL，不走版本化迁移。  
**未采用原因**：违背现有 `database-schema-migration` 能力，也不利于后续演进。

### D3: 事实模型采用“原始日线 + 复权因子”，不重复存储 qfq/hfq 全字段

**决策**：

- `kline_daily_raw` 只存原始日线；
- `adjust_factors` 存 `(stock_code, trade_date, qfq_factor, hfq_factor, source, fetched_at)`，不保存版本列；
- 因子刷新时在同一事务内删除该股票全部旧因子并写入新因子；不复权周/月缓存不因因子刷新而重建；
- 前复权/后复权 OHLC 在读取时由原始价乘以对应因子计算，或后续物化到分析层缓存。

**前复权重标定规则（增量与全量不等价）**：

- 全量回填：三类日线均从 `19900101` 起拉取，因子覆盖全历史，按股票全量替换；
- 增量更新：只覆盖新区间。后复权历史因子与基准无关（历史值稳定），因此局部 UPSERT 即正确；
- 前复权以最新价为基准，任何一次除权除息都会整体重标定**全部历史** `qfq_factor`。因此增量区间内一旦检测到复权事件，必须补拉一次该股票全历史 qfq 日线并按股票全量替换；历史 `hfq_factor` 沿用库内原值合并写入，不重新推导；
- 事件判据：把「区间前最近一个已存 hfq 因子点 + 区间内各点」按日期升序串成序列，任一相邻点的 `hfq_factor` 相对变化超过舍入噪声阈值即视为事件。阈值为 `0.005 × (1/原始价 + 1/复权价)` 的 3 倍（随股价自动缩放），下限 `1e-4`；
- 已知局限：低于该阈值的极小额分红（对前复权的影响小于复权价两位小数的精度）不触发重标定，其误差不高于数据源自身精度。

**理由**：

- 原始价是稳定事实；前复权历史会随新的分红送转变化；
- 若把 qfq/hfq 全字段各存一套，行数翻倍且一致性维护困难；
- 已确认 SDK 支持真实 `hfq`，无需用 qfq 推导后复权。

**备选方案**：沿用当前 `adjust_type` 双行存储。  
**未采用原因**：存储翻倍，因子变化时需要按股票全量重下，无法作为长期事实库。

**备选方案**：只存公司行动事件，读取时自行计算复权。  
**未采用原因**：当前数据源未确认提供完整结构化公司行动；先用因子更稳妥，公司行动表留到后续 change。

### D4: `kline_daily_raw` 使用 `WITHOUT ROWID` 紧凑主键

**决策**：

```sql
PRIMARY KEY (stock_code, trade_date)
) WITHOUT ROWID;
```

不设置 `id INTEGER PRIMARY KEY AUTOINCREMENT`，不额外建立与主键重复的 `UNIQUE` 索引。

**理由**：

- 全历史数据量预计数千万行，额外 rowid 和唯一索引会放大文件与写成本；
- 业务访问模式天然以 `(stock_code, trade_date)` 为主键；
- 横截面访问通过单独的 `(trade_date, stock_code)` 索引支持。

**风险与验证**：全量回填前用 100～200 只股票做基准，对比 `WITHOUT ROWID` 与当前行式主键方案的写入耗时、库大小和查询耗时。

**备选方案**：继续沿用当前 `id + UNIQUE` 结构。  
**未采用原因**：冗余索引和 AUTOINCREMENT 不适合大批量时序数据。

### D5: 周线和月线由日线派生并物化

**决策**：新增 `kline_weekly_raw / kline_monthly_raw`，由 `kline_daily_raw` 聚合生成，只保存不复权 OHLCV 与换手率，带 `is_final / source / generated_at`，不保存 `change_percent / change_amount / amplitude / factor_version`，不向数据源直接请求周/月线。因子刷新不影响该缓存；前/后复权周/月线读取时，先对日线逐日应用因子，再按周/月聚合。

**理由**：

- 减少 2/3 的历史请求量；
- 与原始日线保持单一事实源；
- 当前未完成的周/月覆盖逻辑本质也是派生缓存，显式化后更清晰。

**聚合口径**：

- 周期标识：周 `period_start_date` 为自然周周一，月 `period_start_date` 为 `YYYY-MM-01`；主键 `(stock_code, period_start_date)`，保证同一周期只有一行；
- `period_end_date` 为当前已纳入的最后一个交易日，未完成周期可随新交易日推进；
- `is_final = 1` 当该周期按交易日历已无后续交易日，否则为 0；
- `open` 取周期内首个交易日开盘，`close` 取当前最后一个交易日收盘，`high/low` 取周期内极值；
- `volume / amount / turnover_rate` 求和；
- 周/月表 MUST NOT 保存 `change_percent / change_amount / amplitude`；这些字段在读取复权周/月线时由逐日复权后的日线计算；
- 前/后复权周/月线 MUST NOT 用原始周/月 OHLC 乘单一周末因子；必须逐日应用因子后再聚合；
- 重建 MUST 按 `period_start_date` 删除：单周期用 `= ?`，区间回填用 `>= ?`；MUST NOT 用 `period_end_date` 作为周期身份或删除谓词。

**备选方案**：继续直接抓数据源周/月线。  
**未采用原因**：请求量大且口径与日线可能不一致。

### D6: 证券池由“在市列表 + 退市清单 + 人工覆盖”合并

**决策**：

- 在市股票以交易所官方名录为主：
  - 上交所：`https://query.sse.com.cn/sseQuery/commonQuery.do`，`sqlId=COMMON_SSE_CP_GPJCTPZ_GPLB_GP_L`，`STOCK_TYPE=1/8`，`COMPANY_STATUS=2,4,5,7,8`；字段 `A_STOCK_CODE / COMPANY_ABBR / LIST_DATE`；
  - 深交所：`https://www.szse.cn/api/report/ShowReport/data`，`SHOWTYPE=JSON&CATALOGID=1110&TABKEY=tab1&PAGENO=n`；返回 `application/json`，`json[0].data` 每页 20 条；字段 `agdm / agjc / agssrq`，其中 `agjc` 含 HTML 链接需剥离；
  - 北交所：`https://www.bse.cn/nqxxController/nqxxCnzq.do` POST 分页；字段“证券代码 / 证券简称 / 上市日期”。
- `stock-sdk.getAShareCodeList({ simple: true })` 降级为代码交叉校验与兜底，不作为 `name / list_date` 权威来源。
- 退市股票：
  - 上交所：`https://query.sse.com.cn/commonQuery.do`，`COMPANY_STATUS=3`；
  - 深交所：使用同族 `/api/report/ShowReport/data` JSON 接口，退市清单的 `CATALOGID / TABKEY` 在实现阶段确认；
  - 北交所：暂无稳定公开退市清单，使用人工/静态兜底。
- 按代码正则过滤，只保留沪深北 A 股普通股，排除 `900/200` 等 B 股代码。
- `code_source` 取 `sse_name / szse_name / bse_name / sse_delist / szse_delist / sdk_active / manual`，`manual` 优先级最高。

**理由**：

- 已验证 SDK 代码列表包含 5580 个代码和 357 个北交所代码，但不包含已退市股票；
- 已验证 `getHistoryKline` 对已知退市代码仍返回历史数据，缺口在代码发现，不在历史数据；
- 已验证深交所 `/api/report/ShowReport/data` 首页与第 2 页均返回 JSON，`json[0].data` 为 20 条股票记录，因此不需要 xlsx 解析依赖；
- 交易所官方名录同时提供代码、简称和上市日期，比 SDK 行情快照更适合作为证券主表事实来源。

**备选方案**：扫描全部可能代码段并逐一探测。  
**未采用原因**：请求量过大，且易触发限流；退市清单来源更直接。

**备选方案**：本期不支持退市股票。  
**未采用原因**：会产生幸存者偏差，违背目标范围。

### D7: 同步采用持久化任务队列与显式限速

**决策**：

- `sync_state` 以 `task_key` 为主键，任务维度为 `code × data_kind`；
- `data_kind` 包含 `active_codes / delisted_codes / calendar / raw_daily / qfq_daily / hfq_daily`；
- 每只股票每天最多生成 raw/qfq/hfq 三个日线任务；
- 并发：默认 3，最大 5；
- 请求速率：使用 1 秒滑动窗口限速，默认 3 req/s，最大 5 req/s；所有 HTTP 请求（含重试）都计入；并发数 MUST NOT 代替请求速率限制；
- SDK provider rateLimit 同步设为 3 req/s 作为第二道保护，但服务层滑动窗口是权威限制；
- 重试：每个任务最多自动重试 3 次（初始请求 + 3 次重试，总计最多 4 次请求）；基础延迟 1000ms，指数因子 2，最大延迟 60000ms，附加 0～500ms 随机抖动；若响应带 `Retry-After`，取计算延迟与 `Retry-After` 的较大值；
- 超过最大重试次数后任务置为 `failed`，不再自动重试，等待用户点击“重试失败”；
- 成功后写 `last_success_date`；
- 同步控制状态存 `meta.sync_control_state`：`idle / running / completed / failed`；
- 首次启动 MUST NOT 自动生成任务或自动开始全量回填；用户点击“开始全量回填”后，先完成证券池与交易日历同步，再幂等生成 raw/qfq/hfq 任务；
- 进程重启时若有未完成任务，`running` 任务回退为 `pending`，`sync_control_state` 改为 `idle`，不自动继续；
- 新库 MUST NOT 注册每日自动调度器；全量回填和增量更新都只由“行情库”页面手动触发；
- `retry failed`：只把 `failed` 任务改为 `pending`，重置 `retry_count` 与 `next_retry_at`；MUST NOT 重置 `success` 任务，MUST NOT 重新生成全量任务，MUST NOT 删除已完成股票的数据；调度器空闲时启动。

**理由**：

- 约 18000 个回填任务，串行过慢；
- SDK 文档示例对东方财富限流为 3 req/s、burst 3，批量行情默认并发为 7；但并发 3 且响应很快时仍可能超过 3 req/s，因此服务层必须使用 1 秒滑动窗口（不额外设置 burst），并发数不得代替限速；
- 断点续跑是长时间本地回填的必要条件。

**备选方案**：全部串行。  
**未采用原因**：全量回填耗时不可接受。

**备选方案**：并发 10 以上。  
**未采用原因**：限流和封禁风险高。

### D8: 写入策略为“单任务事务 + 批量预处理 + 幂等 UPSERT”

**决策**：

- 每个 `code × data_kind` 任务一个事务；
- `kline_daily_raw` 使用 `INSERT ... ON CONFLICT DO UPDATE`；
- `adjust_factors` 在 raw/qfq/hfq 三者都成功后按股票重算并替换；
- 周/月线按 `period_start_date` 删除受影响周期后重建：单周期 `= ?`，区间回填 `>= ?`；全量重建按 `stock_code` 全删；禁止用 `period_end_date` 作为周期身份；
- 每条 SQL 使用可复用 prepared statement，避免逐行动态拼接。

**理由**：

- 中断时只损失当前任务，已完成任务保留；
- UPSERT 保证重复下载幂等；
- 因子和派生数据依赖原始数据，必须在其成功后推进。

**备选方案**：全市场一个事务。  
**未采用原因**：事务过大、回滚代价高、进度不可见。

### D9: 轻量质量记录，不阻塞导入

**决策**：新增 `data_quality_issues`，记录 `gap / ohlc_invalid / duplicate / price_jump / stale / factor_invalid` 等问题；默认信任数据源完整性，质量问题只记录不阻塞入库。

**理由**：用户已确认“由数据源确保数据完整性”，本期不做严格缺口修复；但仍需为后续排查留下证据。

### D10: 备份以“可重建 + 元数据快照”为主

**决策**：

- `market_data.db` 不沿用现有每日全库备份 3 份策略；
- `market_data.db` MUST NOT 生成迁移前整库备份；迁移失败由事务回滚保证结构一致性；
- 行情事实可从数据源重建；
- 定期导出 `meta / securities / sync_state / adjust_factors` 的轻量快照；
- 设置 WAL checkpoint 与 `journal_size_limit`，避免 WAL 无限增长。

**理由**：预计 10～15 GB 的库每日整库复制成本过高，且与“事实可重建”的定位不匹配。

**备选方案**：复用 `backupService` 的每日全库备份。  
**未采用原因**：磁盘放大和 IO 成本不可接受。

### D11: `name / list_date` 字段来源优先级

**决策**：

- `manual` 覆盖优先级最高；
- 在市股票的 `name / list_date` 以交易所官方名录为主：上交所 `COMPANY_ABBR / LIST_DATE`、深交所 `agjc / agssrq`（`agjc` 剥 HTML）、北交所“证券简称 / 上市日期”；
- 退市股票的 `name / list_date / delist_date` 以交易所退市清单为主；
- `stock-sdk.search / getAllQuotesByCodes` 只作为 `name` 兜底。已验证退市代码 `600001` 仍能查到“邯郸钢铁”，但 SDK 不提供 `list_date`；
- 东财 F10 `PC_HSF10/CompanySurvey/PageAjax` 的 `SECURITY_NAME_ABBR / LISTING_DATE` 可作为交易所名录缺失时的字段兜底；
- 新浪公司资料页需要 GBK/GB18030 HTML 解析，不作为首选；腾讯公开行情/K 线接口不提供 `list_date`，不作为来源；
- 系统 MUST NOT 从 K 线最早交易日推断 `list_date`。

**理由**：交易所名录直接提供权威代码、简称、上市日期；SDK 代码列表和行情接口只能补部分字段，不能作为全历史证券主表事实源。

**备选方案**：只用 `stock-sdk` 补全部字段。  
**未采用原因**：SDK 不提供上市日期，且代码列表不含退市股票。

### D12: 权威表结构

以下 DDL 是 `sql/market-migrations/001_init.sql` 的权威列定义，spec 中出现的字段名必须与本结构一致。时间戳列统一使用 INTEGER epoch 秒（UTC）；日期列使用 TEXT `YYYY-MM-DD`；`stock_code` 为 6 位纯数字代码，`exchange` 单独存储。

#### `meta`

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

`meta` 保存全库级元数据，不参与行情事实查询。约定键：

| key | 含义 | 示例 |
|---|---|---|
| `backfill_start_date` | 全量回填起点 | `19900101` |
| `last_full_backfill_at` | 最近一次全量回填完成时间 | epoch 秒 |
| `last_incremental_at` | 最近一次手动增量补跑完成时间 | epoch 秒 |
| `securities_synced_at` | 最近一次证券池同步时间 | epoch 秒 |
| `calendar_synced_at` | 最近一次交易日历同步时间 | epoch 秒 |
| `calendar_source` | 交易日历来源标识 | `sse_szse_bj_calendar` |
| `last_snapshot_at` | 最近一次轻量快照导出时间 | epoch 秒 |
| `sync_control_state` | 调度控制状态：`idle / running / completed / failed` | `idle` |
| `sync_mode` | 当前/最近一次运行模式：`full / incremental` | `full` |
| `sync_started_at` | 最近一次同步启动时间 | epoch 秒 |

#### `securities`

```sql
CREATE TABLE securities (
  code TEXT PRIMARY KEY,
  exchange TEXT NOT NULL CHECK (exchange IN ('SH', 'SZ', 'BJ')),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'STOCK',
  list_date TEXT,
  delist_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  code_source TEXT NOT NULL CHECK (
    code_source IN (
      'sse_name', 'szse_name', 'bse_name',
      'sse_delist', 'szse_delist',
      'sdk_active', 'manual'
    )
  ),
  fetched_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_securities_exchange_active
  ON securities (exchange, is_active);
```

`name` 必须有值；所有来源都缺失时使用代码占位，并写入 `data_quality_issues`。`list_date / delist_date` 缺失时写 NULL，不编造日期。

#### `trading_calendar`

```sql
CREATE TABLE trading_calendar (
  trade_date TEXT PRIMARY KEY
) WITHOUT ROWID;
```

只保存开市交易日，不保存周末和节假日。每次同步 MUST 在单事务内整表替换：先删除全部旧日期，再插入源文件中的全部交易日。源级来源与抓取时间写入 `meta.calendar_source / meta.calendar_synced_at`，不在每行重复存储。源文件包含未来已公布交易日（至少到 2026-12-31）；计算“最新交易日”时仍只取不晚于今天的最大日期。

#### `kline_daily_raw`

```sql
CREATE TABLE kline_daily_raw (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  amplitude REAL,
  change_percent REAL,
  change_amount REAL,
  turnover_rate REAL,
  source TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, trade_date)
) WITHOUT ROWID;

CREATE INDEX idx_kline_daily_raw_date_code
  ON kline_daily_raw (trade_date, stock_code);
```

`change_percent / change_amount / amplitude / turnover_rate` 保存数据源口径，不使用原始前收重新计算。

#### `adjust_factors`

```sql
CREATE TABLE adjust_factors (
  stock_code TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  qfq_factor REAL NOT NULL,
  hfq_factor REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, trade_date)
) WITHOUT ROWID;

CREATE INDEX idx_adjust_factors_date_code
  ON adjust_factors (trade_date, stock_code);
```

因子语义：

```text
qfq_close = close_raw × qfq_factor
hfq_close = close_raw × hfq_factor
```

因子刷新按股票全量替换，不在表中保存版本列。

#### `kline_weekly_raw`

```sql
CREATE TABLE kline_weekly_raw (
  stock_code TEXT NOT NULL,
  period_start_date TEXT NOT NULL,
  period_end_date TEXT NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  turnover_rate REAL,
  source TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, period_start_date),
  CHECK (period_start_date <= period_end_date)
) WITHOUT ROWID;

CREATE INDEX idx_kline_weekly_raw_end_code
  ON kline_weekly_raw (period_end_date, stock_code);
```

`period_start_date` 为自然周周一，是稳定周期标识；`period_end_date` 为当前已纳入的最后一个交易日，未完成周期可随新交易日推进。只保存不复权聚合，不保存 `change_percent / change_amount / amplitude / factor_version`。

#### `kline_monthly_raw`

```sql
CREATE TABLE kline_monthly_raw (
  stock_code TEXT NOT NULL,
  period_start_date TEXT NOT NULL,
  period_end_date TEXT NOT NULL,
  is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0, 1)),
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  amount REAL,
  turnover_rate REAL,
  source TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  PRIMARY KEY (stock_code, period_start_date),
  CHECK (period_start_date <= period_end_date)
) WITHOUT ROWID;

CREATE INDEX idx_kline_monthly_raw_end_code
  ON kline_monthly_raw (period_end_date, stock_code);
```

`period_start_date` 为自然月第一天（`YYYY-MM-01`）；`period_end_date` 为当前已纳入的最后一个交易日。字段语义与 `kline_weekly_raw` 一致，周期为自然月。

#### `sync_state`

```sql
CREATE TABLE sync_state (
  task_key TEXT PRIMARY KEY,
  stock_code TEXT,
  data_kind TEXT NOT NULL CHECK (
    data_kind IN (
      'active_codes', 'delisted_codes', 'calendar',
      'raw_daily', 'qfq_daily', 'hfq_daily'
    )
  ),
  last_success_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'success', 'failed', 'disabled')
  ),
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  last_attempt_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_sync_state_due
  ON sync_state (status, next_retry_at);

CREATE INDEX idx_sync_state_stock
  ON sync_state (stock_code, data_kind);
```

`task_key` 约定为：

```text
<stock_code>:<data_kind>      # 股票级任务，如 600519:raw_daily
__MARKET__:<data_kind>         # 市场级任务，如 __MARKET__:calendar
```

`retry_count` 表示已自动重试次数；达到 3 次后不再自动重试，`status = failed`，`next_retry_at = NULL`；手动“重试失败”会重置该计数。

#### `data_quality_issues`

```sql
CREATE TABLE data_quality_issues (
  id INTEGER PRIMARY KEY,
  stock_code TEXT NOT NULL,
  trade_date TEXT,
  issue_type TEXT NOT NULL CHECK (
    issue_type IN (
      'gap', 'ohlc_invalid', 'duplicate',
      'price_jump', 'stale', 'factor_invalid'
    )
  ),
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_data_quality_issues_stock_date
  ON data_quality_issues (stock_code, trade_date);
```

`detail` 保存可读说明或 JSON；该表只追加，不作为行情事实源。

### D13: 独立“行情库”管理页面与 IPC 控制面

**决策**：

- 新增 `ViewId = 'market-data'`，在侧边栏增加“行情库”入口，页面组件为 `src/views/MarketDataView.vue`；
- 页面提供：
  - 状态卡片：`idle / running / completed / failed`；
  - 任务统计：总数、待处理、运行中、成功、失败；
  - 当前处理证券、当前任务、最近错误、更新时间；
  - 全量回填操作：开始/继续、重试失败、刷新状态；
  - 增量更新操作：显示最早缺失日期与最新交易日，手动点击“增量更新”；
  - 失败任务表：股票代码、任务类型、重试次数、最近错误、下次重试时间。
- “重试失败”只重置 `failed` 任务；`success` 任务、已完成股票和 `kline_daily_raw` 数据 MUST NOT 被重置或删除。
- IPC 通道：
  - `market:sync:status`：查询 `MarketSyncStatus`；
  - `market:sync:start`：全量回填首次生成任务并启动，或从中断后的待继续状态恢复；
  - `market:sync:incremental`：手动触发增量补跑；
  - `market:sync:retry-failed`：只重置失败任务并启动调度。
- `MarketSyncStatus` 至少包含：

```ts
type MarketSyncState = 'idle' | 'running' | 'completed' | 'failed';
type MarketSyncMode = 'full' | 'incremental';

interface MarketSyncStatus {
  state: MarketSyncState;
  mode: MarketSyncMode | null;
  total: number;
  pending: number;
  running: number;
  success: number;
  failed: number;
  earliestMissingDate: string | null;
  latestTradeDate: string | null;
  incrementalTaskCount: number;
  currentTaskKey: string | null;
  currentStockCode: string | null;
  currentStockName: string | null;
  lastError: string | null;
  updatedAt: string;
}
```

- 页面在挂载时立即查询一次状态，并在可见期间每 1 秒轮询 `market:sync:status`；卸载时清除定时器；
- 首次启动页面显示“未开始”，不自动生成任务或发起下载；
- 全量回填与增量更新在同一页面触发，但 MUST 互斥：一个运行中时禁用另一个；
- `start` 在无任务时先同步证券池/日历，再生成任务；有任务时按状态恢复；
- 所有控制命令返回 `{ success: boolean; error?: string }`，页面失败时展示错误，不静默吞掉。

**理由**：全量回填是长时间、几十 GB 级操作，必须有明确入口和可控状态；仅提供后台 IPC 而没有消费方，用户无法触发或验收。

**备选方案**：在设置页放一个按钮。  
**未采用原因**：状态、失败列表和控制操作较多，塞进设置页会拥挤且难以扩展。

**备选方案**：首启自动开始全量回填。  
**未采用原因**：会未经用户确认消耗大量带宽、磁盘和请求配额，不适合桌面应用。

### D14: 手动增量补跑从最后成功日接续

**决策**：

- 新库 MUST NOT 注册任何每日自动调度器，增量更新只由 `MarketDataView` 的“增量更新”按钮通过 `market:sync:incremental` 触发；
- 增量更新仅在完成过全量回填后可用，且要求当前没有 `pending / running` 的全量回填任务；
- 只处理 `is_active = 1` 的证券，退市证券不参与增量补跑；
- 对每只证券的 `raw_daily / qfq_daily / hfq_daily`，从 `sync_state.last_success_date` 的下一个交易日开始，终点为 `trading_calendar` 中的最新交易日；
- 如果任一必要任务没有 `last_success_date`，视为尚未完成全量回填，拒绝启动增量并提示先执行全量回填；
- 全局 `earliestMissingDate` 取所有待补任务起点的最小值，`latestTradeDate` 取最新交易日，`incrementalTaskCount` 为待补任务数；
- 增量任务与全量任务共用 `sync_state`，以 `task_key` 幂等更新，不新增任务表；
- 全量回填与增量更新互斥；同一时间只允许一种模式运行；
- 增量只补“最后成功日之后”的连续区间，不修复中间缺口；中间缺口需要重新执行全量回填或后续专门的补缺功能。

**理由**：用户明确要求增量不自动执行、错过几天后能从最早缺失日期补，并且在同一个页面触发。按每只证券自己的 `last_success_date` 接续，可以自然覆盖“停止几天后再补”的场景，同时避免把全市场统一到一个固定日期导致重复下载。

**备选方案**：固定每天自动跑增量。  
**未采用原因**：用户明确要求不自动执行，且全市场 18000 个请求/天不适合未经确认在后台启动。

**备选方案**：全市场统一从全局最早缺失日重下。  
**未采用原因**：会把已经最新的股票重复下载，浪费请求和写入。

## Risks / Trade-offs

- **[退市清单不完整]** → 沪深退市清单已有可用接口族，深交所退市参数在实现阶段确认；北交所退市用人工/静态兜底，并支持 `manual` 覆盖最高优先级。
- **[前复权因子变化导致派生缓存不一致]** → 因子刷新只全量替换因子；不复权周/月缓存不受影响；复权周/月线读取时逐日应用因子再聚合，避免用单一因子乘 OHLC 的误差。
- **[增量局部更新导致前复权历史失真]** → 增量只在无复权事件时局部 UPSERT；检测到 hfq 因子跳变即补拉一次全历史 qfq 并全量替换，前复权序列不会因拼接而出现假跳空。
- **[WITHOUT ROWID 二级索引可能较大]** → 全量回填前用样本股票基准测试；若二级索引过大，再评估改为普通行式表。
- **[周/月聚合口径与数据源历史周月线不同]** → 本期以日线派生的口径为唯一事实；上线前抽样对比并记录差异，不把数据源周月线作为事实。
- **[应用未运行时错过更新]** → 不自动补跑；页面显示最早缺失日期，用户点击“增量更新”后从各自最后成功日补到最新交易日。
- **[双库并行导致磁盘占用增加]** → 本期接受；验证通过后后续 change 再废弃旧 K 线冗余数据。
- **[数据源限流或临时失败]** → 并发 3/5 + 1 秒滑动窗口 RPS 3/5 + 最多 3 次指数退避，单任务失败不中断全局；状态可从 `sync_state` 恢复。
- **[字段语义与现有 KlineData 不一致]** → 新库类型单独定义，本期不复用旧 `adjust_type` 语义，避免污染现有功能。

## Migration Plan

1. **技术验证**：证券名录/退市清单来源已完成初步验证（SZSE JSON 分页已验证，无需 xlsx）。
2. **存储骨架**：新增 `sql/market-migrations/001_init.sql`，建立 `meta / securities / trading_calendar / kline_daily_raw / adjust_factors / kline_weekly_raw / kline_monthly_raw / sync_state / data_quality_issues`。
3. **迁移机制**：扩展迁移目录解析与构建复制脚本，使两个数据库各自按版本迁移。
4. **数据访问层**：新增 `electron/marketDatabase.ts`，封装连接、查询、批量 UPSERT、因子替换、派生周期重建和轻量快照导出。
5. **证券池同步**：实现 `active_codes / delisted_codes / calendar` 任务，写入 `securities` 与 `trading_calendar`。
6. **行情回填**：实现 raw/qfq/hfq 日线任务，先小样本验证，再全市场执行。
7. **因子与派生**：raw/qfq/hfq 成功后生成 `adjust_factors`，再从 raw 派生周线和月线。
8. **手动增量与控制**：实现从 `last_success_date` 接续的增量任务生成、失败重试、断点续跑、质量记录、`market:sync:status/start/incremental/retry-failed` 与 `meta.sync_control_state / sync_mode`。
9. **管理页面**：新增“行情库”侧边栏入口和 `MarketDataView`，同页提供全量回填与增量更新，接入状态轮询与控制 IPC；首次打开显示“未开始”且不自动启动。
10. **验证与双轨**：抽样比对数据源、旧库和新库；确认无误后保持双轨，读取切换留到后续 change。

**回滚策略**：停止同步服务，删除或重命名 `market_data.db` 即可回滚；现有 `stockanalyzer.db` 与用户功能未改动，因此无需恢复用户数据。若迁移脚本失败，沿用现有迁移事务回滚语义，不写磁盘。

## Open Questions

- 深交所退市清单的 JSON 参数组合是否已稳定？当前在市名录已验证 `CATALOGID=1110 / TABKEY=tab1`，退市清单仍需确认对应 `CATALOGID / TABKEY` 与分页行为。
- 北交所退市股票是否存在稳定公开清单？若没有，静态兜底清单如何维护和更新？
- 当前退市股票缺少 `list_date` 时，`kline_daily_raw` 的最早交易日是否作为兜底展示值？
- 并发 3/5 与 RPS 3/5 的默认值在真实全量回填中是否需要进一步调整？
