# quote-data-source Specification

## Purpose
TBD - created by archiving change add-configurable-quote-provider. Update Purpose after archive.
## Requirements
### Requirement: 数据源适配器选择

系统 SHALL 依据配置项 `config.api.provider` 选择行情适配器，可取值为 `sina`、`eastmoney`、`tencent`，每个适配器独立定义端点、代码格式、请求头、响应解码与解析规则。未知或缺失的 provider 值 MUST 回退到 `sina`，MUST NOT 抛出异常导致轮询中断。

#### Scenario: 按配置选择新浪适配器

- **WHEN** 配置中 `api.provider` 为 `sina`
- **THEN** 本轮行情请求使用新浪端点 `https://hq.sinajs.cn/list=`，携带 `Referer: http://finance.sina.com.cn`，并以 GBK 解码响应

#### Scenario: 按配置选择东方财富适配器

- **WHEN** 配置中 `api.provider` 为 `eastmoney`
- **THEN** 本轮行情请求使用东方财富批量端点 `https://push2.eastmoney.com/api/qt/ulist.np/get`，以 UTF-8 解码响应，且不携带新浪 Referer

#### Scenario: 按配置选择腾讯适配器

- **WHEN** 配置中 `api.provider` 为 `tencent`
- **THEN** 本轮行情请求使用腾讯端点 `https://web.sqt.gtimg.cn/q=`，以 GBK 解码响应，解析 `v_<code>="字段1~字段2~..."` 格式

#### Scenario: provider 值非法

- **WHEN** 配置中 `api.provider` 为未知字符串
- **THEN** 系统按 `sina` 适配器发起请求，本轮轮询正常完成，不因未知值崩溃

### Requirement: 批量请求语义

每次价格刷新 SHALL 把「所有开启监控的自选股代码」与「三项指数代码 `sh000001`、`sh000688`、`sz399001`」合并为一批，并以**单次 HTTP 请求**获取全部行情，MUST NOT 为每只标的分开发起请求。

#### Scenario: 股票与指数合并为一次请求

- **WHEN** 监控列表中有 5 只股票且三项指数均参与刷新
- **THEN** 本轮对数据源仅发出 1 次 HTTP 请求，请求中同时包含 5 个股票代码与 3 个指数代码

#### Scenario: 监控列表为空

- **WHEN** 没有任何股票开启监控
- **THEN** 仍以三项指数代码发起 1 次请求，指数状态栏数据正常更新

### Requirement: 代码格式转换

系统 SHALL 内部统一使用带市场前缀的证券代码（`sh` / `sz` / `bj`），并由各适配器自行转换为数据源要求的格式；转换规则 MUST NOT 泄漏到调用方或其他模块。

#### Scenario: 新浪与腾讯直接使用前缀代码

- **WHEN** 内部代码为 `sh600519`
- **THEN** 新浪与腾讯适配器在请求中原样使用 `sh600519`

#### Scenario: 东方财富转换为 secid

- **WHEN** 内部代码为 `sh600519`、`sz399001`、`sh000001`
- **THEN** 东方财富适配器的 `secids` 参数分别为 `1.600519`、`0.399001`、`1.000001`

#### Scenario: 北交所代码映射

- **WHEN** 内部代码为 `bj920799`（北交所 920 段）
- **THEN** 东方财富适配器映射为市场 `0`，即 `0.920799`；新浪与腾讯直接使用 `bj920799`

#### Scenario: 920 段代码识别为北交所

- **WHEN** 自选股代码为 `920799`
- **THEN** 系统归一化为 `bj920799`，三家适配器均不将其误判为 `sz920799`

### Requirement: 统一价格快照输出

每个适配器 SHALL 把原始响应解析为统一的价格快照，包含归一化代码（带前缀）、名称、现价、今开、昨收、最高、最低，以及该条是否有效的 `success` 与失败原因 `error`；调用方 MUST NOT 依赖任何 provider 专有的字段名或数组下标。

`parse` MUST 返回与请求代码一一对应、等长的快照数组：响应中缺失的代码与无效条目均由适配器补为 `success: false`，调用方 MUST NOT 再行补齐。

#### Scenario: 快照与请求代码等长

- **WHEN** 适配器解析响应后，实际只匹配到 7 个代码而请求传入 8 个
- **THEN** 返回数组长度为 8，缺失代码对应的快照 `success` 为 `false` 且带错误原因

#### Scenario: 单条失效带失败标记

- **WHEN** 某条快照的现价为 `0` / `"-"` / 空字符串
- **THEN** 该快照 `success` 为 `false`，其余快照的 `success` 为 `true`

#### Scenario: 归一化代码取自请求代码

