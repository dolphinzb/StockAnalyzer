## Why

全量回填完成后新上市的股票不会自动进入本地证券池：增量更新以本地 `securities` 为基准，发现证券数多于日线任务数时直接拒绝并提示“请先执行全量回填”；但再次点击“全量回填”因日线任务已存在，只走断点续跑分支，不会重新执行 `active_codes / delisted_codes` 任务，因此股票列表永远刷不出来，形成死循环。同时，stock-sdk 名称兜底把库内纯数字代码原样传给 `getAllQuotesByCodes`，北交所 `430047` 这类代码必须传 `bj430047`，否则可能查不到或串到错误市场。

## What Changes

- 新增 `market:sync:refresh-universe` 控制入口：只执行 `active_codes / delisted_codes` 两个市场级任务刷新 `securities`，不重跑交易日历、不重置已有日线任务、不删除历史数据。
- 刷新证券池后幂等补建缺失的日线任务：为本地名录中尚无 `raw_daily` 任务的证券（包括新上市股票）生成任务并调度执行，使其获得完整历史；已成功的股票不受影响。
- 刷新证券池与全量回填、增量更新互斥：运行期间拒绝其它同步控制命令，页面按钮按状态禁用。
- 行情库页面新增“刷新证券池”按钮，复用现有状态轮询展示运行进度与错误。
- 修正 stock-sdk 兜底调用：调用 SDK 前按 `exchange` 把内部纯代码转成带市场前缀格式（如 `430047` → `bj430047`，`600519` → `sh600519`），SDK 返回后剥离前缀再映射回内部代码。
- 补充同步服务、证券池与 IPC 契约的单测，覆盖新增入口与北交所代码前缀。
- 非目标：不改变 K 线数据源（仍为搜狐），不新增自动刷新调度，不提供删除/重置已有行情数据的能力。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `market-data-sync`：新增手动“刷新证券池”命令，定义其任务范围、补建新股日线任务的规则及与全量/增量的互斥关系。
- `market-data-management-ui`：新增“刷新证券池”按钮及其状态展示、禁用规则。
- `market-data-universe`：明确 stock-sdk 兜底调用必须使用带市场前缀的证券代码；证券池刷新只更新名录，不改变来源优先级与字段填充规则。

## Impact

- `electron/services/marketDataSyncService.ts`：新增 `refreshUniverse()`，市场级任务编排、补建新股任务与互斥校验。
- `electron/services/marketUniverseService.ts`：`enrichMissingNames()` 调用 SDK 前按 `exchange` 加前缀。
- `electron/ipcValidation.ts`：新增 `marketSyncRefreshUniverse` schema。
- `electron/index.ts`、`preload/index.ts`、`shared/types/index.ts`：新增 IPC 通道与 `MarketDataAPI.refreshUniverse()`。
- `src/composables/useMarketDataSync.ts`、`src/views/MarketDataView.vue`：新增按钮、处理函数与禁用逻辑。
- `tests/unit/marketSync.test.ts`、`tests/unit/marketUniverse.test.ts`、`tests/unit/ipcChannelContracts.test.ts`：新增/更新测试。
