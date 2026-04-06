# Feature Specification: 网格交易计算页面

**Feature Branch**: `008-grid-trading`
**Created**: 2026-04-06
**Status**: Draft
**Input**: User description: "实现网格交易计算页面，该页面功能完全参照 c:\WebProjects\StockAnalyzer\docs\GridPosition.vue"

## Clarifications

### Session 2026-04-06

- Q: API 合约定义 → A: 桌面程序无后端，所有计算逻辑在客户端完成
- Q: 持仓数据来源 → A: 从 trade_record 表查询 holding_count > 0 的记录
- Q: 消息提示方案 → A: 使用现有项目的 useToast composable，保持一致性
- Q: UI 组件库选择 → A: 使用项目现有的自定义组件，不使用 Element Plus
- Q: 技术框架 → A: 功能点参照 GridPosition.vue，技术框架和实现与现有项目保持一致

---

## User Scenarios & Testing

### User Story 1 - 交易计算功能 (Priority: P1)

作为用户，我需要进行网格交易持仓计算，以便了解当前持仓是否偏离网格策略，并获得调整建议。

**Why this priority**: 这是网格交易页面的核心功能

**Acceptance Scenarios**:

1. **Given** 用户已打开网格交易页面并切换到"交易计算"标签，**When** 页面加载完成，**Then** 应显示交易计算表单，包含：选择持仓股票、总金额、当前股价、当前持仓数量、持仓均价
2. **Given** 用户已打开交易计算表单，**When** 用户从下拉列表选择一只持仓股票，**Then** 系统应自动填充该股票的当前持仓数量和持仓均价
3. **Given** 用户已填写所有字段并点击"计算"按钮，**Then** 系统应在客户端计算并显示：当前持仓、目标持仓、需要买入/卖出的股数、浮动盈亏、偏差百分比
4. **Given** 计算结果显示偏差超过±10%，**When** 系统显示操作建议提示，**Then** 应显示：当前偏差状态、建议操作（买入/卖出）、预计金额、操作后持仓金额、操作后可用资金、调整后占比

---

### User Story 2 - 开仓计算功能 (Priority: P1)

作为用户，我需要进行网格交易开仓计算，以便了解首次建仓时应该买入多少股票。

**Why this priority**: 开仓计算是网格交易入场时的核心功能

**Acceptance Scenarios**:

1. **Given** 用户已打开网格交易页面并切换到"开仓计算"标签，**When** 页面加载完成，**Then** 应显示开仓计算表单，包含：总金额、开仓股价
2. **Given** 用户已填写所有字段并点击"计算"按钮，**Then** 系统应计算并显示：总资金、开仓金额（50%）、建议买入数量（100股整数倍）、预计花费、剩余资金
3. **Given** 计算结果显示开仓建议，**When** 提示展示，**Then** 应显示：建议买入数量和手数、预计花费、持仓金额和可用资金（各占50%）、持仓成本

---

### User Story 3 - 重置功能 (Priority: P1)

作为用户，我需要能够重置表单，以便清除输入数据重新开始计算。

**Acceptance Scenarios**:

1. **Given** 用户已填写交易计算表单，**When** 用户点击"重置"按钮，**Then** 所有表单字段应被清空，计算结果应被隐藏
2. **Given** 用户已填写开仓计算表单，**When** 用户点击"重置"按钮，**Then** 所有表单字段应被清空，计算结果应被隐藏

---

### User Story 4 - 持仓股票选择 (Priority: P1)

作为用户，我需要从下拉列表选择持仓股票，以便自动填充持仓数据。

**Acceptance Scenarios**:

1. **Given** 用户已打开交易计算表单，**When** 用户点击"选择持仓股票"下拉框，**Then** 应显示所有当前持仓股票列表，每项显示股票名称和股票代码
2. **Given** 用户选择了某只股票，**When** 选择成功，**Then** 系统应自动填充当前持仓数量和持仓均价，并显示成功提示"已自动填充 {股票名称} 的持仓信息"
3. **Given** 用户已选择股票，**When** 用户清空选择，**Then** 当前持仓数量和持仓均价字段应被清空，但总金额和当前股价字段应保留

---

## Requirements

### Functional Requirements

