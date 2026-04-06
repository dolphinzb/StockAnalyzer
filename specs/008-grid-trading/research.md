# Research: 网格交易计算

**Created**: 2026-04-06
**Feature**: 008-grid-trading

## 1. 网格交易计算公式

### 1.1 交易计算公式

**目标持仓金额** = 总金额 × 50%

**目标持仓数量** = 目标持仓金额 / 当前股价

**调整股数** = 目标持仓数量 - 当前持仓数量

**偏差百分比** = (当前持仓数量 - 目标持仓数量) / 目标持仓数量 × 100%

**当前持仓金额** = 当前持仓数量 × 持仓均价

**持仓市值** = 当前持仓数量 × 当前股价

**浮动盈亏** = 持仓市值 - 当前持仓金额

**浮动盈亏率** = 浮动盈亏 / 当前持仓金额 × 100%

### 1.2 开仓计算公式

**开仓金额** = 总金额 × 50%

**建议买入股数** = Math.floor(开仓金额 / 开仓股价 / 100) × 100

**手数** = 建议买入股数 / 100

**预计花费** = 建议买入股数 × 开仓股价

**剩余资金** = 总金额 - 开仓金额

## 2. 决策记录

### 2.1 计算位置

**Decision**: 客户端直接计算，无需 IPC 调用

**Rationale**: 网格计算逻辑简单（主要是数学运算），不涉及数据库写入，无需主进程参与。

**Alternatives considered**:
- 主进程计算：增加 IPC 开销，不必要
- 后端 API：项目无后端，桌面应用

### 2.2 持仓数据来源

**Decision**: 从 trade_record 表查询 holding_count > 0 的记录

**Rationale**: 与 007-position-page 保持一致，复用现有数据源

**Alternatives considered**:
- 独立 position 表：增加数据冗余
- 实时 API：增加外部依赖

### 2.3 偏差阈值

**Decision**: ±10%

**Rationale**: 参考 GridPosition.vue 实现，是网格交易的常见阈值

## 3. 参考实现分析

### 3.1 GridPosition.vue 核心计算逻辑

```typescript
// 交易计算
const calculate = async () => {
  const params = {
    totalAmount: parseFloat(form.totalAmount),
    currentPrice: parseFloat(form.currentPrice),
    currentHoldingCount: parseInt(form.currentHoldingCount),
    averageHoldingPrice: parseFloat(form.averageHoldingPrice)
  }
  // 调用 API 计算
  const data = await calculatePosition(params)
  result.value = data.data || data
}

// 开仓计算（客户端直接计算）
const calculateOpen = () => {
  const totalAmount = parseFloat(openForm.totalAmount)
  const openPrice = parseFloat(openForm.openPrice)

  const openAmount = totalAmount * 0.5
  const buyCount = Math.floor(openAmount / openPrice / 100) * 100

  openResult.value = {
    openAmount,
    buyCount
  }
}
```

### 3.2 显示逻辑

- 盈亏为正：红色 (#F56C6C)
- 盈亏为负：绿色 (#67C23A)
- 偏差 > 10% 或 < -10%：警告标签
- 调整建议卡片样式根据操作类型变化

## 4. 结论

所有计算公式和研究已完成，无遗留问题。
