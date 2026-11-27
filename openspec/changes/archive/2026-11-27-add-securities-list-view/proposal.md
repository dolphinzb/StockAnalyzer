## Why

行情库页面（`MarketDataView.vue`）只负责触发与观测同步任务，用户看不到 `securities` 表里的全市场证券主数据，无法按代码或名称检索股票。结果是添加自选股只能盲输代码靠 `stock:get-name` 反查名称，既容易输错，也让已回填的证券名录没有任何浏览价值。

## What Changes

- 新增主进程查询通道 `market:securities:list`，支持按关键字（代码/名称）、交易所、在市状态筛选与分页，返回 `{ items, total, page, pageSize }`。
- `marketRepository` 增加条件化查询函数（关键字 LIKE、exchange、activeOnly、limit/offset）与配套计数，替换现有只能一次性全量读取的 `listSecurities` 使用场景。
- 扩展 `MarketDataAPI` 与 `preload` 暴露方法，渲染进程可通过 `window.marketDataAPI.listSecurities()` 取名录页数据。
- 新增「股票列表」页面 `SecuritiesDirectoryView.vue`，注册 `ViewId = 'securities-directory'`，侧边栏增加入口；页面提供关键字搜索（防抖）、交易所筛选（全部/沪/深/北）、状态筛选（在市/含退市）、分页与空态提示。
- 列表行提供「加入自选」操作：复用 `StockEditor` 弹窗，预填该行的证券代码与名称，阈值仍由用户填写（不静默写入臆造默认阈值）。
- 行情库未同步（`securities` 为空）时，页面给出引导跳转到「行情库」页执行全量回填，而不是展示空白表格。

## Capabilities

### New Capabilities

- `securities-directory-query`: 主进程侧的证券名录查询能力——分页、关键字检索、交易所与在市状态筛选的语义边界、参数校验与未初始化行情库的降级行为。
- `securities-directory-ui`: 「股票列表」页面的入口、列表字段、搜索与筛选、分页、空态与「加入自选」交互。

### Modified Capabilities

<!-- 无：行情库管理页与证券主数据维护规则的既有需求不变 -->

## Impact

- 主进程：`electron/index.ts`（新增 IPC handler）、`electron/services/marketRepository.ts`（新增查询与计数）、`electron/ipcValidation.ts`（新增 SCHEMAS 条目）。
- 预加载与共享层：`preload/index.ts`、`shared/types/index.ts`（`MarketDataAPI` 扩展、名录查询入参与返回体类型）。
- 渲染进程：`src/views/SecuritiesDirectoryView.vue`（新增）、`src/composables/useNavigation.ts`、`src/App.vue`、`src/components/SideNav.vue`、`src/components/StockEditor.vue`（新增预填 props）。
- 数据层：不新增数据库迁移。`securities` 数据量约数千至上万行，关键字检索走 `LIKE`（`code` 主键前缀可走索引，`name` 全表扫描），在当前量级可接受；若后续实测变慢再评估新增 `name` 索引。
- 不影响现有行情同步调度、自选股轮询与 K 线下载逻辑。
