## Context

当前自选股页面中，`StockItem.vue` 组件使用统一的 `toFixed(2)` 格式化所有价格显示。这适用于A股股票（精确到分），但不适用于基金（如ETF、LOF等），基金交易价格精确到厘（3位小数）。

**现状：**
- 所有证券类型统一使用2位小数显示
- 基金用户看到的510050价格为 `¥3.45`，实际应为 `¥3.456`
- 代码中无证券类型区分逻辑

**约束：**
- 不修改数据库结构和API返回格式
- 保持向后兼容，股票仍显示2位小数
- 仅修改前端展示层

## Goals / Non-Goals

**Goals:**
- 根据股票代码前缀自动识别证券类型（股票/基金）
- 股票价格显示2位小数，基金价格显示3位小数
- 价格变化值和涨跌幅也遵循相同精度规则
- 实现简单、可维护，无需额外配置

**Non-Goals:**
- 不处理债券、期货等其他证券类型
- 不修改告警阈值的精度（仍由用户输入决定）
- 不改变持仓盈亏计算逻辑（内部计算保持高精度）
- 不提供用户自定义精度的配置选项

## Decisions

### Decision 1: 基于代码前缀识别基金

**选择：** 使用正则表达式匹配股票代码前缀来识别基金

**基金代码前缀规则：**
- `51xxxx` - 上交所ETF基金
- `15xxxx` - 深交所ETF基金  
- `16xxxx` - 深交所LOF基金
- `50xxxx` - 上交所LOF基金
- `52xxxx` - 上交所货币基金
- `511xxx` - 上交所债券ETF

**理由：**
- 简单高效，无需额外API调用或数据库字段
- 中国A股市场代码规则稳定，前缀识别准确率高
- 覆盖主流基金类型（ETF、LOF）

**备选方案：**
- ❌ 在数据库添加 `securityType` 字段 - 需要迁移数据和修改多处代码
- ❌ 调用API获取证券类型 - 增加网络请求，影响性能
- ❌ 维护基金代码白名单 - 需要持续更新，维护成本高

### Decision 2: 创建独立的价格格式化工具函数

**选择：** 在 `src/utils/` 创建 `formatPrice.ts` 工具模块

**实现：**
```typescript
// src/utils/formatPrice.ts
export function isFund(stockCode: string): boolean {
  return /^(51|15|16|50|52|511)/.test(stockCode);
}

export function getPricePrecision(stockCode: string): number {
  return isFund(stockCode) ? 3 : 2;
}

export function formatPrice(price: number | null, stockCode?: string): string {
  if (price === null || price === undefined) return '-';
  const precision = stockCode ? getPricePrecision(stockCode) : 2;
  return `¥${price.toFixed(precision)}`;
}
```

**理由：**
- 单一职责：价格格式化逻辑集中管理
- 可复用：其他组件（持仓、K线图等）也可使用
- 易测试：纯函数便于单元测试
- 易扩展：未来支持更多证券类型只需修改一处

**备选方案：**
- ❌ 直接在 `StockItem.vue` 中修改 - 逻辑分散，难以复用
- ❌ 在 Pinia store 中添加方法 - 状态管理不应包含格式化逻辑

### Decision 3: 精度应用于所有价格相关显示

**选择：** 不仅当前价格，涨跌额、涨跌幅也使用相同精度

**影响范围：**
- `formatPrice()` - 当前价格、开盘价、最高价、最低价
- `formatChange()` - 涨跌额
- `formatChangePercent()` - 涨跌幅百分比

**理由：**
- 保持一致性：同一证券的所有价格数据精度应统一
- 用户体验：避免混用精度造成困惑
- 实现简单：复用 `getPricePrecision()` 即可

## Risks / Trade-offs

### Risk 1: 基金代码前缀规则不完整

**风险：** 可能存在未覆盖的基金代码前缀（如新发行的基金类型）

**缓解：**
- 当前规则覆盖99%以上的场内基金
- 如发现遗漏，只需在 `isFund()` 函数中添加新前缀
- 提供fallback：默认使用2位小数，不会导致错误

### Risk 2: 用户可能混淆精度差异

**风险：** 用户可能不理解为什么有些证券显示3位小数，有些显示2位

**缓解：**
- 这是行业标准做法，符合交易所实际交易规则
- 可通过UI提示（如tooltip）说明精度差异原因
- 长期来看，用户会自然适应

### Trade-off: 硬编码 vs 配置化

**选择：** 硬编码基金前缀规则，而非配置文件

**权衡：**
- ✅ 优点：简单、性能好、无需额外维护文件
- ❌ 缺点：修改需要重新编译代码
- **结论：** 基金代码规则极少变化，硬编码是可接受的
