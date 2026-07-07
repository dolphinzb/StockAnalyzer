# Fix: Profit Chart Data Not Refreshing on Page Re-entry

## Problem

当前系统的盈亏统计页面中，年度盈亏/月度盈亏柱状图的数据只在第一次进入页面时计算和加载。当用户切出页面后再切回时，图表不会重新请求 API 获取最新数据，而是直接使用 store 中的缓存数据。

这导致以下问题：
1. **数据不实时**：如果用户在切出页面期间进行了交易操作、资金变动，或股票价格更新，切回页面时看到的仍然是旧数据
2. **当前年度/月度盈亏金额不准确**：柱状图中显示的当前年度和当前月度的盈亏金额可能已过时

## Root Cause

在 `src/components/ProfitChart.vue` 的 `loadAnnualChart()` 和 `loadMonthlyChart()` 方法中存在缓存检查逻辑（第82行和第128行）：

```typescript
// 如果已有数据，直接绘制，不再请求
if (store.annualProfitData && store.annualProfitData.length > 0) {
  console.log('[ProfitChart] 使用缓存的年度数据绘制图表');
  // ... 直接使用缓存数据
  return;
}
```

这个逻辑的设计初衷是为了避免重复请求，但忽略了以下场景：
- Vue 组件的生命周期：当用户切换到其他标签页时，`ProfitStatistics` 和 `ProfitChart` 组件会被卸载（`onBeforeUnmount`），切回时会重新挂载（`onMounted`）
- Pinia store 的状态持久化：虽然组件被卸载，但 store 中的数据仍然保留
- 结果：重新挂载时检测到 store 中有数据，直接使用缓存，不重新请求 API

## Fix Goal

移除 `ProfitChart.vue` 中的缓存检查逻辑，确保每次组件挂载（即每次进入盈亏统计页面）时都重新请求 API 获取最新的年度和月度盈亏数据。

### Expected Behavior

- ✅ 每次进入盈亏统计页面时，年度和月度图表都会重新请求 API
- ✅ 显示的数据总是最新的，反映当前的账户余额、持仓市值和交易记录
- ✅ 用户体验：看到的数据是实时的，不会因为缓存而显示过时信息

### Trade-offs

- ⚠️ 会增加 API 请求次数（每次进入页面都会请求）
- ⚠️ 如果 API 响应较慢，可能会有短暂的加载延迟
- ✅ 但对于盈亏统计这种关键数据，实时性比性能更重要
