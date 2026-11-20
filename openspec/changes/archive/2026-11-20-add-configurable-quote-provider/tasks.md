## 1. 共享类型与端点元数据

- [x] 1.1 `shared/types/index.ts`：新增 `QuoteProviderId = 'sina' | 'eastmoney' | 'tencent'` 与 `QuoteSnapshot` 接口（code/name/price/openPrice/prevClosePrice/highPrice/lowPrice/success/error），`code` 注释为「请求时的原始带前缀代码」
- [x] 1.2 `shared/types/index.ts`：把 `API_PROVIDERS` 的 `defaultUrl` 改为只读 `endpoint` 元数据，东方财富端点改为 `https://push2.eastmoney.com/api/qt/ulist.np/get`；`ApiProviderOption.value` 由 `string` 收窄为 `QuoteProviderId`，`ApiConfig.api.provider` 复用同一类型，去掉下游 `as` 强转
- [x] 1.3 确认 `ApiConfig` 结构保持 `{ provider, url }` 不变，`url` 语义注释为「由 provider 派生，只读」

## 2. 数据源适配器

- [x] 2.1 新增 `electron/services/quoteProviders/types.ts`：定义 `QuoteProvider` 接口（`id` / `endpoint` / `buildRequest` / `decode` / `parse`）与 `QuoteProviderError`
- [x] 2.2 新增 `electron/services/quoteProviders/sina.ts`：`hq.sinajs.cn/list=` 请求、`Referer` 头、GBK 解码、`hq_str_xxx="名称,今开,昨收,现价,最高,最低"` 解析
- [x] 2.3 新增 `electron/services/quoteProviders/eastmoney.ts`：`ulist.np/get` + `fltt=2` + `secids` 转换（`sh`→`1.`，`sz`/`bj`→`0.`）、UTF-8 解码、按 `f12`+`f13` 反查代码、`f2` 为 `0`/`"-"` 时单条失败
- [x] 2.4 新增 `electron/services/quoteProviders/tencent.ts`：`web.sqt.gtimg.cn/q=` 请求、GBK 解码、`v_xxx="~"` 分隔字段解析（33=最高 / 34=最低）
- [x] 2.5 新增 `electron/services/quoteProviders/index.ts`：provider 注册表与 `getProvider(id)`，未知 id 回退 `sina`
- [x] 2.6 实测确认（2026-11-20）：东财北交所市场前缀为 `0`；腾讯最高/最低索引为 `33` / `34`；北交所新代码段为 `920xxx`；东财对无效 secid 静默丢弃、停牌 `f2` 为 `0.0`

## 3. 轮询服务改造

- [x] 3.1 `electron/services/priceFetcher.ts`：`fetchStockPrices` 与 `fetchStockName` 均改为「取 provider → buildRequest → fetch → decode → parse」，删除硬编码 Referer、GBK 与 `hq_str_` 正则；`StockInfo` 返回结构与 `stock:get-name` 契约不变
- [x] 3.2 保留「监控股票 + 三指数合并为单次请求」与 `INDEX_CODES` / `INDEX_NAMES` 常量不变
- [x] 3.3 实现失败不降级：适配器异常统一转为本批全部 `success: false` 并写入日志（含 provider 与原因），不做跨源重试
- [x] 3.4 校验降级路径：指数全部失败时 `sendIndexUpdate(..., 'error', '数据更新失败')` 行为与改造前一致
- [x] 3.5 确认 `refreshAllEnabledStocks` 的 `prices:update` / 告警调用仅依赖统一快照字段，无 provider 分支
- [x] 3.6 修复 `getStockCodeWithPrefix`：补 `9` → `bj`（北交所 `920xxx` 段），避免 `920799` 被兜底成 `sz920799`
- [x] 3.7 适配器统一对「请求代码未出现在响应中」补失败项，保证 `parse` 返回数组与请求代码等长（`priceFetcher` 不再二次补齐）
- [x] 3.8 删除无调用方的 `fetchStockPrice`，确认 `preload` 与类型声明中无残留引用

## 4. 配置派生与归一化

