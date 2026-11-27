## 1. 共享类型与 IPC 校验

- [x] 1.1 在 `shared/types/index.ts` 新增名录查询类型：`SecuritiesExchangeFilter`（`ALL`/`SH`/`SZ`/`BJ`）、`SecuritiesStatusFilter`（`active`/`all`）、`SecuritiesDirectoryQuery`、`SecuritiesDirectoryItem`、`SecuritiesDirectoryPage`，并给 `MarketDataAPI` 增加 `listSecurities(query): Promise<SecuritiesDirectoryPage>`
- [x] 1.2 在 `electron/ipcValidation.ts` 增加 `marketSecuritiesList` schema（可选 `keyword` 最长 64、`exchange` 枚举、`status` 枚举、`page ≥ 1`、`pageSize` 1–200 且默认 50），并登记到 `SCHEMAS`

## 2. 主进程查询能力

- [x] 2.1 在 `electron/services/marketRepository.ts` 新增 `searchSecurities(db, query)`：动态拼装 `keyword`/`exchange`/`status` 条件，同一条件执行 COUNT 与 `ORDER BY code ASC LIMIT ? OFFSET ?`，返回 `{ items, total, page, pageSize }`；保留现有 `listSecurities` 供同步服务使用
- [x] 2.2 在 `tests/unit/marketStorage.test.ts` 或新增用例文件补齐查询测试：代码片段命中、名称片段命中、空白关键字不过滤、交易所与状态组合、分页不重不漏、超界页返回空列表且 `total` 正确、`total` 与筛选条件一致
- [x] 2.3 在 `electron/index.ts` 紧邻 `market:sync:*` 注册 `market:securities:list`，使用 `handleValidated`，查询异常不吞错、直接抛出

## 3. 预加载暴露

- [x] 3.1 在 `preload/index.ts` 的 `marketDataAPI` 增加 `listSecurities: (query) => ipcRenderer.invoke('market:securities:list', query)`，与 `MarketDataAPI` 类型保持一致

## 4. 页面与导航

- [x] 4.1 在 `src/composables/useNavigation.ts` 的 `ViewId` 增加 `'securities-directory'`
- [x] 4.2 在 `src/App.vue` 的 `viewComponents` 注册 `SecuritiesDirectoryView`
- [x] 4.3 在 `src/components/SideNav.vue` 的 `navItems` 中于「形态检测」之后、「行情库」之前插入「股票列表」入口
- [x] 4.4 新建 `src/views/SecuritiesDirectoryView.vue`：工具行（搜索框、交易所下拉、状态下拉、刷新、结果总数）、表格（代码/名称/交易所/上市日期/退市日期/状态/操作）、分页器（上一页/页码跳转/下一页），并复用全局 `.page`、`.btn` 与 `MarketDataView.vue` 的表格样式
- [x] 4.5 页面实现搜索防抖 300ms、筛选变更重置页码为 1、请求序号丢弃过期响应、请求中保留旧数据并显示 loading
- [x] 4.6 页面实现三种差异化状态：无筛选且 `total = 0` 显示「行情库尚未同步」并提供跳转「行情库」按钮；有筛选且 `total = 0` 显示「无匹配证券」并提供清空筛选；查询失败显示错误文本与「重试」

## 5. 加入自选联动

- [x] 5.1 在 `src/components/StockEditor.vue` 增加可选 props `initialStockCode` / `initialStockName`，仅在创建模式（`stockId === null && stock === null`）预填并跳过 `fetchStockName()` 反查
- [x] 5.2 名录页每行「加入自选」打开预填的 `StockEditor`，提交复用 `useWatchlistStore().addStock`；代码已在自选股中的行显示「已在自选」并禁用
- [x] 5.3 手测既有路径不回退：自选股页「新增」（手输代码反查名称）与「编辑已有股票」均正常

## 6. 验证

- [x] 6.1 `npm run test` 通过，新增查询用例覆盖 spec 中全部 scenario
- [x] 6.2 `npm run typecheck` 通过
- [x] 6.3 `npm run lint` 通过
- [x] 6.4 手工验证：未同步空态引导、关键字检索、交易所/状态筛选、翻页与页码跳转、加入自选后按钮置灰、页面全程不发起行情请求
