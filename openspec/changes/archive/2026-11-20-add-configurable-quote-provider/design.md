## Context

`electron/services/priceFetcher.ts` 是唯一的实时行情入口，被 `startScheduler`（默认每 1 分钟、仅交易时段）与手动刷新调用。它把配置里的 `api.url` 当成完整前缀，直接拼上带前缀的股票代码，然后：

- 固定设置 `Referer: http://finance.sina.com.cn`
- 固定用 `new TextDecoder('gbk')` 解码
- 固定用 `/hq_str_(\w+)="([^"]+)"/` 正则切分，按「名称,今开,昨收,现价,最高,最低」取字段

设置页的 provider 下拉只改 URL 字符串，解析路径完全不变，因此选东方财富或腾讯必然解析为空。`API_PROVIDERS` 里东财的默认值是单只接口 `push2.eastmoney.com/api/qt/stock/get`（需要 `secid` 参数、返回 JSON），腾讯是 `web.sqt.gtimg.cn/q=`（`~` 分隔、字段序与新浪不同），三者结构互不兼容。

约束：

- 一次轮询必须只发一次请求，把「所有开启监控的股票 + 3 个指数」合并批量拉取；不能退化成 N 次串行请求。
- 指数常量 `sh000001` / `sh000688` / `sz399001` 与 `index:update` IPC 契约、状态栏降级逻辑都不能变。
- 渲染进程不需要知道 provider 细节，只消费 `prices:update` / `index:update`。
- 用户明确要求：API 地址只读、失败不自动降级、东财用批量端点。

## Goals / Non-Goals

**Goals:**

- 引入 provider 适配层，让 sina / eastmoney / tencent 三选一都能真正取到股票与指数行情。
- 代码格式、端点、请求头、编码、解析规则全部由适配器承担，`priceFetcher` 只负责调度、合并、告警与广播。
- 设置页地址字段只读展示当前 provider 的标准端点，配置里的 `api.url` 由 provider 派生。
- 请求失败采用「显式失败」语义，不隐藏问题。

**Non-Goals:**

- 不做跨源自动降级、并发多源比对或投票取价。
- 不改造 K 线数据源（继续走 `stock-sdk`）。
- 不改动轮询间隔、交易时段判定、告警规则与指数展示逻辑。
- 不提供单 provider 的自定义超时、重试次数或私有网关地址配置。

## Decisions

### D1：适配器以「注册表 + 纯解析函数」实现，而非 if/else 分支

新增 `electron/services/quoteProviders/`，每个 provider 一个文件导出 `QuoteProvider`：

```ts
interface QuoteSnapshot {
  code: string;            // 请求时的原始带前缀代码，如 bj920799
  name: string;
  price: number;
  openPrice: number;
  prevClosePrice: number;
  highPrice: number;
  lowPrice: number;
  success: boolean;        // 单条是否有效（现价为 0 / "-" / 空 → false）
  error?: string;
}

interface QuoteProvider {
  id: QuoteProviderId;     // 'sina' | 'eastmoney' | 'tencent'
  endpoint: string;        // 只读，用于配置展示
  buildRequest(codes: string[]): { url: string; headers?: Record<string, string> };
  decode(buffer: ArrayBuffer): string;    // GBK 或 UTF-8
  parse(text: string, codes: string[]): QuoteSnapshot[];  // 必返回与 codes 等长的数组
}
```

`index.ts` 只维护 `Record<id, QuoteProvider>` 与 `getProvider(id)`，未知 id 回退 `sina`。解析函数保持无副作用纯函数，可直接喂固定样本字符串做单测。

**失败项归属**：`parse` 必须返回与入参 `codes` 一一对应的数组，缺失或无效的代码由**适配器**补 `{ success: false, error }`，`priceFetcher` 不再二次补齐。这样「响应条数少于请求代码」（东财静默丢弃无效 secid）与「单条现价非法」两类失败在同一处收口，避免职责重叠。

**替代方案**：在 `priceFetcher.ts` 里按 provider 写三个 if 分支。被否决——单文件继续膨胀，且解析逻辑无法独立测试。

