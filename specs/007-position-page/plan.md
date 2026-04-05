# Implementation Plan: 持仓页面

**Branch**: `007-position-page` | **Date**: 2026-04-04 | **Spec**: [spec.md](file:///c:/WebProjects/StockAnalyzer/specs/007-position-page/spec.md)
**Input**: Feature specification from `/specs/007-position-page/spec.md`

## Summary

实现持仓页面功能，用户可以查看持仓列表、展开交易记录、新增交易记录。系统根据交易记录自动计算持仓均价和持仓数量。数据存储使用现有 SQLite 数据库（sql.js），交易记录查询支持只显示清仓后的记录。新增、编辑或删除交易记录后，系统自动刷新当前展开股票的交易记录列表，无需用户重新点击。

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Electron 28.x, Vue 3.4+, Pinia, sql.js, electron-builder
**Storage**: SQLite (sql.js) - 使用现有 trade_record 表
**Testing**: 手动测试
**Target Platform**: Windows (Electron 桌面应用)
**Project Type**: desktop-app
**Performance Goals**: 页面加载3秒内显示持仓列表
**Constraints**: 使用现有技术栈，与自选股页面保持一致

## Constitution Check

GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.

- [x] 项目类型为桌面应用，技术栈已确定
- [x] 数据存储使用现有 SQLite，无需引入新数据库
- [x] 使用 Vue 3 + TypeScript，与现有项目一致
- [x] 无需新增外部 API 依赖

## Project Structure

### Documentation (this feature)

```text
specs/007-position-page/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (if needed)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── views/
│   └── PositionView.vue      # 持仓页面主组件
├── components/
│   ├── PositionList.vue     # 持仓列表组件
│   ├── PositionItem.vue     # 持仓项组件
│   ├── TradeRecordList.vue  # 交易记录列表组件
│   ├── TradeRecordItem.vue  # 交易记录项组件
│   └── TradeEditor.vue      # 交易记录编辑组件
├── stores/
│   └── position.ts          # 持仓状态管理
└── types.ts                 # 类型定义

electron/
├── services/
│   └── tradeService.ts      # 交易记录服务（计算逻辑）
├── database.ts               # 数据库操作
├── preload.ts                # 预加载脚本
└── index.ts                 # IPC 处理器
```

**Structure Decision**: 复用现有项目结构，在 src/views 创建 PositionView.vue，在 electron/services 添加交易计算服务。

## Complexity Tracking

无需复杂度跟踪，所有决策已确定。

## Implementation Phases

### Phase 0: Research

**研究内容**：

1. **股票价格计算逻辑研究**
   - 交易费率常量定义
   - 买入/卖出/股息的不同计算公式
   - 交易所区分（上海/深圳/北京）
   - 保留三位小数的精度处理

2. **交易记录查询逻辑研究**
   - 如何查询某股票上次 holding_count 为 0 的记录
   - 如何查询该时间点之后的所有记录
   - 倒序排列实现

### Phase 1: Design & Contracts

**数据模型**：

```typescript
// 交易记录类型
interface TradeRecord {
  id: number;
  stockCode: string;
  stockName: string;
  tradeDate: string;      // ISO 格式，精确到秒
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradePrice: number;    // 交易价格
  tradeCount: number;    // 交易数量
  holdingCount: number;  // 持仓数量
  holdingPrice: number;  // 持仓均价
}

// 持仓股票类型（从交易记录聚合）
interface Position {
  stockCode: string;
  stockName: string;
  holdingCount: number;  // > 0
  holdingPrice: number;  // 当前持仓均价
}

// 更新交易记录输入类型
interface UpdateTradeInput {
  id: number;
  stockCode: string;
  stockName: string;
  tradeType: 'BUY' | 'SELL' | 'DIVIDEND';
  tradeDate: string;
  tradePrice: number;
  tradeCount: number;
}
```

**交易计算常量**：

```typescript
const TRADE_FEE_RATE = 0.0003;      // 交易费率 0.03%
const MIN_FEE = 5;                   // 最低手续费 5 元
const HUATAI_OTHER_FEE_RATE = 0.00002;  // 华泰其他费率 0.002%
const SHENZHEN_STAMP_TAX_RATE = 0.001;   // 深交所印花税率 0.1%
const SHANGHAI_STAMP_TAX_RATE = 0.001;   // 上交所印花税率 0.1%
```

**IPC 通道定义**：

| 通道名 | 方向 | 描述 |
|--------|------|------|
| `position:get-list` | renderer→main | 获取持仓列表 |
| `position:get-records` | renderer→main | 获取某股票交易记录 |
| `position:add-record` | renderer→main | 新增交易记录 |
| `position:update-record` | renderer→main | 更新交易记录 |
| `position:delete-record` | renderer→main | 删除交易记录 |
| `position:get-last-zero` | renderer→main | 获取上次清仓记录时间 |

## Validation

- [x] 技术栈与现有项目一致
- [x] 数据库使用现有 trade_record 表
- [x] 股票计算逻辑已从参考文件提取
- [x] 页面结构符合 UI 设计图

## Next Steps

1. 创建 research.md 研究文档
2. 创建 data-model.md 数据模型
3. 创建 quickstart.md 快速开始
4. 执行 `/speckit.tasks` 生成任务清单
5. 实现代码