- **WHEN** 东方财富返回 `f12: "920799"`、`f13: 0`，而请求时的原始代码为 `bj920799`
- **THEN** 快照 `code` 为 `bj920799`，MUST NOT 依据 `f13` 反推为 `sz920799`

#### Scenario: 三家返回同构结果

- **WHEN** 同一只股票 `sh600519` 分别由三个适配器解析
- **THEN** 三者输出的快照字段集合一致，且现价、今开、昨收、最高、最低的语义相同

#### Scenario: 东方财富不按下标对位

- **WHEN** 东方财富响应的 `diff` 数组顺序与请求顺序不一致
- **THEN** 系统按 `f12`（代码）与 `f13`（市场）反查归属，股票与指数价格不串位

#### Scenario: 响应条目少于请求代码

- **WHEN** 请求 8 个代码而东方财富 `diff` 仅返回 7 条（无效 secid 被静默丢弃）
- **THEN** 系统以代码反查匹配，缺失的那 1 个代码标记为失败，其余 7 个正常返回

#### Scenario: 响应条目字段数不固定

- **WHEN** 腾讯返回的字段段数在不同标的间不一致（88 段与 87 段）
- **THEN** 系统按固定索引取值并对缺位字段容错，不因段数差异判定整条无效

#### Scenario: 名称字段缺失

- **WHEN** 某适配器响应中不包含名称字段或名称解析为空字符串
- **THEN** 该快照 `success` 为 `false`、`name` 为空字符串，系统不抛异常，同批其余快照不受影响

### Requirement: 失败不降级

行情请求失败（网络错误、非 2xx 响应、整体解析结果为空）时，系统 SHALL 把本批全部代码标记为失败并把错误写入日志，MUST NOT 自动改用其他 provider 重试。

#### Scenario: 当前 provider 请求失败

- **WHEN** 配置为 `tencent` 且腾讯接口返回 HTTP 500
- **THEN** 本轮所有代码 `success` 为 `false`，日志记录 provider 与失败原因，系统不向新浪或东方财富发起替代请求

#### Scenario: 指数全部失败时走降级展示

- **WHEN** 一轮刷新中三个指数代码全部解析失败
- **THEN** 主进程发送 `index:update` 且 `status` 为 `error`，状态栏保留上次成功数据并显示「数据更新失败」

#### Scenario: 单只标的无效不拖垮整批

- **WHEN** 某只标的在响应中的现价为 `0`、`"-"` 或为空字符串
- **THEN** 仅该代码标记失败，其余标的仍正常返回成功结果

#### Scenario: 股票全部失败时保留旧值且不弹提示

- **WHEN** 一轮刷新中全部自选股都获取失败
- **THEN** 自选股列表继续展示上一轮的价格，不出现清空或占位符，也不新增全局错误弹窗；失败仅写入日志，用户可通过指数状态栏的错误标签察觉异常

### Requirement: 证券名称查询走同一适配器

按代码查询证券名称（录入自选股或交易记录时自动带出名称）SHALL 与批量行情共用同一 provider 适配器，MUST NOT 单独硬编码某一家的请求与解析逻辑。查询失败时系统 MUST 返回失败结果，MUST NOT 抛异常中断录入流程。

#### Scenario: 切换数据源后仍能自动带名

- **WHEN** 配置为 `eastmoney`，用户在自选股录入框输入 `600519` 并失焦
- **THEN** 系统通过东方财富适配器取得快照并以其中的名称回填，无需用户手填

#### Scenario: 名称查询失败

- **WHEN** 当前 provider 请求失败或返回结果中名称为空
- **THEN** 系统返回 `success: false` 的名称查询结果，输入框保持原值，录入流程不中断

### Requirement: 数据源端点元数据

系统 SHALL 把三家 provider 的端点集中定义为只读元数据，供适配器与设置页共同使用，MUST NOT 在设置页、配置默认值或主进程解析逻辑中各自硬编码不同地址。TS 代码侧的 `DEFAULT_CONFIG` MUST 从该元数据派生（禁止抄写字面量）；`sql/migrations/001_init.sql` 的初始配置行因无法引用 TS 常量，作为唯一已接受的重复例外，其值 MUST 与 `sina` 端点保持一致，并由单测断言。

#### Scenario: 端点只有一处定义

- **WHEN** 需要调整东方财富批量端点地址
- **THEN** 仅修改共享端点元数据一处，适配器请求、配置默认值与设置页展示同步生效

#### Scenario: SQL 初始化脚本与元数据一致

- **WHEN** 单测读取 `sql/migrations/001_init.sql` 的默认配置行
- **THEN** 其中的 `api.url` 与共享元数据中 `sina` 的端点字符串完全一致

