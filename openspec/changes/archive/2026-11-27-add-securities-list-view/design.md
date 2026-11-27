## Context

`securities` 表位于独立的 `market_data.db`（`sql/market-migrations/001_init.sql`），主进程通过 `electron/marketDatabase.ts` 的 `getMarketDb()` 访问。现有读取函数 `listSecurities(db, {activeOnly})` 一次性取全表且无关键字过滤，只在主进程内部（同步服务、K 线下载）使用，从未通过 IPC 暴露给渲染进程。

渲染进程现状：

- 页面切换由 `src/composables/useNavigation.ts` 的 `ViewId` 联合类型 + `src/App.vue` 的 `viewComponents` 映射驱动，无 vue-router。
- 列表类页面均为自建 `<table>` + `v-for` 全量渲染（`PatternScanView.vue`、`MarketDataView.vue`），分页/触底加载模式见 `fundManagement` store + `TransferRecordList.vue`，通用无限滚动为 `useInfiniteScroll`；项目内无虚拟滚动实现。
- 添加自选股只有 `StockEditor.vue` 手输代码 + `stock:get-name` 反查名称，且主进程 `watchlist:add` 强制 `sellThreshold > buyThreshold`，`StockEditor.validateForm()` 还要求两者均大于 0。

因此本变更必须同时补「主进程查询通道」和「渲染进程页面」两段，缺一不可。

## Goals / Non-Goals

**Goals:**

- 提供可浏览全市场 A 股名录的页面，支持代码/名称关键字检索、交易所与在市状态筛选、分页。
- 查询在主进程完成过滤与分页，渲染进程只拿当前页数据，避免 5000+ 行跨进程传输。
- 名录为空或查询失败时页面能区分「尚未同步」与「查询异常」，并给出可执行引导。
- 从名录行直达「加入自选」，复用现有 `StockEditor`，不绕过阈值业务约束。

**Non-Goals:**

- 不展示实时价格、涨跌幅或 K 线覆盖情况（纯本地名录，不做行情请求）。
- 不修改 `securities` 表结构、不新增数据库迁移、不改同步调度。
- 不做虚拟滚动、多列排序、导出 CSV。
- 不改动 `watchlist:add` 的阈值校验规则。

## Decisions

### D1 入口与命名

`ViewId` 新增 `'securities-directory'`，页面组件 `SecuritiesDirectoryView.vue`，侧边栏标签「股票列表」，菜单位位置于「行情库」之前（当前顺序即「形态检测」之后、「行情库」之前）。

理由：名录浏览属于数据查看，行情库属于同步运维；「查看」入口应排在「管理」入口之前。替代方案是并入「行情库」页做第二个 Tab，但该页已有独立 spec 与轮询逻辑，混入会稀释职责。

### D2 分页与筛选下沉到主进程

新增 IPC `market:securities:list`，入参 `{ keyword?, exchange?, status?, page?, pageSize? }`，返回 `{ items, total, page, pageSize }`。

- `page` 从 1 开始，默认 1；`pageSize` 默认 50，上限 200。
- 排序固定 `ORDER BY code ASC`，保证翻页稳定。
- `total` 由与列表查询完全相同的 WHERE 条件 COUNT 得出，避免分页器与实际结果不一致。
- 两次查询在同一连接上同步执行（better-sqlite3），无需显式事务。

替代方案一：renderer 一次性拉全量后前端过滤分页。否决原因：跨进程结构化克隆数千行 + 前端全量重渲染，首次打开有明显卡顿，且未来证券池会随退市清单增长。

替代方案二：引入虚拟滚动 + 全量数据。否决原因：项目当前无虚拟滚动依赖，为单一页面引入成本高于服务端分页。

### D3 关键字匹配语义

入参 `keyword` 先 `trim()`，空串视为不过滤。非空时 WHERE 追加 `(code LIKE ? OR name LIKE ?)`，参数为 `%kw%`。

- 代码按文本包含匹配，`600` 能命中 `600519`，`0519` 也能命中；不额外做 6 位合法性校验，避免用户输入被拒。
- 名称包含匹配，SQLite `LIKE` 对中文按字节比较可用，ASCII 大小写不敏感。
- 不在本次引入 FTS5 或 `name` 索引：`%kw%` 形式本就用不上 B-tree 索引，全表扫描在数千行量级为毫秒级。

### D4 状态与交易所筛选

- `status`: `'active'`（默认，仅 `is_active = 1`）｜`'all'`（含退市）。不单独提供「仅退市」，两档足以覆盖浏览与查证场景。
- `exchange`: `'ALL'`（默认）｜`'SH'`｜`'SZ'`｜`'BJ'`，映射到 `exchange = ?`；`ALL` 不拼条件。
- 筛选条件之间为 AND；任一筛选变更时前端重置回第 1 页。

