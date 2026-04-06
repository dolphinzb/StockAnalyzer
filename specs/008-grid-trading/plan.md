# Implementation Plan: 网格交易计算页面

**Branch**: `008-grid-trading` | **Date**: 2026-04-06 | **Spec**: [spec.md](file:///c:/WebProjects/StockAnalyzer/specs/008-grid-trading/spec.md)
**Input**: 功能点参照 GridPosition.vue，技术框架和实现与现有项目保持一致

## Summary

实现网格交易计算页面，包含两个核心功能：
1. **交易计算**：计算当前持仓与网格策略的偏差，提供买入/卖出调整建议
2. **开仓计算**：计算首次建仓时建议买入的股票数量

网格交易策略核心原则是保持半仓（50%持仓，50%现金），偏差超过±10%时触发调仓提醒。

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia, sql.js
**Storage**: SQLite (sql.js) - 从 trade_record 表读取持仓数据
**UI Framework**: 使用项目现有的自定义组件（不使用 Element Plus）
**Message System**: useToast composable
**Testing**: 手动测试
**Target Platform**: Windows (Electron 桌面应用)
**Project Type**: desktop-app
**Performance Goals**: 计算响应时间少于500ms
**Constraints**: 功能点完全参照 GridPosition.vue，技术框架与现有项目一致

## Constitution Check

GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.

- [x] 项目类型为桌面应用，技术栈已确定
- [x] 数据存储使用现有 SQLite，无需引入新数据库
- [x] 使用 Vue 3 + TypeScript，与现有项目一致
- [x] 无需新增外部 API 依赖
- [x] 使用现有 useToast composable 显示消息
- [x] 不使用 Element Plus，使用自定义组件

## Project Structure

### Documentation (this feature)

```text
specs/008-grid-trading/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── views/
│   └── GridView.vue          # 网格交易页面主组件
├── components/
│   └── (复用现有组件)
├── stores/
│   └── gridStore.ts          # 网格计算状态管理（可选，简单逻辑可不用store）
└── types.ts                  # 类型定义

electron/
├── services/
│   └── gridService.ts        # 网格计算服务
├── database.ts               # 数据库操作
└── index.ts                 # IPC 处理器
```

**Structure Decision**: 复用现有项目结构，在 src/views 创建 GridView.vue，网格计算逻辑放在 electron/services/gridService.ts 中。

## Complexity Tracking

无需复杂度跟踪，所有决策已确定。

## Implementation Phases

### Phase 0: Research

**研究内容**：

1. **网格交易计算公式研究**
   - 目标持仓金额 = 总金额 × 50%
   - 目标持仓数量 = 目标持仓金额 / 当前股价
   - 调整股数 = 目标持仓数量 - 当前持仓数量
   - 偏差百分比 = (当前持仓数量 - 目标持仓数量) / 目标持仓数量 × 100%
   - 手数 = 调整股数 / 100（向下取整到100的倍数）

2. **浮动盈亏计算**
   - 当前持仓市值 = 当前持仓数量 × 当前股价
   - 持仓成本 = 当前持仓数量 × 持仓均价
   - 浮动盈亏 = 当前持仓市值 - 持仓成本
   - 浮动盈亏率 = 浮动盈亏 / 持仓成本 × 100%

### Phase 1: Design & Contracts

**数据模型**：

```typescript
// 持仓股票类型（从 trade_record 表聚合）
interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;   // 持仓数量
  holdingPrice: number;   // 持仓均价
}

// 交易计算结果
interface PositionResult {
  currentPositionAmount: number;  // 当前持仓金额 = holdingCount × holdingPrice
  targetPosition: number;         // 目标持仓数量 = (totalAmount × 50%) / currentPrice
  targetPositionAmount: number;    // 目标持仓金额 = totalAmount × 50%
  adjustAmount: number;            // 调整股数（正为买入，负为卖出）
  deviationPercent: number;        // 偏差百分比
}

// 开仓计算结果
interface OpenResult {
  openAmount: number;    // 开仓金额 = totalAmount × 50%
  buyCount: number;      // 建议买入股数（100的倍数）
}

// 交易计算输入
interface CalculatePositionInput {
  totalAmount: number;           // 总金额
  currentPrice: number;          // 当前股价
  currentHoldingCount: number;   // 当前持仓数量
  averageHoldingPrice: number;   // 持仓均价
}

// 开仓计算输入
interface CalculateOpenInput {
  totalAmount: number;    // 总金额
  openPrice: number;      // 开仓股价
}
```

**网格计算常量**：

```typescript
const GRID_TARGET_RATIO = 0.5;      // 目标持仓比例 50%
const GRID_DEVIATION_THRESHOLD = 10; // 偏差阈值 ±10%
const MIN_TRADE_UNIT = 100;         // 最小交易单位 100股
```

**IPC 通道定义**（如需与主进程通信）：

| 通道名 | 方向 | 描述 |
|--------|------|------|
| `grid:get-position-list` | renderer→main | 获取持仓列表（从 trade_record 聚合） |
| `grid:calculate-position` | renderer→main | 计算持仓偏差（可选，客户端计算时不需要） |

**注意**: 由于计算逻辑简单，本功能可以在渲染进程直接完成计算，无需 IPC 调用。

## Validation

**Plan Quality Checklist**:
- [x] Technical Context fully specified
- [x] Constitution Check passed
- [x] Research completed and findings documented
- [x] Data model defined with TypeScript interfaces
- [x] Project structure documented
- [x] No unresolved NEEDS CLARIFICATION markers

**Status**: Ready for Phase 2 (Task Generation)
