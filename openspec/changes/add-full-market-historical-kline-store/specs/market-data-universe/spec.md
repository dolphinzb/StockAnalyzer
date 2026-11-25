## ADDED Requirements

### Requirement: 系统维护覆盖沪深北的证券主数据

系统 SHALL 在 `market_data.db` 中维护 `securities` 表，覆盖沪市、深市、北交所全部 A 股普通股，包含已退市股票。系统 MUST NOT 将 B 股、基金、可转债或指数写入该表。

#### Scenario: 在市股票进入证券主表
- **WHEN** 全市场代码同步成功，且数据源返回 `600519`、`000001`、`920000`
- **THEN** `securities` 中存在对应记录，`exchange` 分别为 `SH`、`SZ`、`BJ`

#### Scenario: 已退市股票保留在主表
- **WHEN** 退市补充清单包含已退市股票 `600001`
- **THEN** `securities` 中存在 `600001`，且 `is_active` 为 0、`delist_date` 不为空或标记为未知

#### Scenario: B 股被排除
- **WHEN** 代码发现流程遇到 `900901` 或 `200011`
- **THEN** 系统不将其写入 `securities`

### Requirement: 证券池由交易所官方名录、退市清单与人工覆盖合并

系统 SHALL 以交易所官方在市名录和退市清单作为 `securities` 的权威来源，`stock-sdk` 全量代码列表仅用于交叉校验与兜底。系统 MUST 按 `manual > 退市清单 > 交易所官方在市名录 > sdk_active` 的优先级去重，并为每条记录记录 `code_source`。

#### Scenario: 深交所名录按 JSON 分页读取
- **WHEN** 系统请求 `SHOWTYPE=JSON&CATALOGID=1110&TABKEY=tab1&PAGENO=n` 的深交所名录接口
- **THEN** 系统从响应 `json[0].data` 读取股票列表并写入 `securities`，`code_source` 为 `szse_name`

#### Scenario: 在市名录与退市清单合并
- **WHEN** 交易所在市名录包含 `600519`，上交所退市清单包含 `600001`
- **THEN** 两条记录都写入 `securities`，`code_source` 分别为 `sse_name` 与 `sse_delist`

#### Scenario: SDK 列表作为兜底
- **WHEN** 交易所官方名录获取失败但 `stock-sdk.getAShareCodeList` 返回代码
- **THEN** 系统可使用 SDK 代码兜底建立记录，`code_source` 为 `sdk_active`，且不得从 SDK 推断 `list_date`

#### Scenario: 北交所退市人工补录
- **WHEN** 北交所退市股票只能通过人工清单获得
- **THEN** 系统写入 `is_active = 0` 的证券记录，`code_source` 为 `manual`

### Requirement: 证券状态与日期字段可追踪

系统 SHALL 为每只证券维护 `exchange`、`name`、`type`、`list_date`、`delist_date`、`is_active`、`code_source`、`fetched_at` 与 `updated_at`。当 `list_date` 或 `delist_date` 无法从数据源获得时，系统 MUST 将其写为空值，MUST NOT 编造日期。

#### Scenario: 新上市证券状态
- **WHEN** 发现一只新上市股票且尚无退市日期
- **THEN** 系统写入 `is_active = 1`，`delist_date` 为空

#### Scenario: 退市证券状态
- **WHEN** 退市清单标识某证券已终止上市
- **THEN** 系统写入 `is_active = 0`，并把退市日期写入 `delist_date`

### Requirement: 名称和上市日期按字段来源优先级填充

系统 SHALL 按 `manual > 交易所退市清单 > 交易所官方在市名录 > SDK 名称兜底 / 东财 F10 字段兜底` 的优先级填充 `name`、`list_date` 与 `delist_date`。交易所官方名录字段映射 MUST 为：上交所 `COMPANY_ABBR / LIST_DATE`，深交所 `agjc / agssrq`（`agjc` MUST 剥离 HTML 标签），北交所“证券简称 / 上市日期”。系统 MUST NOT 从 K 线最早交易日推断 `list_date`。

#### Scenario: 上交所字段映射
- **WHEN** 上交所名录返回 `COMPANY_ABBR = 浦发银行`、`LIST_DATE = 1999-11-10`
- **THEN** 系统写入 `name = 浦发银行`、`list_date = 1999-11-10`

#### Scenario: 深交所字段映射
- **WHEN** 深交所名录返回 `agjc` 为包含证券简称的 HTML 链接，且 `agssrq = 1993-10-08`
- **THEN** 系统剥离 HTML 后写入 `name`，并写入 `list_date = 1993-10-08`

#### Scenario: SDK 仅补名称
- **WHEN** 交易所名录未提供 `list_date`，但 `stock-sdk.search` 返回证券名称
- **THEN** 系统只写入 `name`，`list_date` 保持空值

#### Scenario: 东财 F10 兜底上市日期
- **WHEN** 交易所名录缺失 `list_date`，且东财 F10 返回 `LISTING_DATE = 2001-08-27`
- **THEN** 系统将 `list_date` 写为 `2001-08-27`，并记录来源

#### Scenario: 不从 K 线推断上市日期
- **WHEN** 某证券 K 线最早交易日为 `2005-01-04` 且没有官方 `list_date`
- **THEN** 系统不将 `2005-01-04` 写入 `list_date`

### Requirement: 交易日历持久化

系统 SHALL 在 `market_data.db` 中维护 `trading_calendar` 表，保存源文件中的全部交易日，包括未来已公布交易日。每次同步 MUST 在单事务内整表替换：先删除全部旧日期，再插入源文件中的全部交易日。源级来源与抓取时间 MUST 写入 `meta.calendar_source` 与 `meta.calendar_synced_at`，MUST NOT 在每行重复存储。系统 SHALL 使用交易日历判断最新交易日和周/月派生周期边界。

#### Scenario: 首次写入交易日历
- **WHEN** 全新 `market_data.db` 首次执行日历同步
- **THEN** 系统清空 `trading_calendar` 并写入源文件中的全部交易日

#### Scenario: 源文件修订时整表替换
- **WHEN** 源文件新增、删除或修正交易日
- **THEN** 系统整表替换，新增日期出现、删除日期消失，MUST NOT 只追加而不删除

#### Scenario: 未来交易日持久化
- **WHEN** 源文件包含晚于今天的已公布交易日
- **THEN** 系统照常写入这些日期，但计算“最新交易日”时只取不晚于今天的最大日期

#### Scenario: 非交易日不作为最新交易日
- **WHEN** 今日为非交易日
- **THEN** 系统选择交易日历中不晚于今日的最近交易日作为增量下载终点