### D2：东方财富使用 `ulist.np` 批量端点

端点：`https://push2.eastmoney.com/api/qt/ulist.np/get`，查询参数：

```
?fltt=2&fields=f2,f4,f12,f13,f14,f15,f16,f17,f18&secids=<secid1>,<secid2>,...
```

字段映射：`f2` 现价、`f4` 涨跌额、`f12` 代码、`f13` 市场、`f14` 名称、`f15` 最高、`f16` 最低、`f17` 今开、`f18` 昨收。

`fltt=2` 让价格以真实小数返回（默认 `fltt=1` 会放大 100 倍），避免额外的缩放假设。

**实测补充（2026-11-20）**：

- 无效或已迁移的 secid **不会报错，也不出现在 `diff` 中**（请求 8 个只返回 7 条，`1.830799` 被静默丢弃）。解析器必须以「返回集合」为准，把请求中缺失的代码标记为失败，不能假设 `diff.length === codes.length`。
- 停牌/已切换标的的 `f2` 实测为 `0.0`（不是 `"-"`），且 `f14` 带「(已切换)」后缀。解析器需同时容错 `"-"` 与非正值。
- 指数代码验证通过：`1.000001` → 上证指数、`1.000688` → 科创50、`0.399001` → 深证成指（东财名称与项目显示名「深成指数」不同，由 `INDEX_NAMES` 常量覆盖，不影响）。

**替代方案 A**：保留单只接口 `/api/qt/stock/get`，N 只股票发 N 次请求。被否决——轮询是每分钟一次、监控列表可达数十只，会造成请求风暴与部分成功的状态歧义。

**替代方案 B**：`clist/get` 列表端点按板块分页拉全市场再本地筛选。被否决——数据量、分页与板块覆盖复杂度远超需求。

### D3：内部代码统一为 `sh/sz/bj` 前缀，转换下沉到适配器

`getStockCodeWithPrefix` 产出 `sh600519` / `sz399001` / `bj920799`。适配器内部再转换：

- 新浪 / 腾讯：直接使用该形式，两家实测均支持 `bj` 前缀（`hq.sinajs.cn/list=bj920799` 与 `web.sqt.gtimg.cn/q=bj920799` 均返回正确数据）。
- 东财：`sh` → `1.`、`sz` → `0.`、`bj` → `0.`（北交所在东财同属市场 0，实测 `0.920799` 返回 `f13: 0` 的正常行情；`1.920799` / `1.830799` 均无效），拼成 `0.920799`。

**必须同时修复 `getStockCodeWithPrefix` 的前缀识别**：现有实现只覆盖 `6/5` → `sh`、`0/1/3` → `sz`、`8/4` → `bj`，北交所新代码段 `920xxx` 会落入兜底分支变成 `sz920799`（新浪/腾讯/东财三家都取不到数据）。规则需补 `9` → `bj`，且该规则对三家 provider 一致生效。

**快照 `code` 的来源**：`f13` 对深市与北交所都是 `0`，无法反推前缀（`bj920799` 会被错解为 `sz920799`）。因此东财适配器在 `buildRequest` 时构建 `secid → 原始带前缀 code` 的映射表，解析时用 `f13 + f12` 定位条目、再用映射表还原 `code`；`f13` 只参与匹配，**禁止**用于生成前缀。新浪与腾讯的 `hq_str_<code>` / `v_<code>` 中的 code 本身即带前缀，直接复用。

**替代方案**：让内部代码直接存 secid。被否决——会污染数据库与 IPC 中既有的 `stockCode` 语义，且指数常量、状态栏匹配全部要改。

### D4：`api.url` 保留字段但降级为派生的只读值

`ApiConfig` 结构不变（`{ provider, url }`），避免破坏配置 JSON 与导出的备份。规则：

