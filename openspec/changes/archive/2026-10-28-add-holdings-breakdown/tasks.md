## 1. 类型与后端数据

- [x] 1.1 在 `shared/types/index.ts` 新增 `HoldingMarketDetail` 接口（stockCode、stockName、holdingCount、closePrice、marketValue、hasKlineData），并给 `FundOverview` 增加 `holdings: HoldingMarketDetail[]` 字段，补充中文 JSDoc
- [x] 1.2 修改 `electron/services/fundService.ts` 的 `getFundOverview()`：在既有持仓循环中收集明细；有行情数据时写入收盘价与 `marketValue`（两位小数），无行情数据时写入 `closePrice=0`、`marketValue=0`、`hasKlineData=false`，并更新返回类型注解与日志

## 2. 前端展示

- [x] 2.1 新增 `src/utils/holdings.ts`，实现 `buildHoldingsRows(holdings, totalAssets)`：按市值降序（同市值按代码升序）排序，计算 `percentage`（总资产为 0 时为 null）与限制在 0–100 的 `barWidth`，并按顺序从调色板分配与饼图共用的 `color`，补充中文注释
- [x] 2.2 改造 `src/components/FundStatistics.vue` 的「资产分布」区块：改为左饼图右表格的 `.distribution-layout`；饼图数据由 `holdingsRows` 生成（账户余额扇区 + 每只市值大于 0 的标的扇区，颜色一致），删除原两分类图例
- [x] 2.3 在饼图右侧实现「持仓明细」表格：表头（标的、持仓数量、最新价、持仓市值、占比）、逐行数据（颜色圆点 + 名称/代码）、占比进度条；价格用 `formatPrice(closePrice, stockCode)`，金额用现有 `formatAmount()`，占比保留两位小数并在总资产为 0 时显示「—」
- [x] 2.4 实现降级与空状态：`hasKlineData=false` 的行显示灰色「—」，并在表格下方提示未计入总市值的标的数量；`holdings` 为空时右侧显示「暂无持仓」，不渲染表格
- [x] 2.5 在表格底部增加汇总行展示 `store.fundOverview.currentHoldingsMarketValue`，并补充左右布局、表格、进度条、缺失值、汇总行的 scoped SCSS 样式（窄屏换行）

## 3. 测试与验证

- [x] 3.1 新增 `tests/unit/holdingsBreakdown.test.ts`，覆盖：按市值降序排序、占比计算（60%/40%）、总资产为 0 时占比为 null、同市值按代码升序、缺失行情数据行排在末尾、颜色按顺序稳定分配
- [x] 3.2 执行 `npm run typecheck` 与 `npm run lint`，修复新增代码的类型与规范问题
- [x] 3.3 执行 `npm test`，确认新增单测通过且既有测试无回归
- [x] 3.4 启动 `npm run dev` 手工验证：饼图扇区与表格行颜色/占比一致、表格市值与卡片一致、缺失行情数据提示正确、无持仓时空状态正常
