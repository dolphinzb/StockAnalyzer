# Research: 资金统计标签页技术实现

**Date**: 2026-05-09  
**Feature**: 016-fund-statistics

## Decision 1: 饼图绘制实现方案

**Context**: 现有 `useProfitChart.ts` composable 仅支持柱状图绘制，需要扩展以支持饼图。

### Decision
扩展现有 `useProfitChart.ts` composable，新增 `drawPieChart` 方法，复用Canvas上下文管理和高分辨率屏幕处理逻辑。

### Rationale
- 保持技术栈一致性，避免引入新的图表库
- 复用现有的Canvas初始化、DPR处理、resize逻辑
- 与项目中现有的 ProfitChart.vue 组件保持一致
- 最小化代码变更，降低维护成本

### Alternatives Considered
1. **引入第三方图表库（如ECharts、Chart.js）**
   - 优点：功能丰富，开箱即用
   - 缺点：增加包体积，与项目现有技术栈不一致，学习成本高
   - 拒绝原因：项目已有Canvas绘制基础，无需引入重型依赖

2. **创建独立的 usePieChart composable**
   - 优点：职责分离清晰
   - 缺点：代码重复，DPR处理和resize逻辑需要复制
   - 拒绝原因：与现有架构不一致，增加维护负担

### Implementation Approach
在 `useProfitChart.ts` 中新增：
```typescript
const drawPieChart = (
  data: Array<{ label: string; value: number; color: string }>,
  options: { showLabels?: boolean; showPercentages?: boolean } = {}
) => {
  // 计算总价值
  // 计算每个扇区的角度
  // 绘制扇区（使用 arc 方法）
  // 可选：绘制标签和百分比
  // 设置鼠标事件监听（tooltip）
}
```

---

## Decision 2: 月度数据聚合策略

**Context**: 需要从三个表（transfer_records, trade_records, kline_data）获取过去60个月的账户余额和持仓市值。

### Decision
采用分步查询 + 应用层聚合的策略：
1. 首先获取所有相关的 transfer_records 记录（按日期分组）
2. 获取所有相关的 trade_records 记录（按日期分组，取每条记录的 holdingCount）
3. 批量查询 kline_data（按股票+日期）
4. 在应用层按月聚合数据

### Rationale
- SQLite不支持复杂的窗口函数和递归CTE（或支持有限）
- 应用层聚合更灵活，便于处理缺失数据（使用前值填充）
- 可以充分利用索引优化单个表的查询
- 便于调试和测试

### Alternatives Considered
1. **纯SQL聚合（使用复杂JOIN和子查询）**
   - 优点：数据库层面完成所有计算
   - 缺点：SQL复杂度高，难以维护，性能可能不如预期
   - 拒绝原因：60个月×多只股票的笛卡尔积可能导致性能问题

2. **预计算月度汇总表**
   - 优点：查询速度快
   - 缺点：需要额外的存储和维护逻辑，数据实时性差
   - 拒绝原因：用户量小（单用户），实时计算性能可接受

### SQL Query Strategy
```sql
-- 1. 获取transfer_records（过去60个月）
SELECT transferDate, accountBalance 
FROM transfer_records 
WHERE transferDate >= date('now', '-60 months')
ORDER BY transferDate DESC;

-- 2. 获取trade_records（过去60个月，每只股票最后一条记录）
SELECT stockCode, stockName, tradeDate, holdingCount
FROM trade_records t1
WHERE tradeDate >= date('now', '-60 months')
  AND tradeDate = (
    SELECT MAX(t2.tradeDate) 
    FROM trade_records t2 
    WHERE t2.stockCode = t1.stockCode 
      AND t2.tradeDate <= target_month_end_date
  )
GROUP BY stockCode;

-- 3. 批量查询kline_data
SELECT stockCode, date, closePrice
FROM kline_data
WHERE stockCode IN (...) 
  AND date IN (...);
```

### Performance Optimization
- 为 `transfer_records.transferDate` 添加索引
- 为 `trade_records(stockCode, tradeDate)` 添加复合索引
- 为 `kline_data(stockCode, date)` 添加复合索引
- 批量查询kline_data时，一次性获取所有需要的数据，避免N+1查询

---

## Decision 3: 缺失数据处理策略

**Context**: 某些月份可能没有transfer_records记录或kline_data数据。

### Decision
采用"前值填充"（Forward Fill）策略：
- 如果某月没有transfer_records记录，使用该月之前最近一个月的account_balance
- 如果某月某股票没有kline_data，使用该股票之前最近一个交易日的closePrice
- 如果完全没有历史数据，该月数据点不显示或使用0值

### Rationale
- 符合金融数据展示的常规做法
- 保证折线图的连续性，避免断点
- 实现简单，易于理解

### Implementation
```typescript
// 伪代码
for each month in past 60 months:
  accountBalance = getLatestBalanceBefore(month.end_date)
  holdings = getLatestHoldingsBefore(month.end_date)
  
  for each holding in holdings:
    closePrice = getLatestClosePriceBefore(holding.stockCode, month.end_date)
    marketValue += closePrice * holding.holdingCount
  
  monthlyData.push({
    month: month.label,
    accountBalance: accountBalance || previousAccountBalance,
    marketValue: marketValue || previousMarketValue
  })
```

---

## Decision 4: Tooltip交互实现

**Context**: 饼图和折线图都需要支持鼠标悬停显示tooltip。

### Decision
复用现有 `useProfitChart.ts` 中的 `setupMouseEvents` 和 `tooltipInfo` 机制，为饼图和折线图分别实现命中检测逻辑。

### Rationale
- 现有实现已验证可行（ProfitChart.vue中使用）
- 统一的tooltip样式和行为
- 减少重复代码

### Implementation Details
**折线图**：
- 存储每个数据点的(x, y)坐标
- 鼠标移动时检测是否在数据点附近（±5px范围）
- 显示包含月份、账户余额、持仓金额、总资产的tooltip

**饼图**：
- 存储每个扇区的起始角度和结束角度
- 鼠标移动时计算相对于圆心的角度
- 检测角度落在哪个扇区内
- 显示包含标签、数值、百分比的tooltip

---

## Decision 5: 数据加载时机

**Context**: 规范要求页面进入时自动加载数据，无需手动刷新。

### Decision
在 FundStatistics.vue 组件的 `onMounted` 生命周期钩子中触发数据加载。

### Rationale
- Vue 3标准做法
- 确保DOM已挂载，Canvas元素可用
- 与现有组件（如ProfitStatistics.vue）保持一致

### Implementation
```typescript
onMounted(async () => {
  await loadFundOverview();  // 加载当前资金概览
  await loadMonthlyTrend();  // 加载60个月趋势数据
});
```

---

## Summary of Technical Decisions

| Decision | Choice | Key Reason |
|----------|--------|------------|
| 饼图绘制 | 扩展useProfitChart | 复用现有Canvas逻辑，保持一致性 |
| 数据聚合 | 分步查询+应用层聚合 | 灵活性高，易于维护和优化 |
| 缺失数据 | 前值填充 | 符合金融数据惯例，保证连续性 |
| Tooltip | 复用现有机制 | 统一交互体验，减少重复代码 |
| 加载时机 | onMounted钩子 | Vue 3标准做法，确保DOM就绪 |

## Next Steps

1. ✅ Technical Context 已填充
2. ✅ Constitution Check 已通过
3. ✅ Research 完成，所有 NEEDS CLARIFICATION 已解决
4. ⏭️ 进入 Phase 1: Design & Contracts
   - 生成 data-model.md
   - 定义接口契约（如需要）
   - 生成 quickstart.md