- 新增纯函数 `normalizeApiConfig(provider)`（放在 `electron/database.ts`），永远返回 `{ provider: 合法值, url: getProvider(provider).endpoint }`；非法 provider 回退 `sina`。不接收 `url` 入参，从签名上就杜绝「自定义地址被采用」。
- `mergeWithDefaultConfig()` 与 `saveConfig()` 共用该函数；`loadConfig()` 因而自动获得归一化（存量东财单只端点会被改成 `ulist.np` 端点）。
- `ipcValidation.ts` **保持纯校验、不感知端点**：它刻意不依赖 electron，且已有一份 provider 白名单；把派生逻辑放进去会让「校验」与「归一化」耦合，并再添一处端点常量。
- `electron/index.ts` 的 `config:set` handler 必须用 `saveConfig()` 返回（或重新 `loadConfig()`）的归一化结果刷新 `currentConfig`，否则 `config:get` 会把未派生的旧 `url` 回给渲染层。
- 设置页把 `<input>` 改为 `readonly`（保留可选中复制），并在下方给出提示「地址由数据源决定，不可修改」。

**替代方案**：直接删除 `api.url` 字段。被否决——存量配置与备份文件里该字段普遍存在，删除会引入无谓的迁移与兼容分支。

### D5：证券名称查询复用同一适配器

`fetchStockName` 与批量行情共用 `buildRequest` / `decode` / `parse`：传入单个代码，取回快照的 `name`（为空则视为失败）。`stock:get-name` 的 IPC 契约与 `StockInfo` 返回结构不变，`StockEditor.vue` / `TradeEditor.vue` 无需改动。

