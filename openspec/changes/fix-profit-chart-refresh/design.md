# Design: Remove Cache Check in ProfitChart

## Overview

这是一个简单的 bug 修复，只需要修改一个文件：`src/components/ProfitChart.vue`。

## Solution

移除 `loadAnnualChart()` 和 `loadMonthlyChart()` 方法中的缓存检查逻辑，让每次调用都直接请求 API。

### Changes Required

**File**: `src/components/ProfitChart.vue`

**Method 1**: `loadAnnualChart()` (约第79-120行)

**Before**:
```typescript
const loadAnnualChart = async () => {
  try {
    // 如果已有数据，直接绘制，不再请求
    if (store.annualProfitData && store.annualProfitData.length > 0) {
      console.log('[ProfitChart] 使用缓存的年度数据绘制图表');
      const data = store.annualProfitData.map(item => ({
        label: String(item.year),
        value: item.profit,
      }));
      annualChart.drawChart(data, {
        title: '年度盈亏',
        colorPositive: '#ef4444',
        colorNegative: '#10b981',
      });
      return;
    }

    console.log('[ProfitChart] 开始加载年度图表数据...');
    await store.fetchAnnualProfitData();
    // ... 后续代码
  }
};
```

**After**:
```typescript
const loadAnnualChart = async () => {
  try {
    console.log('[ProfitChart] 开始加载年度图表数据...');
    await store.fetchAnnualProfitData();
    
    if (!store.annualProfitData || store.annualProfitData.length === 0) {
      console.warn('[ProfitChart] 年度数据为空，无法绘制图表');
      return;
    }
    
    const data = store.annualProfitData.map(item => ({
      label: String(item.year),
      value: item.profit,
    }));

    console.log('[ProfitChart] 年度图表数据:', data);
    annualChart.drawChart(data, {
      title: '年度盈亏',
      colorPositive: '#ef4444',
      colorNegative: '#10b981',
    });
    console.log('[ProfitChart] 年度图表绘制完成');
  } catch (error) {
    console.error('[ProfitChart] 加载年度图表失败:', error);
  }
};
```

**Method 2**: `loadMonthlyChart()` (约第125-166行)

同样的修改：移除开头的缓存检查逻辑（第128-140行），直接调用 `store.fetchMonthlyProfitData()`。

## Impact Analysis

### Files Changed
- ✅ `src/components/ProfitChart.vue` - 唯一需要修改的文件

### No Breaking Changes
- API 接口不变
- 数据结构不变
- 用户界面不变
- 只是改变了数据加载的时机

### Performance Consideration
- 每次进入页面会增加 2 次 API 请求（年度 + 月度）
- 但这两个 API 本身就很轻量（只返回统计数据，不涉及大量数据传输）
- 对于盈亏统计这种关键业务数据，实时性优先于性能优化

## Testing Strategy

1. **手动测试**：
   - 进入盈亏统计页面，观察图表加载
   - 切换到其他标签页
   - 切回盈亏统计页面，验证图表重新加载
   - 在控制台查看日志，确认每次都调用了 API

2. **数据验证**：
   - 修改一些交易记录或资金明细
   - 切换页面后，验证图表数据是否更新