### D5 错误语义：查询失败必须与「空名录」区分

`getMarketDb()` 在行情库未初始化时抛错（`行情库未初始化`）。handler 不做吞错降级，异常以 rejected promise 返回，渲染进程 catch 后进入错误态。

理由：若像 `market:sync:status` 那样吞错返回空结构，页面会显示「暂无证券」并引导用户去全量回填，掩盖真实故障。区分方式：`total === 0 && !error` 才是「尚未同步」。

### D6 「加入自选」复用 StockEditor，不直连 watchlist:add

`watchlist:add` 要求 `sellThreshold > buyThreshold` 且二者必须大于 0，名录页没有任何价格信息，直接写入只能臆造默认阈值。

做法：给 `StockEditor.vue` 增加可选 props `initialStockCode` / `initialStockName`，仅在创建模式（`stockId === null` 且 `stock === null`）生效，预填代码与名称并跳过 `fetchStockName()` 反查；用户仍需填写买入/卖出阈值后提交。

- 已在自选股中的代码（页面读 `useWatchlistStore().stocks` 比对）按钮置为「已在自选」并禁用。
- 提交复用现有 `save` 事件 → `watchlistStore.addStock()`，不新增写入通道。

替代方案：行内按钮调用 `addStock` 并传 `buyThreshold: 0.01, sellThreshold: 0.02`。否决原因：产出用户未确认的告警阈值，会在交易时段误触发通知。

### D7 前端请求竞态与防抖

搜索输入 300ms 防抖；每次请求自增序号，仅当返回序号等于最新序号时写入列表。筛选切换立即请求并重置分页。请求中保留旧列表并显示轻量 loading，避免表格闪烁。

### D8 类型与通道注册位置

- 入参/返回体类型放入 `shared/types/index.ts`，与 `MarketSyncStatus` 并列；`MarketDataAPI` 增加 `listSecurities(query)`。
- `electron/ipcValidation.ts` 增加 `marketSecuritiesList` schema，复用 `v.string` / `v.enumOf` / `v.optional` / `v.number`（`pageSize` 用 `max: 200`）。
- `electron/index.ts` 用现有 `handleValidated` 注册，紧随 `market:sync:*` 通道。
- `preload/index.ts` 的 `marketDataAPI` 对象增加对应 `ipcRenderer.invoke`。

### D9 页面视觉与空态

沿用全局 `.page`、`.page-header`、`.btn` 与 `MarketDataView.vue` 的表格样式；页面包含：标题 + 结果计数、工具行（搜索框、交易所下拉、状态下拉、刷新按钮）、表格（代码/名称/交易所/上市日期/退市日期/状态/操作）、底部分页器（上一页/页码/下一页 + 每页条数）。

空态分三种：行情库未同步（引导去「行情库」）、筛选无结果（提示清空筛选）、查询失败（显示错误文本 + 重试）。

## Risks / Trade-offs

- [`name` 全表 LIKE 扫描] → 当前数千至上万行可接受；若后续达到十万级或实测超过 100ms，再引入 FTS5 或 `name` 前缀索引，届时新增独立迁移。
- [翻页期间同步任务并发 upsert] → `code` 是主键不会被改动，`ORDER BY code` 下最坏情况是新上市证券插入导致某条记录跨页重复一次，属可接受偏差；不引入快照读。
- [`securities` 表与 `stockanalyzer.db` 分属两库] → 名录页的「已在自选」判定依赖主库 watchlist，两库不一致时以 watchlist 为准，不写回 `securities`。
- [`StockEditor` 预填改动波及既有新增/编辑流程] → 预填仅在创建模式且传入 props 时生效；实现后需手测「自选股页新增」与「编辑已有股票」两条既有路径不回退。
- [`position:fetch-prices` 未纳入 schema 校验的先例] → 本变更不复用该通道，新查询通道必须走 `handleValidated`，不扩大无校验面。

## Migration Plan

- 无数据迁移，无配置变更。发布即生效；旧版本不受影响（新增通道与页面，无契约破坏）。
- 回滚：移除侧边栏入口与页面注册即可停用；新增 IPC 通道保留无副作用。
- 首次使用前置条件：需先在「行情库」完成全量回填，`securities` 才有数据；否则页面展示引导空态。

## Open Questions

- 分页条数默认 50 是否合适（全市场约 5000+ 只，50 条/页约 100 页）；若用户反馈翻页过多，可改为 100 条/页并提供切换。
- 是否需要「按交易所分组视图」或「仅退市」筛选项，属于后续增强，本次不做。
