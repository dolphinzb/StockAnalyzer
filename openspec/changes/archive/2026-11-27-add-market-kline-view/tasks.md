## 1. 共享类型与 IPC 校验

- [x] 1.1 在 `shared/types/index.ts` 新增 `MarketKlinePeriod`（`d`/`w`/`m`）、`MarketKlineAdjust`（`none`/`qfq`/`hfq`）、`MarketKlineQuery`、`MarketKlineBar`，并给 `MarketDataAPI` 增加 `queryKline(query): Promise<MarketKlineBar[]>`
- [x] 1.2 在 `electron/ipcValidation.ts` 增加 `marketKlineQuery` schema（`stockCode` 非空、周期枚举、复权枚举）并登记到 `SCHEMAS`

## 2. 主进程查询能力

- [x] 2.1 在 `electron/services/marketRepository.ts` 新增 `readAdjustedDaily(db, stockCode, adjust)`：读取原始日线与对应因子，逐日乘因子到开高低收，主进程按复权价计算涨跌额/涨跌幅/振幅；因子缺失返回空数组
- [x] 2.2 在 `electron/services/marketRepository.ts` 新增 `readMarketKline(db, query)`：按周期与复权分发到 `readDailyRaw` / `readAdjustedDaily` / `readDerivedPeriods` / `readAdjustedPeriodKline`，统一映射为 `MarketKlineBar[]`，周/月以 `periodEndDate` 为 `tradeDate`，派生表缺失涨跌字段时按相邻周期收盘价补齐
- [x] 2.3 新增或扩展单测覆盖：不复权日线直读已存储涨跌字段、前/后复权日线逐日因子、因子缺失返回空、周/月派生以周期结束日为日期、周/月首根涨跌为 `null`、完整历史升序与空结果
- [x] 2.4 在 `electron/index.ts` 注册 `market:kline:query`，使用 `handleValidated` 调用 `readMarketKline`，查询异常不吞错

## 3. 预加载暴露

- [x] 3.1 在 `preload/index.ts` 的 `marketDataAPI` 增加 `queryKline: (query) => ipcRenderer.invoke('market:kline:query', query)`，与 `MarketDataAPI` 类型一致

## 4. 页面与导航

- [x] 4.1 在 `src/composables/useNavigation.ts` 的 `ViewId` 增加 `'market-kline'`，并提供选中的 K 线股票代码状态与带代码跳转方法
- [x] 4.2 在 `src/App.vue` 的 `viewComponents` 注册 `MarketKlineView`
- [x] 4.3 在 `src/components/SideNav.vue` 的 `navItems` 中于「股票列表」之后插入「K线查看」入口
- [x] 4.4 新建 `src/views/MarketKlineView.vue`：顶部证券搜索（300ms 防抖、下拉选股、请求序号防竞态）、代码/名称展示、周期按钮（日/周/月，默认日）、复权按钮（不复权/前复权/后复权，默认前复权）
- [x] 4.5 页面把 `MarketKlineBar[]` 映射为 `KlineData[]` 并调用 `useKlineChart.setData`，Canvas 绑定 `mousedown`/`mousemove`/`mouseup`/`mouseleave`/`wheel`，复用现有 tooltip 模板（日期/开高低收/涨跌额/涨跌幅、`null` 显示 `—`、证券类型精度与涨跌着色）
- [x] 4.6 页面实现加载中/空数据/查询失败三种状态与底部操作提示「滚轮缩放 | 拖动平移」，有数据时才显示提示

## 5. 名录跳转

- [x] 5.1 在 `src/views/SecuritiesDirectoryView.vue` 每行操作列增加「查看K线」按钮，调用带代码跳转方法进入 `market-kline` 页面
- [x] 5.2 `MarketKlineView.vue` 监听选中代码变化，进入页面时自动搜索或按代码选中并加载默认周期/复权 K 线

## 6. 验证

- [x] 6.1 `npm run test` 通过，新增用例覆盖 `market-kline-query` 规格中的全部 scenario
- [x] 6.2 `npm run typecheck` 通过
- [x] 6.3 `npm run lint` 通过
- [x] 6.4 `openspec validate add-market-kline-view --strict` 通过
- [x] 6.5 手工验证：侧边栏入口、搜索选股、日/周/月与三种复权切换、滚轮缩放、拖动平移、悬停 tooltip、快速切换无竞态、空数据与失败状态、从股票列表跳转，以及既有自选股 K 线弹窗不回退
