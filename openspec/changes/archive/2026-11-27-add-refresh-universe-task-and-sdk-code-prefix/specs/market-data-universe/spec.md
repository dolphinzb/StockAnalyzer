## ADDED Requirements

### Requirement: SDK 兜底调用使用带市场前缀代码

系统在调用 `stock-sdk.getAllQuotesByCodes()` 补齐证券名称时 SHALL 按证券 `exchange` 将内部纯代码转换为带市场前缀格式：`SH` → `sh`、`BJ` → `bj`、其它 → `sz`。北交所代码 `430047` MUST 传为 `bj430047`。系统 MUST NOT 把内部纯代码原样传给该接口；SDK 返回带前缀代码时 MUST 剥离 `sh/sz/bj` 前缀后再与内部代码匹配，MUST NOT 把带前缀代码写入 `securities.code`。`getAShareCodeList` 的 `simple` 输出选项不属于本要求约束范围。

#### Scenario: 北交所名称兜底
- **WHEN** 证券 `430047` 的 `exchange = BJ` 且名称缺失，系统调用 `stock-sdk.getAllQuotesByCodes()` 兜底
- **THEN** 传给 SDK 的代码为 `bj430047`

#### Scenario: 沪深名称兜底
- **WHEN** 证券 `600519`（`exchange = SH`）与 `000001`（`exchange = SZ`）需要名称兜底
- **THEN** 传给 SDK 的代码分别为 `sh600519` 与 `sz000001`

#### Scenario: SDK 返回带前缀代码
- **WHEN** SDK 返回 `{ code: 'bj430047', name: '某北交所股票' }`
- **THEN** 系统剥离 `bj` 前缀后把名称写入 `430047` 的记录，`securities.code` 仍为 `430047`

#### Scenario: 名称兜底不修改上市日期
- **WHEN** SDK 名称兜底成功但交易所名录未提供 `list_date`
- **THEN** 系统只更新 `name`，`list_date` 保持空值
