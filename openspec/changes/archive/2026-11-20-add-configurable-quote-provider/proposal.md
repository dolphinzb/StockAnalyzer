## Why

设置页已经提供「新浪 / 东方财富 / 腾讯」三选一的数据源下拉，但主进程 `electron/services/priceFetcher.ts` 只把选中项当成一段 URL 字符串拼接，请求头（`Referer: http://finance.sina.com.cn`）、解码方式（`gbk`）、响应解析（`/hq_str_(\w+)="([^"]+)"/`）全部按新浪格式硬编码。用户切换到东方财富或腾讯后，请求能发出但一条数据都解析不出来，监控价格与指数状态栏实际全部失效。需要一个真正的 provider 适配层，让三选一是可用的功能而不是装饰。

## What Changes

- 新增行情数据源适配层：按 `config.api.provider` 选择适配器，由适配器负责代码格式映射（新浪/腾讯 `sh600519`、东财 `secid=1.600519`）、请求端点与查询参数、必要请求头、响应编码与字段解析，输出统一的 `PriceResult` 契约。
- 东方财富改用批量端点 `https://push2.eastmoney.com/api/qt/ulist.np/get`（`secids` 多值 + `fields`），与另两家保持「一次轮询一次请求」的行为；不再使用单只接口 `/api/qt/stock/get`。
- 三个 provider 的默认端点集中定义，`shared/types/index.ts` 的 `API_PROVIDERS` 由「可编辑默认 URL」改为「只读端点元数据」。
- **BREAKING**: 设置页的「API 地址」输入框改为只读展示（当前 provider 的端点 + 说明文字），不再允许用户编辑或提交自定义 URL；`config.api.url` 由主进程按 provider 派生并持久化，渲染层传入的任意值不生效。
- 数据源请求失败时**不做自动降级/多源回退**：本轮直接失败，沿用现有降级路径（指数状态栏保留上次成功数据并显示「数据更新失败」），错误写入日志。
- 切换 provider 后下一次轮询即生效，无需重启应用；轮询频率、交易时段判定、监控股票与三指数（含 `sh000688`）的合并批量请求行为保持不变。
- 证券名称查询（`stock:get-name`，自选股与交易录入时按代码自动带出名称）同样改走 provider 适配器，避免切换数据源后「自动填名称」失效。
- 删除已无调用方的单只查询 `fetchStockPrice`，避免它与适配器并存造成两套取价逻辑。

## Capabilities

### New Capabilities
- `quote-data-source`: 行情数据源适配契约——provider 枚举到适配器的映射、代码格式转换、端点与请求头、响应编码与解析、统一价格结果字段、失败语义（不降级）、指数与自选股同批请求。
- `quote-provider-configuration`: 设置页数据源选择与只读地址展示、provider 变更的下发与持久化、生效时机（下一次轮询）、非法或历史脏配置的归一化兜底。

### Modified Capabilities
- `ipc-input-validation`: `config:set` 对 `api.url` 的校验从「接受任意非空字符串并落盘」改为「以 `provider` 为准派生标准端点，忽略渲染层传入的自定义地址」，同时保持 `provider` 三值枚举与配置结构校验。

## Impact

- **主进程**：`electron/services/priceFetcher.ts`（改为调用适配器，`fetchStockName` 一并适配，删除无调用方的 `fetchStockPrice`）、新增 `electron/services/quoteProviders/`（`sina.ts` / `eastmoney.ts` / `tencent.ts` 与 `index.ts` 注册表）、`electron/database.ts`（`DEFAULT_CONFIG` 从端点元数据派生、新增 `normalizeApiConfig` 供 `loadConfig` / `saveConfig` 共用）、`electron/ipcValidation.ts`（`config:set` 的 `api.url` 放宽为可空，仍只做结构校验）、`electron/index.ts`（`config:set` 后用归一化配置刷新 `currentConfig`，否则 `config:get` 会返回未派生的旧 url）
- **共享类型**：`shared/types/index.ts`（`ApiConfig`、`ApiProviderOption`、`API_PROVIDERS` 的端点元数据与 `QuoteProvider` 类型）
- **渲染进程**：`src/views/SettingsView.vue`（地址只读展示与提示）、`src/composables/useConfig.ts`（`onApiProviderChange` 不再由前端改写 url，`getApiProviderDefaultUrl` 语义调整）
- **数据库**：`sql/migrations/001_init.sql` 与存量 `config.app_config` 的默认值（`api.url` 与东财新端点对齐）；既有用户配置在读取时归一化，不做破坏性迁移
- **测试**：`tests/unit/configAndPagination.test.ts`、`tests/unit/ipcValidation.test.ts`、`tests/unit/ipcChannelContracts.test.ts` 需随配置语义调整；新增三家适配器的响应解析与代码映射单测
- **非目标**：不实现失败自动降级或跨源结果比对；不改造 K 线数据源（仍走 `stock-sdk`）；不新增第四家数据源；不调整轮询间隔与交易时段规则；不实现单 provider 的自定义超时/重试策略
