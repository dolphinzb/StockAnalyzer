# add-configurable-quote-provider 文档评审记录

- 评审日期：2026-11-20
- 评审范围：`proposal.md`、`design.md`、`tasks.md` 以及 `specs/quote-data-source`、`specs/quote-provider-configuration`、`specs/ipc-input-validation`
- 评审方式：对照 `electron/services/priceFetcher.ts`、`electron/database.ts`、`electron/ipcValidation.ts`、`electron/index.ts`、`shared/types/index.ts`、`src/views/SettingsView.vue`、`src/composables/useConfig.ts`、`sql/migrations/001_init.sql` 与现有单测逐条核对

## 总体结论

文档整体质量较高：实测数据（东财市场前缀、腾讯字段索引、920 段、无效 secid 静默丢弃）已落进设计，停牌、乱序、残缺响应、北交所等边界均有覆盖，任务拆分可直接执行。但存在 4 个实施前必须补齐的问题与若干一致性问题，建议修订后再进入实现。

## 必须修正

### 1. 漏掉了 `stock:get-name` 链路，切换数据源后「自动填名称」仍会失效

- [priceFetcher.ts](file:///E:/StockAnalyzer/electron/services/priceFetcher.ts#L136-L185) 的 `fetchStockName` 同样硬编码了新浪 URL、`Referer`、GBK 与 `hq_str_` 正则，由 [index.ts](file:///E:/StockAnalyzer/electron/index.ts#L563-L571) 的 `stock:get-name` 调用，被 [StockEditor.vue](file:///E:/StockAnalyzer/src/components/StockEditor.vue#L33) 与 [TradeEditor.vue](file:///E:/StockAnalyzer/src/components/TradeEditor.vue#L51) 用于录入代码后自动带出名称。
- proposal 的 Impact 与 tasks 第 3 节只改造了批量 `fetchStockPrices`；用户切到东财/腾讯后新增股票仍取不到名称。
- 处理建议：补充任务，让名称查询也走适配器（复用 `buildRequest` + `parse` 取 `name`），或改为从批量解析结果取名称。
- 附带：`fetchStockPrice`（单只，[priceFetcher.ts](file:///E:/StockAnalyzer/electron/services/priceFetcher.ts#L93-L127)）已无任何调用方，应明确删除或一并改造。

### 2. `QuoteSnapshot` 契约缺「单条失败」的表达，与 spec 要求对不上

- 任务 1.1 定义的 `QuoteSnapshot` 只有 code/name/price/open/prevClose/high/low，[design D1](file:///E:/StockAnalyzer/openspec/changes/add-configurable-quote-provider/design.md#L40-L48) 也没有 success/error。
- 但 spec 要求「单只现价为 0/'-'/空 → 仅该代码失败」「diff 缺项 → 缺失代码标记失败」，任务 2.3 又写了「`f2` 为 `-` 时单条失败」，三者拼不出可实现的契约。
- 处理建议（二选一并写入 D1）：
  - `QuoteSnapshot` 增加 `success` / `error?`，由适配器直接产出；
  - 或 `parse` 返回 `{ snapshots, failed: Array<{ code, error }> }`，并明确「缺失代码补失败」由适配器还是 `priceFetcher` 承担（当前任务 2.3 与 3.7 都指向适配器，存在职责重叠）。

### 3. 东财代码归一化有歧义：`f13=0` 不能区分深市与北交所

- [design D2](file:///E:/StockAnalyzer/openspec/changes/add-configurable-quote-provider/design.md#L62-L70) 只说明「按 `f12`+`f13` 反查」，但 `f13` 对 `sz` 与 `bj` 都是 `0`（D3 已确认北交所映射为市场 0）。
- 若按 `f13` 反推前缀，`bj920799` 会被解析回 `sz920799`，违反 spec「归一化代码（带前缀）」。
- 处理建议：在设计中明确「以请求时的原始带前缀代码（secid → 原始 code 映射）作为快照 `code`」，`f13` 仅用于匹配、不用于生成前缀。

### 4. 「端点只有一处定义」与任务 4.1 自相矛盾

- [quote-data-source spec](file:///E:/StockAnalyzer/openspec/changes/add-configurable-quote-provider/specs/quote-data-source/spec.md#L113-L121) 要求端点集中定义，但任务 4.1 写的是「`DEFAULT_CONFIG.api` 对齐新端点常量」。
- 现状有三份字面量：[useConfig.ts](file:///E:/StockAnalyzer/src/composables/useConfig.ts#L15-L18)、[database.ts](file:///E:/StockAnalyzer/electron/database.ts#L56-L74)、[001_init.sql](file:///E:/StockAnalyzer/sql/migrations/001_init.sql#L158)。
- 处理建议：
  - TS 侧 `DEFAULT_CONFIG.api.url` 改为从 `API_PROVIDERS` 派生，任务 4.1 / 5.2 明确写「派生而非抄写」；
  - SQL 无法 import，属于不可避免的重复，需在设计里显式记录为「已接受的例外」，否则该 Requirement 自我不可满足。

## 建议明确

### 5. `api.url` 派生落点不清楚，且 Impact 漏了 `electron/index.ts`

- proposal / tasks 4.3 都说在 [ipcValidation.ts](file:///E:/StockAnalyzer/electron/ipcValidation.ts) 内覆写 URL，但该模块刻意设计为「纯校验、不依赖 electron」，且第 214 行还有一份私有 `API_PROVIDERS` 白名单。
- 把「按 provider 派生 URL」塞进校验器会让校验与归一化耦合，并新增一处端点常量。
- 处理建议：校验器保持结构校验；派生逻辑放入 `saveConfig`，或抽出 `normalizeApiConfig` 同时供 `config:set` 与 `mergeWithDefaultConfig` 使用。若采用此方案，[index.ts](file:///E:/StockAnalyzer/electron/index.ts#L333-L342) 的 `currentConfig = config` 需改为使用归一化后的对象，并补入 Impact 清单。

### 6. `config:set` 把 url 变成「忽略字段」后，仍要求非空字符串不合理

- [ipcValidation.ts](file:///E:/StockAnalyzer/electron/ipcValidation.ts#L230) 当前为 `minLength: 1`。既然该值会被服务端覆写，渲染层提交空串也应可保存。
- 任务 4.3 需要给出明确取舍：保持必填，还是放宽为 `allowEmpty` 并注明「仅为结构兼容，值不生效」。

### 7. 两处 provider 语义要写清「不是矛盾」

- [quote-data-source](file:///E:/StockAnalyzer/openspec/changes/add-configurable-quote-provider/specs/quote-data-source/spec.md#L3-L5) 说未知 provider 回退 `sina`，[ipc-input-validation](file:///E:/StockAnalyzer/openspec/changes/add-configurable-quote-provider/specs/ipc-input-validation/spec.md#L22-L26) 说非法 provider 被拒绝。
- 两者分别作用于 `loadConfig` 兜底与 `config:set` 入参，不矛盾，但文档未点明分界，评审时容易被误读为冲突。
- 处理建议：在两个 scenario 中各补半句限定语境。

### 8. 股票侧失败的用户可见性未定义

- spec 只规定了指数状态栏的降级展示；「失败不降级」对自选股仅要求「标记失败 + 写日志」。
- 已核对 [watchlist.ts](file:///E:/StockAnalyzer/src/stores/watchlist.ts#L386-L391)：空数组不会清空价格，因此「切源不清空」成立；但股票全部失败时界面无任何错误提示，价格静默停留在上一次。
- 处理建议：若为有意设计，在 spec 补一个 scenario 明确「股票失败仅保留旧值、不提示」，避免实现时各自发挥。

## 小问题

- 测试清单基本准确：
  - 已核对 [configAndPagination.test.ts](file:///E:/StockAnalyzer/tests/unit/configAndPagination.test.ts#L51-L61)，只要 `DEFAULT_CONFIG.api.url` 仍是新浪端点，现有断言即可继续通过；
  - [migrations.test.ts](file:///E:/StockAnalyzer/tests/unit/migrations.test.ts#L83-L89) 只断言配置行存在、不校验内容，无需修改；
  - 建议任务 6.3 顺带补一条「东财旧端点被归一化为批量端点」的正向用例，目前只写了「非法 provider 回退」。
- 任务 6.1 / 6.2 未覆盖「`getProvider(未知 id)` 回退 `sina`」这一显式行为，建议补一条注册表单测。
- `QuoteProvider.id` 与任务 1.1 新增的 `QuoteProviderId` 应复用同一类型；`ApiProviderOption.value` 目前仍是 `string`（[shared/types/index.ts](file:///E:/StockAnalyzer/shared/types/index.ts#L87-L100)），建议一并收窄，避免下游 `as` 强转。
- design 的 Non-Goals 明确不做超时/重试，但当前 `fetch` 无超时，请求挂起会与下一轮 `setInterval` 叠加。既然有意不做，建议在 Risks 中补一句已知限制，便于日后排查。

## 已确认无需改动的判断

以下设计判断与现有代码一致，维持原样即可：

- 东财使用 `ulist.np` 批量端点 + `fltt=2`；
- `getStockCodeWithPrefix` 补 `9` → `bj`（920 段）；
- `api.url` 保留字段而非删除；
- 失败不降级、不做跨源回退；
- `001_init.sql` 只影响新库，存量配置依赖读取时归一化，不做破坏性迁移。

## 处理记录（2026-11-20 复核）

逐条对照代码复核，8 个问题**全部属实**，已全部修正；小问题除「保留现状」项外全部采纳。

| # | 复核结论 | 修正落点 |
|---|---|---|
| 1 | 属实：`fetchStockName` 硬编码新浪链路，`stock:get-name` 经 `StockEditor` / `TradeEditor` 使用；`fetchStockPrice` 全仓无调用方 | `proposal.md` What Changes / Impact；`design.md` 新增 D5；`tasks.md` 3.1、3.8、7.4；`quote-data-source` 新增「证券名称查询走同一适配器」 |
| 2 | 属实：`QuoteSnapshot` 无 `success`，与单条失败要求冲突，且失败补齐职责重叠 | `design.md` D1 定义 `success` / `error` 与「`parse` 必返回与 codes 等长」；`tasks.md` 1.1、3.7；`quote-data-source` 补 3 个场景 |
| 3 | 属实：`f13` 对深市与北交所同为 `0`，按它反推会把 `bj920799` 变 `sz920799` | `design.md` D3 明确 secid→原始 code 映射表，`f13` 仅用于匹配；`quote-data-source` 补「归一化代码取自请求代码」场景 |
| 4 | 属实：spec 要求端点集中，但 TS 有 3 处字面量、SQL 无法 import | `design.md` 新增 D6（TS 单一来源 + SQL 为已接受例外，单测断言一致）；`tasks.md` 4.1、4.6、5.2、6.7 |
| 5 | 属实：`ipcValidation` 刻意不依赖 electron；`index.ts` 的 `currentConfig = config` 会保留未派生 url | `design.md` D4 改为 `normalizeApiConfig` 供 `loadConfig` / `saveConfig` 共用；`tasks.md` 4.2、4.3、4.5；`proposal.md` Impact 补 `electron/index.ts` |
| 6 | 属实：url 既被覆写又强制 `minLength: 1` | `ipc-input-validation` 明确允许空字符串并补场景；`tasks.md` 4.4 |
| 7 | 属实，属表述问题：两处 provider 语义作用于写入/读取两端 | `ipc-input-validation` 要求正文补充分界说明；`quote-data-source` 保留读取端回退表述 |
| 8 | 属实：spec 未定义股票侧失败的可见性 | `quote-data-source` 新增「股票全部失败时保留旧值且不弹提示」场景（与 `watchlist.ts` 现有行为一致） |

小问题处理：

- 已采纳：6.3 补「东财旧端点归一化为批量端点」正向用例；新增 6.5 注册表回退单测、6.6 名称解析用例、6.7 SQL 与元数据一致性断言；1.2 收窄 `ApiProviderOption.value` 为 `QuoteProviderId`；Risks 补「请求无超时与轮询叠加」与「名称查询单代码请求」两条已知限制。
- 保持原样：`migrations.test.ts` 确实只断言配置行存在；`configAndPagination.test.ts` 在 `DEFAULT_CONFIG` 仍以 `sina` 为默认时现有断言继续成立。
