## ADDED Requirements

### Requirement: 行情库 K 线下载使用搜狐数据源

行情库的全量回填与增量下载 SHALL 使用搜狐 `hisHq` 作为 K 线数据源。系统 MUST NOT 在这些路径中调用 `stock-sdk.getHistoryKline()`，MUST NOT 在搜狐请求失败时回退到东方财富。证券池、交易日历、名称补全和搜索 SHALL 继续使用 `stock-sdk`。

搜狐 K 线请求 SHALL 使用 `period=d`、`order=A`、`stat=0`、`rt=json`，证券代码 MUST 添加 `cn_` 前缀，响应 MUST 按 GBK 解码。raw/qfq/hfq 三种任务 SHALL 仍由现有同步服务调度；当任务传入 `adjust='qfq'` 或 `adjust='hfq'` 时，适配器 SHALL 基于搜狐原始日线及涨跌额/涨跌幅在本地生成对应复权序列后返回。

#### Scenario: 全量回填使用搜狐
- **WHEN** 用户启动行情库全量回填并下载某证券 K 线
- **THEN** 系统请求搜狐 `hisHq`，不调用 `stock-sdk.getHistoryKline()` 获取 K 线

#### Scenario: 增量下载使用搜狐
- **WHEN** 用户对已有行情库执行增量补跑
- **THEN** 系统使用搜狐 `hisHq` 拉取增量区间日线，并按现有 `last_success_date` 语义推进

#### Scenario: 本地派生前复权和后复权
- **WHEN** 同步任务请求 `adjust='qfq'` 或 `adjust='hfq'`
- **THEN** 适配器基于搜狐原始日线与涨跌信息生成本地复权序列，不向搜狐请求服务端复权

#### Scenario: 搜狐失败不回退
- **WHEN** 搜狐 K 线请求失败且达到最大重试次数
- **THEN** 任务置为 `failed` 并记录错误，系统不改用东方财富数据补齐该任务

#### Scenario: 元数据仍使用 stock-sdk
- **WHEN** 同步服务执行证券池、交易日历、名称补全或搜索
- **THEN** 系统继续使用 `stock-sdk` 的对应能力

## MODIFIED Requirements

### Requirement: 同步限速与失败退避可配置

系统 SHALL 同时限制并发数和请求时间间隔。并发默认 10、最大 15；HTTP 请求 MUST 按最小间隔匀速放行，默认 3 req/s（333ms 间隔），并可通过 `meta.sync_rps` 换算间隔，最大 20 req/s。所有 K 线 HTTP 请求（含重试）MUST 计入限速；并发数 MUST NOT 作为唯一限速手段。证券池、交易日历、名称补全和搜索继续由 `stock-sdk` 提供，其 SDK 内部限流 MUST 由 `meta.sync_rps` 解析后传入，且 MUST NOT 成为比服务层更低的瓶颈；搜狐 K 线适配器 MUST NOT 宣称具备 `stock-sdk` 内部限流。

任务失败时系统 SHALL 最多自动重试 3 次。退避 MUST 使用基础延迟 1000ms、指数因子 2、最大延迟 60000ms，并附加 0～500ms 随机抖动；若响应包含 `Retry-After`，取计算延迟与 `Retry-After` 的较大值。超过最大重试次数后任务 MUST 置为 `failed`，不再自动重试。

#### Scenario: 默认并发
- **WHEN** 用户未配置并发数并启动全量回填
- **THEN** 系统最多同时执行 10 个下载任务

#### Scenario: 并发上限
- **WHEN** 用户将并发数配置为 30
- **THEN** 系统实际并发数仍不超过 15

#### Scenario: 匀速放行不产生突发
- **WHEN** 30 个任务同时请求且单任务 10ms 完成
- **THEN** 相邻两次 HTTP 请求放行时间至少间隔 333ms

#### Scenario: RPS 上限
- **WHEN** 用户将请求速率配置为 30 req/s
- **THEN** 任意 1 秒窗口内实际 HTTP 请求数不超过 20

#### Scenario: 日志包含可诊断的失败原因
- **WHEN** 任务因网络错误失败，顶层异常仅为 `fetch failed`
- **THEN** 日志与 `sync_state.last_error` MUST 包含请求上下文（URL 或股票代码/复权类型/日期区间）以及底层 cause 的错误码

#### Scenario: 失败退避递增
- **WHEN** 某任务因网络错误失败且 `retry_count` 从 1 增加到 3
- **THEN** 系统按约 1s、2s、4s 递增写入 `next_retry_at`，并叠加随机抖动

#### Scenario: 达到最大重试次数
- **WHEN** 某任务连续失败且已完成 3 次自动重试
- **THEN** 系统把任务置为 `failed`，不再自动重试，等待用户点击“重试失败”

#### Scenario: 数据源返回 Retry-After
- **WHEN** 数据源返回 429 且包含 `Retry-After`
- **THEN** 系统取计算延迟与 `Retry-After` 的较大值作为 `next_retry_at`
