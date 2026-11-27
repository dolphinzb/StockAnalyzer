## MODIFIED Requirements

### Requirement: 系统支持全市场全历史回填

系统 SHALL 支持从 `19900101` 开始对全市场证券发起单次日线全量回填。系统 MUST 由数据源仅返回上市后的交易日数据，MUST NOT 按 `list_date` 分段发起请求。一次日线任务 MUST 同时产出原始日线、前复权因子与后复权因子，MUST NOT 为同一证券对同一区间重复请求数据源。

#### Scenario: 新库首次回填
- **WHEN** 用户首次调用 `market:sync:start` 开始回填
- **THEN** 系统为每只证券生成一个日线任务，起始日期为 `19900101`，该任务产出的 raw/qfq/hfq 结果来自同一批原始日线

#### Scenario: 未上市期间返回空
- **WHEN** 某证券在请求区间早期尚未上市，数据源返回空数据
- **THEN** 系统视为正常结果，不将该任务标记为失败

#### Scenario: 同一证券单次请求
- **WHEN** 某证券的日线任务执行全历史回填
- **THEN** 系统对该证券只发起一次搜狐 `hisHq` 请求，前复权与后复权因子由该请求结果在本地推导，不再为复权类型单独发起请求

### Requirement: 全量回填由用户显式启动并幂等生成任务

系统 SHALL 仅在用户调用 `market:sync:start` 时启动全量回填。系统 MUST NOT 在首次启动时自动创建全量任务或自动发起下载。启动时系统 SHALL 先确保证券池与交易日历任务完成，再为每只证券幂等生成一个日线任务；重复调用 MUST NOT 生成重复任务。系统 MUST NOT 生成按复权类型拆分的 `qfq_daily / hfq_daily` 任务。

#### Scenario: 首次点击开始
- **WHEN** `sync_state` 中无回填任务，用户调用 `market:sync:start`
- **THEN** 系统先创建并执行 `active_codes / delisted_codes / calendar`，再为全部证券各生成一个日线任务

#### Scenario: 重复点击开始
- **WHEN** 已有任务，用户再次调用 `market:sync:start`
- **THEN** 系统不重复插入任务，按当前状态继续或恢复调度

#### Scenario: 首次启动不自动开始
- **WHEN** 应用首次启动且用户从未点击开始
- **THEN** `sync_state` 中不存在日线回填任务，系统不发起任何行情下载

### Requirement: 失败任务重试不影响已完成股票

系统 SHALL 提供 `market:sync:retry-failed`。该操作 MUST 只把 `failed` 任务改为 `pending`，重置 `retry_count` 与 `next_retry_at`，并启动调度。系统 MUST NOT 重置 `success` 任务，MUST NOT 重新生成全量任务，MUST NOT 删除已完成股票的数据。部分股票失败时，系统 SHALL 只重试失败任务，已完成股票保持不变；失败粒度 MUST 为单只证券（原始日线、因子、派生任一环节异常都视为该证券任务失败）。控制状态 MUST 持久化到 `meta.sync_control_state`，取值为 `idle / running / completed / failed`。

#### Scenario: 单股票任务失败
- **WHEN** 某证券的日线任务失败（原始日线或因子写入异常），用户点击“重试失败”
- **THEN** 系统只把该证券的任务改为 `pending` 并重试，其它证券的任务状态与已写入数据保持不变

#### Scenario: 部分股票失败
- **WHEN** 股票 A 任务成功、股票 B 任务失败，用户点击“重试失败”
- **THEN** 系统只重试股票 B，股票 A 的任务状态和数据保持不变

#### Scenario: 全部成功时无失败可重试
- **WHEN** `sync_state` 中不存在 `failed` 任务
- **THEN** “重试失败”为空操作，不生成新任务

#### Scenario: 重启后不自动继续
- **WHEN** 应用重启且存在未完成任务
- **THEN** 系统把 `running` 任务回退为 `pending`，控制状态改为 `idle`，等待用户点击继续