同时**删除 `fetchStockPrice`**（[priceFetcher.ts](file:///E:/StockAnalyzer/electron/services/priceFetcher.ts#L93-L127)，全仓已无调用方），避免留下一套绕过适配器的取价入口。

### D6：端点常量只有一处 TS 来源，SQL 为已接受例外

TS 侧唯一来源是 `shared/types/index.ts` 的 `API_PROVIDERS`（含 `endpoint`），`electron/database.ts` 与 `src/composables/useConfig.ts` 的 `DEFAULT_CONFIG.api` **必须从它派生**，禁止再写字面量。

`sql/migrations/001_init.sql` 的默认配置行是 JSON 字符串，无法 import TS 常量，属于不可避免的重复：该文件的值仅决定**新库首次启动**的配置行，且 `loadConfig()` 的归一化会在读取时纠正任何偏差。此例外须在设计留痕，否则 `quote-data-source` 的「端点只有一处定义」要求自我不可满足。测试侧增加一条断言，保证 SQL 中的 `api.url` 与 `API_PROVIDERS` 中 `sina` 的端点一致。

### D7：失败不降级，统一走现有错误路径

适配器内任何失败（网络错误、非 2xx、整体解析为空）都抛出 `QuoteProviderError`，`fetchStockPrices` 捕获后把本批所有代码标记 `success: false`。不做「东方财富失败改打新浪」的隐式回退。

理由：用户显式选择了数据源，静默换源会让价格口径不可解释，也会掩盖 provider 配置错误。指数部分沿用既有降级：全部失败时发送 `status: 'error'`，状态栏保留上次成功数据并显示「数据更新失败」标签。

### D8：编码显式处理，不依赖运行时自动嗅探

新浪与腾讯返回 GBK，东财返回 UTF-8。适配器统一拿到 `ArrayBuffer` 后自行 `TextDecoder` 解码，禁止让 `response.text()` 隐式按 UTF-8 猜——否则新浪的中文名会变乱码。请求头只有新浪需要 `Referer: http://finance.sina.com.cn`，东财与腾讯不携带。

### D9：测试以固定样本响应驱动解析器

`tests/unit/quoteProviders*.test.ts` 直接喂入三家真实抓包样本（含停牌 `f2: 0.0` / `"-"`、已切换标的、指数条目、`diff` 条数少于请求数等边界），断言 `QuoteSnapshot`。`priceFetcher` 的调度逻辑不进单测（依赖 Electron 与真实网络），靠手动刷新与交易时段验证。

## Risks / Trade-offs

- **东财停牌/已切换标的的 `f2` 为 `0.0`，理论上也可能返回 `"-"`** → 解析器把非数值与非正值都视为该条无效，标记 `success: false`，不抛整批异常，避免一只停牌股票拖垮整轮刷新。
- **北交所 `920xxx` 代码前缀识别缺失** → 现有 `getStockCodeWithPrefix` 会把 `920799` 误判为 `sz`，三家都取不到数据；实现时必须补 `9` → `bj` 规则，并加一条覆盖 `920xxx` 的单测。
- **东财对无效 secid 静默丢弃** → 请求 N 个代码可能只返回 M（< N）条，解析器必须按代码反查补失败项，否则前端会出现「代码缺失但无错误」的静默空白。
- **腾讯 `web.sqt.gtimg.cn` 存在限流与来源校验风险** → 失败即显式报错并落日志，用户可切回新浪；不因限流自动换源（与 D5 一致）。
- **三家字段语义不完全对齐**（如腾讯不直接给「今开」时的边界情况） → 缺失字段填 0 并在设计中列为可接受的降级，`PriceResult.success` 仍以现价是否有效为准。
- **`config:set` 变为服务端改写 URL** → 渲染层若仍持有旧 `url` 并做等值比较，可能误判为「未修改」；实现时设置页以主进程返回的配置为准刷新本地副本。
- **指数与股票混在一批** → 东财返回的 `diff` 数组顺序不保证，解析器必须以 `f12 + f13` 反查代码而非按数组下标对位，否则指数价格会串到股票上。
- **请求没有超时**：现有 `fetch` 未设置 `AbortSignal`，接口挂起时本轮请求会与下一轮 `setInterval` 叠加。本次明确不引入超时/重试（见 Non-Goals），但如实记录为已知限制，便于日后排查「刷新变慢」类问题时定位。
- **名称查询是单代码请求**：`stock:get-name` 每次只查一只，仍是一次 HTTP 请求；若数据源限流，录入时的自动带名可能失败并回落到用户手填，不影响主流程。

## Migration Plan

1. 新增适配器目录与单测，`priceFetcher` 改为调用适配器（默认新浪，行为与现在完全一致）。
2. 修改 `API_PROVIDERS` 端点元数据（东财换 `ulist.np`），设置页地址字段转只读。
3. `config:set` 加入 URL 派生逻辑；`mergeWithDefaultConfig` 加入端点归一化。
4. `sql/migrations/001_init.sql` 与 `DEFAULT_CONFIG` 对齐新端点常量。

回滚：变更集中在主进程与设置页，回退代码即可；配置中的 `provider` 与 `url` 字段结构未变，老版本能正常读取（`url` 会被老版本当作可编辑字段处理，不影响启动）。

## Verified Findings（2026-11-20 实测）

两个原始 Open Question 已用真实请求关闭：

1. **北交所东财市场前缀 = `0`（已确认）**
   `secids=0.920799` 返回 `f13: 0` 的正常行情；`secids=1.920799` 与 `1.830799` 均不返回。结论：`bj` → `0.` 正确，无需按代码段区分市场。
   附带发现：北交所新代码段为 `920xxx`（旧 `830799` 已切换，`f14` 显示「艾融软件(已切换)」、`f2: 0.0`），现有 `getStockCodeWithPrefix` 缺 `9` 开头分支，会误判为 `sz` —— 已作为必改项写入 D3。

2. **腾讯「最高 / 最低」索引 = `33` / `34`（已确认）**
   `sh600519` 样本：`33: 1459.00`、`34: 1423.90`，与东财同标的 `f15: 1459.0`、`f16: 1423.9` 完全一致。其它已确认索引：`1` 名称、`2` 代码、`3` 现价、`4` 昨收、`5` 今开、`31` 涨跌额、`32` 涨跌幅、`41` / `42` 为最高 / 最低的重复副本。
   说明：腾讯返回字段总数不固定（`sh600519` 为 88 段，`bj920799` 为 87 段），解析必须按索引取值并对缺位做容错，禁止按总段数做校验。

3. **新浪 / 腾讯均支持 `bj` 前缀（已确认）**
   `hq.sinajs.cn/list=bj920799` 与 `web.sqt.gtimg.cn/q=bj920799` 均返回艾融软件正常行情，无需为北交所单独换端点。

剩余未决：无。