- **FR-001**: 系统 MUST 显示"交易计算"和"开仓计算"两个标签页
- **FR-002**: 交易计算表单 MUST 包含字段：选择持仓股票（下拉框）、总金额、当前股价、当前持仓数量、持仓均价
- **FR-003**: 系统 MUST 从本地数据库获取当前持仓列表（holding_count > 0）填充下拉框
- **FR-004**: 用户选择持仓股票后，系统 MUST 自动填充该股票的当前持仓数量和持仓均价
- **FR-005**: 用户点击"计算"按钮后，系统 MUST 在客户端计算持仓偏差并返回结果
- **FR-006**: 系统 MUST 显示计算结果，包含：当前持仓（股数、均价、金额）、目标持仓（股数、现价、金额）、调整建议（买/卖股数、金额、手数）
- **FR-007**: 系统 MUST 显示详细描述信息，包含：总资金、可用资金、持仓市值、持仓成本、浮动盈亏（带颜色）、偏差百分比（带标签）
- **FR-008**: 当偏差超过±10%时，系统 MUST 显示警告提示，提供具体调整建议
- **FR-009**: 当偏差在±10%以内时，系统 MUST 显示成功提示，表示持仓状态良好
- **FR-010**: 开仓计算 MUST 按总金额50%计算开仓金额，买入数量向下取整到100的倍数
- **FR-011**: 用户 MUST 能够重置表单，清空所有输入和输出
- **FR-012**: 当用户输入无效数据时，系统 MUST 使用 useToast 显示警告提示，表单验证失败时不提交计算
- **FR-013**: 计算过程中出现异常时，系统 MUST 使用 useToast 显示错误提示

### Display Requirements

- **DR-001**: 盈亏金额和盈亏比例为正数（盈利）时显示红色（#F56C6C），为负数（亏损）时显示绿色（#67C23A）
- **DR-002**: 偏差百分比超过±10%时显示警告标签，否则显示成功标签
- **DR-003**: 调整建议卡片根据操作类型显示不同样式：买入时adjust-buy、卖出时adjust-sell、无需调整时adjust-none
- **DR-004**: 每个标签页内的指标使用卡片展示，3列布局

### Data Display

- **DD-001**: 所有金额保留2位小数
- **DD-002**: 手数 = 股数 / 100
- **DD-003**: 浮动盈亏率 = 浮动盈亏 / 持仓成本 * 100

## Key Entities

### 持仓股票 (Position)

| 属性 | 类型 | 说明 |
|------|------|------|
| stockCode | string | 股票代码 |
| stockName | string | 股票名称 |
| holdingCount | number | 持仓数量 |
| holdingPrice | number | 持仓均价 |

### 交易计算结果 (PositionResult)

| 属性 | 类型 | 说明 |
|------|------|------|
| currentPositionAmount | number | 当前持仓金额 |
| targetPosition | number | 目标持仓股数 |
| targetPositionAmount | number | 目标持仓金额 |
| adjustAmount | number | 调整股数（正为买入，负为卖出） |
| deviationPercent | number | 偏差百分比 |

### 开仓计算结果 (OpenResult)

| 属性 | 类型 | 说明 |
|------|------|------|
| openAmount | number | 开仓金额（总金额的50%） |
| buyCount | number | 建议买入股数（100的倍数） |

## Display Conventions

- **盈亏颜色**: 盈亏为正数时显示红色，为负数时显示绿色
- **调整操作**: 买入显示红色背景adjust-buy，卖出显示绿色背景adjust-sell
- **偏差标签**: 超出±10%显示警告样式，在范围内显示成功样式

## Success Criteria

### Measurable Outcomes

- **SC-001**: 用户可在2秒内完成交易计算并看到结果
- **SC-002**: 用户可在2秒内完成开仓计算并看到结果
- **SC-003**: 选择持仓股票后，数据填充时间少于500ms
- **SC-004**: 重置按钮可在500ms内清空所有表单和结果

## Assumptions

- 网格交易策略核心原则是保持半仓（50%持仓，50%现金）
- 偏差阈值设定为±10%，超过时需要调仓
- 买入和卖出数量必须是100股的整数倍
- 持仓列表从 trade_record 表查询 holding_count > 0 的记录