### Requirement: 系统支持手动触发的增量补跑

系统 SHALL 仅在用户调用 `market:sync:incremental` 时执行增量补跑。系统 MUST NOT 注册新库每日自动调度器，MUST NOT 自动执行增量。增量仅在全量回填完成后可用。对 `is_active = 1` 的每只证券的日线任务，起点 MUST 为 `last_success_date` 的下一个交易日，终点为最新交易日；如果任一必要任务的 `last_success_date` 为空，系统 MUST 拒绝启动并提示先执行全量回填。增量请求 SHALL 把请求起点向前扩展到上一交易日（包含在同一请求内），用于识别区间首日是否发生除权除息；区间内发生除权除息时，系统 MUST 使用库内原始日线重算前复权因子，MUST NOT 为此补拉全历史数据。全局最早缺失日期取所有待补任务起点的最小值，待补任务数写入状态。

#### Scenario: 多日未更新后补跑
- **WHEN** 某证券最后成功日为 `2026-11-17`，最新交易日为 `2026-11-24`，用户点击“增量更新”
- **THEN** 系统从 `2026-11-18` 开始补到 `2026-11-24`（请求区间额外包含 `2026-11-17` 用于因子合并）

#### Scenario: 不同股票从各自缺失日补
- **WHEN** 股票 A 最后成功日为 `2026-11-17`，股票 B 为 `2026-11-20`，最新交易日为 `2026-11-24`
- **THEN** 页面显示最早缺失日 `2026-11-18`，A 从 `2026-11-18` 补、B 从 `2026-11-21` 补

#### Scenario: 没有缺失数据
- **WHEN** 所有在市证券的必要任务 `last_success_date` 都等于最新交易日
- **THEN** 系统不生成任务，页面显示“已是最新”

#### Scenario: 未完成全量回填时拒绝增量
- **WHEN** 存在必要任务没有 `last_success_date`
- **THEN** 系统拒绝启动增量，提示用户先完成全量回填

#### Scenario: 退市证券跳过增量
- **WHEN** 增量任务扫描到 `is_active = 0` 的证券
- **THEN** 系统不为其生成日线任务

#### Scenario: 不自动执行增量
- **WHEN** 应用启动或日期到达收盘后
- **THEN** 系统不自动创建或执行增量任务，等待用户点击“增量更新”

#### Scenario: 增量除权重标定不额外拉全历史
- **WHEN** 增量区间内检测到除权除息事件
- **THEN** 系统基于库内已有原始日线重算全历史前复权因子，不再向数据源发起全历史请求

### Requirement: 行情库 K 线下载使用搜狐数据源

行情库的全量回填与增量下载 SHALL 使用搜狐 `hisHq` 作为 K 线数据源。系统 MUST NOT 在这些路径中调用 `stock-sdk.getHistoryKline()`，MUST NOT 在搜狐请求失败时回退到东方财富。证券池、交易日历、名称补全和搜索 SHALL 继续使用 `stock-sdk`。

搜狐 K 线请求 SHALL 使用 `period=d`、`order=A`、`stat=0`、`rt=json`，证券代码 MUST 添加 `cn_` 前缀，响应 MUST 按 GBK 解码。同步服务 MUST 只向适配器请求原始日线（`adjust` 为空），前复权与后复权 MUST 由同步服务基于原始日线与涨跌额/涨跌幅在本地推导；适配器 MUST NOT 承担复权序列生成职责。

#### Scenario: 全量回填使用搜狐
- **WHEN** 用户启动行情库全量回填并下载某证券 K 线
- **THEN** 系统请求搜狐 `hisHq`，不调用 `stock-sdk.getHistoryKline()` 获取 K 线

#### Scenario: 增量下载使用搜狐
- **WHEN** 用户对已有行情库执行增量补跑
- **THEN** 系统使用搜狐 `hisHq` 拉取增量区间日线，并按现有 `last_success_date` 语义推进

