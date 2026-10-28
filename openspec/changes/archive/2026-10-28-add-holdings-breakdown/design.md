## Context

资金管理页面的「资金统计」标签由 `FundStatistics.vue` 渲染，通过 Pinia `fundManagement` store 调用 `window.fundManagementAPI.getFundOverview()`，IPC 通道 `fund:getFundOverview` 由 `electron/index.ts` 转发到 `fundService.getFundOverview()`。

当前实现中，`getFundOverview()` 已经遍历每只当前持仓（`trade_record` 中每只标的最近一条记录且 `holding_count > 0`），逐只查询 `kline_data` 最新收盘价并累加总市值，但**只返回汇总值**，逐只数据在循环结束后被丢弃。因此本次改动不需要新增查询，只需在既有循环中收集明细并扩展返回结构。

格式化能力已存在：
- `src/utils/formatPrice.ts` 的 `formatPrice(price, stockCode)` 自动按股票 2 位/基金 3 位小数格式化价格
- `FundStatistics.vue` 内已有 `formatAmount()` 提供千分位金额格式化

约束：遵循项目分层，渲染进程不得直接访问数据库；类型统一在 `shared/types/index.ts` 定义；注释使用中文。

## Goals / Non-Goals

**Goals:**
- `fund:getFundOverview` 一次返回汇总 + 逐只持仓明细，避免额外 IPC 与重复查询
- 「资产分布」饼图细化为「账户余额 + 每只有行情数据的持仓标的」，右侧「持仓明细」表格展示每只标的的市值与占比（降序）
- 饼图扇区与表格行使用同一套颜色映射，保证左右视觉对应
- 缺失行情数据的标的降级展示并明确提示不计入总市值
- 占比计算逻辑独立为纯函数，便于单元测试

**Non-Goals:**
- 不新增独立 IPC 通道（如 `fund:getHoldingsDetail`）
- 不展示持仓成本、盈亏、成本价等本次需求之外的字段
- 不改变持仓总市值、总资产的计算口径（仍只累加有行情数据的标的）
- 不把饼图改为纯持仓分布：账户余额仍作为一个独立扇区参与「资产分布」

## Decisions

### 决策 1：扩展 `getFundOverview` 返回值，而非新增接口

在 `getFundOverview()` 现有的持仓循环中收集每只标的的明细，随汇总一起返回。

- 理由：现有循环已完成「查持仓 → 查最新收盘价 → 累加市值」，明细数据触手可及；新增接口会重复执行同一批 SQL，且前端需要串联两个异步请求。
- 备选方案：调用已有的 `getHoldingsMarketValue(today)`（它已返回 `details`）。该方法的日期边界语义（`trade_date <= 目标日期`）与概览的「取最新收盘价、不看日期上限」略有差异，且需要额外一次查询，故不采用。
- 兼容性：`FundOverview` 仅新增字段，现有调用方（store / `FundStatistics.vue`）无需改动即可继续工作。

### 决策 2：类型定义

在 `shared/types/index.ts` 新增明细项类型，并将其挂到 `FundOverview`：

```ts
export interface HoldingMarketDetail {
  stockCode: string;
  stockName: string;
  holdingCount: number;
  closePrice: number;
  marketValue: number;
  hasKlineData: boolean;
}

export interface FundOverview {
  currentAccountBalance: number;
  currentHoldingsMarketValue: number;
  totalAssets: number;
  holdings: HoldingMarketDetail[];
}
```

- 无行情数据时 `closePrice` 记为 0、`marketValue` 记为 0、`hasKlineData` 为 false，前端据此展示「—」。
- `currentHoldingsMarketValue` 仍等于所有 `hasKlineData=true` 明细的市值之和，保证与现有口径一致。

### 决策 3：占比计算与颜色映射下沉为纯函数

新增 `src/utils/holdings.ts`，导出 `buildHoldingsRows(holdings, totalAssets)`：

- 按 `marketValue` 降序排序；市值相同按 `stockCode` 升序，保证顺序稳定
- 计算 `percentage = hasKlineData && totalAssets > 0 ? marketValue / totalAssets * 100 : null`（缺少行情数据或总资产为 0 时返回 null，展示层显示「—」）
- 按排序顺序从 `HOLDINGS_COLORS` 调色板循环取色，写入 `color`，保证饼图与表格颜色一一对应
- 返回行数据（含 `percentage`、`barWidth`、`color`），`barWidth` 限制在 0–100 用于进度条
- 占比保留两位小数在展示层处理（`percentage.toFixed(2)`），纯函数保留原始精度便于测试与复用

理由：饼图与表格必须共享同一份排序结果与颜色映射，集中到纯函数可避免两处逻辑漂移；项目规则要求纯工具函数放入 `utils/`，且该函数可脱离 Vue 组件做单元测试。备选方案是在 `FundStatistics.vue` 的 `computed` 内联计算，代码更少但难以测试且组件已较长。

### 决策 4：饼图与表格左右布局，内联在 `FundStatistics.vue` 的「资产分布」区块内

「资产分布」`chart-section` 内新增 `.distribution-layout` 弹性容器：左侧 `.pie-panel` 放现有 canvas，右侧 `.holdings-panel` 放「持仓明细」表格；窄屏（<1100px）自动换行为上下布局。

- 饼图数据在 `drawPieChart` 中由 `holdingsRows` 生成：账户余额一个扇区 + 每只 `marketValue > 0` 的标的各一个扇区；`marketValue = 0`（缺少行情数据）不绘制扇区。
- 原两分类图例删除，改由表格行的颜色圆点充当图例，避免与表格重复。
- 表格新增 scoped 样式（表头、右对齐数值列、占比进度条、缺失数据灰色「—」），高度受限并支持纵向滚动，避免标的较多时撑高页面。
- 收盘价展示复用 `formatPrice(closePrice, stockCode)`，金额展示复用现有 `formatAmount()`。
- 汇总行展示 `store.fundOverview.currentHoldingsMarketValue`，与上方卡片同源，天然一致。
- 缺失行情数据时在表格下方渲染提示文案（如「N 只标的因缺少行情数据未计入持仓总市值」）。

### 决策 5：空状态与加载态

- `holdings.length === 0` 时右侧显示「暂无持仓」提示，不渲染表头；饼图仅剩账户余额扇区（总资产为 0 时仍显示「暂无数据」）。
- 加载/错误态沿用 `FundStatistics.vue` 现有逻辑（整体区块已受 `isLoadingOverview` 控制），本次不新增状态。

## Risks / Trade-offs

- [持仓标的较多时表格过长] → 表格高度受限并纵向滚动，饼图高度保持不变。
- [占比按总资产计算，持仓占比合计通常小于 100%] → 饼图与表格口径统一，用户可直接对照；无行情数据的标的用「—」占位并在区块内提示未计入总市值。
- [饼图扇区过多导致标签拥挤] → 扇区内只绘制百分比；名称、金额通过左右对照表格与 tooltip 查看。
- [后端浮点误差导致汇总行与明细之和相差 0.01] → 后端单只市值与总计均 `toFixed(2)`，展示时直接使用后端汇总值，不做前端二次累加。
- [新增必填字段 `holdings` 可能影响其他构造 `FundOverview` 的代码] → 已确认项目中仅 store 与 `FundStatistics.vue` 消费该类型，无手工构造对象的调用点。

## Migration Plan

无数据库变更、无数据迁移。发布后直接读取既有 `trade_record` / `kline_data` 即可生效；回滚仅需还原代码，无数据副作用。

## Open Questions

无。
