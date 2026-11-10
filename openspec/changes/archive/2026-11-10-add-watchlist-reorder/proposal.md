## Why

自选股列表当前没有用户可控的顺序：顺序由「监控状态优先 + 更新时间倒序」两处派生规则共同决定（SQL 的 `ORDER BY monitor_enabled DESC, updated_at DESC` 与前端 `sortedStocks` computed 各算一遍），用户在意的股票无法按自己的关注优先级排列。更糟的是 `updated_at` 在每次编辑阈值、切换监控时都会被刷新，导致用户刚熟悉的列表位置会自己跳动。

## What Changes

- 数据库 `watchlist_stocks` 表新增持久化排序字段 `sort_order`，作为列表顺序的唯一事实源；存量数据在升级时按用户当前看到的顺序（监控优先、更新时间倒序、id 兜底）回填，保证升级后顺序与原样一致
- 新增「保存自选股顺序」的 IPC 通道，一次提交完整的有序 id 列表，主进程在单个事务内重写 `sort_order` 后落盘
- 自选股列表新增拖拽手柄列，支持鼠标拖拽调整行顺序；拖拽结束后乐观更新本地列表并提交持久化，失败时回滚并提示
- **BREAKING（行为变更）**：列表顺序不再按「监控中优先」分组，也不再按更新时间浮动。`monitor_enabled` 仅保留行样式与告警语义，不影响位置；编辑阈值或切换监控不再改变列表顺序
- 新增自选股时排到列表末尾（`sort_order` 取当前最大值 + 1），不打断已有顺序
- 前端移除 `sortedStocks` 中对监控/时间的二次排序，改为直接使用后端返回的顺序，避免前后端排序规则打架
- 引入拖拽库（`sortablejs`）作为渲染进程依赖，用于列表行拖拽

本次不包含：按代码/名称/涨跌幅等字段的自动排序入口、一键整理按钮、排序模式切换开关。

## Capabilities

### New Capabilities

- `watchlist-manual-ordering`: 自选股列表的用户自定义顺序能力，包括顺序的持久化存储与升级迁移、顺序查询与变更接口、拖拽交互与失败回滚、新增股票的追加位置，以及监控状态不再影响列表顺序的语义约定

### Modified Capabilities

（现有 `openspec/specs/` 中无自选股列表相关 capability，本次为新增能力，无既有规格变更）

## Impact

**受影响的文件**:
- `sql/init.sql` - `watchlist_stocks` 表新增 `sort_order` 列
- `electron/database.ts` - 存量库幂等迁移（加列 + 按当前顺序回填）、`WatchlistStock` 类型与 `rowToWatchlistStock` 列映射、`getWatchlist` 排序规则、`addStock` 追加位置、新增重排函数
- `electron/index.ts` - 新增顺序保存 IPC handler
- `preload/index.ts` - 暴露顺序保存方法（该文件内另有一份 `WatchlistStock` 接口副本需同步）
- `shared/types/index.ts` - `StockWatcherAPI` 与 `Window` 声明补充新方法签名
- `src/types.ts` - `WatchlistStock` 增加 `sortOrder` 字段
- `src/stores/watchlist.ts` - 移除 `sortedStocks` 的派生排序，新增顺序提交 action（乐观更新 + 失败回滚）
- `src/views/WatchlistView.vue` - 传入顺序变更回调（编辑回填、批量下载入参仍复用展示顺序）
- `src/components/StockList.vue`、`src/components/StockItem.vue` - 新增拖拽手柄列、初始化拖拽实例；两处硬编码的 12 列 grid 定义需同步扩展
- `package.json` - 新增 `sortablejs` 与类型声明依赖
- `tests/unit/` - 顺序相关纯逻辑（重排计算、追加位置）单元测试

**API影响**: 新增一个 IPC 通道（保存顺序），`getWatchlist` 返回结构新增 `sortOrder` 字段（向后兼容）；现有增删改接口签名不变。

**依赖影响**: 新增 `sortablejs`（渲染进程）。数据库仅新增列与索引，无表拆分。

**用户体验影响**:
- 正面：列表顺序完全由用户掌控且重启后保持；编辑阈值、切换监控不再导致行位置跳动
- 风险：习惯了「开启监控自动置顶」的用户会感知到行为变化，需要在界面或用例中明确顺序为手动维护
- 风险：拖拽手柄与行内已有的名称点击（打开K线）、监控开关、操作按钮距离较近，需限制拖拽触发区域避免误操作