#### Scenario: 复权因子在同步服务内派生
- **WHEN** 同步服务执行某证券的日线任务
- **THEN** 复用同一次原始日线响应推导 qfq/hfq 因子，不向搜狐请求复权数据，也不为复权类型发起第二次请求

#### Scenario: 搜狐失败不回退
- **WHEN** 搜狐 K 线请求失败且达到最大重试次数
- **THEN** 任务置为 `failed` 并记录错误，系统不改用东方财富数据补齐该任务

#### Scenario: 元数据仍使用 stock-sdk
- **WHEN** 同步服务执行证券池、交易日历、名称补全或搜索
- **THEN** 系统继续使用 `stock-sdk` 的对应能力

## ADDED Requirements

### Requirement: 因子由原始日线单次推导，周/月缓存仅依赖原始日线

系统 SHALL 在同一日线任务内由原始日线推导 `adjust_factors`，推导结果 MUST 同时包含 `qfq_factor` 与 `hfq_factor`。不复权 `kline_weekly_raw / kline_monthly_raw` SHALL 仅依赖 `kline_daily_raw` 写入成功即可派生，不等待因子推导完成。复权周/月线在读取时要求对应因子存在；因子缺失时系统 MUST NOT 返回复权周/月线。

#### Scenario: 单任务成功即生成因子
- **WHEN** 某证券日线任务完成原始日线写入与因子推导
- **THEN** 系统写入该证券因子，并保留由原始日线派生的不复权周线与月线

#### Scenario: 因子缺失时复权周/月不可用
- **WHEN** 某证券存在原始日线但 `adjust_factors` 为空
- **THEN** 系统仍返回不复权周/月线，复权周/月线读取返回不可用

#### Scenario: 原始收盘价无效时跳过该日因子
- **WHEN** 某交易日原始收盘价为 null 或非正
- **THEN** 系统不写入该日因子，记录 `factor_invalid` 质量异常，原始日线导入继续进行

### Requirement: 升级后按单任务口径继续已有回填

系统 SHALL 在同步服务启动时把 `sync_state` 收敛到单任务口径：删除存量 `qfq_daily / hfq_daily` 任务行，保留 `raw_daily` 任务的 `last_success_date` 作为断点。系统 MUST NOT 重置已成功且因子完整的证券；仅当某证券 `raw_daily` 已成功但 `adjust_factors` 缺失或不完整时，系统 SHALL 将其日线任务重置为 `pending` 并记录日志，由下一次全量回填补算因子。

#### Scenario: 旧库升级后不重复下载
- **WHEN** 旧库中某证券 `raw_daily` 成功且 `adjust_factors` 覆盖其全部原始日线
- **THEN** 升级后该证券任务保持 `success`，系统不重新请求该证券数据

#### Scenario: 旧库升级后补算缺失因子
- **WHEN** 旧库中某证券 `raw_daily` 成功但 `adjust_factors` 缺失或行数少于原始日线
- **THEN** 升级后该证券日线任务重置为 `pending`，下一次全量回填只需一次请求即可补齐因子

#### Scenario: 旧任务行被清理
- **WHEN** 升级后的同步服务启动
- **THEN** `sync_state` 中不再存在 `qfq_daily / hfq_daily` 任务行，任务总数按每只证券一个日线任务统计

## REMOVED Requirements

### Requirement: 因子生成依赖三类原始数据，周/月缓存仅依赖原始日线

**Reason**: 三类日线任务合并为一个，qfq/hfq 不再作为独立任务下载，因子改由原始日线单次推导，“三类任务全部成功后才生成因子”的前提已不存在。

**Migration**: 因子生成与写入并入单只证券的日线任务；已成功的 `raw_daily` 任务与已写入的 `adjust_factors` 继续有效，仅对因子缺失的证券重置任务补算。周/月派生的“仅依赖原始日线”约束保持不变。