- [x] 4.1 `electron/database.ts`：`DEFAULT_CONFIG.api` 改为从 `API_PROVIDERS` 派生（禁止抄写字面量）
- [x] 4.2 `electron/database.ts`：新增纯函数 `normalizeApiConfig(provider, url?)`，返回 `{ provider: 合法值, url: 端点 }`，非法 provider 回退 `sina`
- [x] 4.3 `electron/database.ts`：`mergeWithDefaultConfig` 与 `saveConfig` 均调用 `normalizeApiConfig`，`loadConfig` 因而自动归一化
- [x] 4.4 `electron/ipcValidation.ts`：保持纯校验、不引入端点常量；将 `api.url` 由 `minLength: 1` 放宽为允许空字符串（仅结构兼容），非法 provider 仍被拒绝
- [x] 4.5 `electron/index.ts`：`config:set` handler 用 `saveConfig` 归一化后的配置刷新 `currentConfig`，避免 `config:get` 返回未派生的旧 `url`
- [x] 4.6 `sql/migrations/001_init.sql`：确认默认配置中的 `api.url` 已是 `sina` 端点（无需改值），补充「已接受的字面量例外」注释
- [x] 4.7 检查 `loadConfig()` 对其他模块（告警、手动刷新、`position:fetch-prices`）的返回值语义，确认派生后的 url 不影响调用方

## 5. 设置页

- [x] 5.1 `src/views/SettingsView.vue`：`API 地址` 输入框改为只读展示，添加「地址由所选数据源决定，不可修改」提示
- [x] 5.2 `src/composables/useConfig.ts`：`DEFAULT_CONFIG.api` 与 `onApiProviderChange` 的 url 均从 `API_PROVIDERS` 端点元数据派生，不写字面量；切换 provider 只改 provider 并回填展示值
- [x] 5.3 保存后以 `config:set` 返回（或重新 `getConfig`）的配置刷新本地副本，避免只读字段与服务端派生值不一致
- [x] 5.4 验证「重置」后 provider 回到 `sina`、地址显示新浪端点（点击重置仅改表单，需再点保存才落盘）

## 6. 测试

- [x] 6.1 新增 `tests/unit/quoteProviders.test.ts`：三家固定样本解析（正常、停牌 `f2` 为 `0` / `"-"`、已切换标的、空响应、指数条目）
- [x] 6.2 补 `tests/unit/quoteProviders.test.ts`：东财 `secids` 转换（`sh` / `sz` / `bj` 含 `920xxx`）、乱序 `diff` 反查、`diff` 条数少于请求数时补失败项
- [x] 6.3 更新 `tests/unit/configAndPagination.test.ts`：覆盖 `mergeWithDefaultConfig` 的 url 归一化（含「东财旧单只端点 → 批量端点」正向用例）与非法 provider 回退
- [x] 6.4 更新 `tests/unit/ipcValidation.test.ts` 与 `tests/unit/ipcChannelContracts.test.ts`：覆盖 `config:set` 接受空 url、拒绝非法 provider，并断言校验器不引入端点常量
- [x] 6.5 新增注册表单测：`getProvider('unknown')` 回退 `sina`，`getProvider` 返回的 `endpoint` 与 `API_PROVIDERS` 一致
- [x] 6.6 新增证券名称解析用例（三家适配器均断言 `name`）；`fetchStockName` 依赖 Electron 运行时，不直接单测
- [x] 6.7 新增断言：`sql/migrations/001_init.sql` 默认配置行中的 `api.url` 与 `API_PROVIDERS` 中 `sina` 端点一致
- [x] 6.8 运行 `npm run typecheck`（或项目现有类型检查脚本）与 `npm test`，确认无回归（61 文件 / 393 用例通过）

## 7. 手工验证

- [x] 7.1 交易时段内分别切换到三家数据源，确认自选股价格与三项指数均正常更新
- [x] 7.2 断网或改错端点验证失败不降级：日志记录失败、界面显示「数据更新失败」、无自动换源
- [x] 7.3 确认切换 provider 后无需重启，下一次轮询即生效且界面数据不清空
- [x] 7.4 分别在三家数据源下测试「录入代码自动带出名称」（自选股新增、交易记录新增）
