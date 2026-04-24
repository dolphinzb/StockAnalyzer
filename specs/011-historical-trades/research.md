# Research: 历史开仓记录

**Feature**: 011-historical-trades
**Date**: 2026-04-23

## Technical Decisions

### 1. 交易周期识别算法

**Decision**: 在主进程服务中实现交易周期识别算法，通过遍历 `trade_record` 表识别开仓和清仓点。

**Rationale**: 
- 现有 `database.ts` 中已有 `getLastZeroTrade` 方法可查询 holding_count=0 的交易
- 需要扩展为遍历所有交易记录，识别完整的开仓-清仓周期
- 算法思路：按股票代码分组，按交易时间排序，遍历识别 holding_count 从 0 开始的买入（开仓）和 holding_count 变为 0 的卖出（清仓）

**Alternatives considered**:
- 在数据库层使用 SQL 查询直接识别周期：复杂度高，难以处理多周期场景
- 在前端计算：会增加渲染进程负担，不符合 Electron 架构最佳实践

### 2. 手续费计算方式

**Decision**: 使用规范定义的简化手续费计算公式，与现有 `calcHoldingPrice` 中的复杂费率计算分离。

**规范公式**:
- 买入单笔手续费 = MAX(成交金额 × 0.0005, 5元) + 成交金额 × 0.00001
- 卖出单笔手续费 = MAX(成交金额 × 0.0005, 5元) + 成交金额 × 0.00001 + 成交金额 × 0.0005

**Rationale**: 
- 现有 `tradeService.ts` 使用更复杂的费率计算（区分交易所、华泰其他费率等）
- 规范明确要求使用简化公式用于历史开仓记录统计
- 应创建独立的计算函数，不影响现有持仓计算逻辑

**Alternatives considered**:
- 复用现有 `calcHoldingPrice`：公式不同，会导致统计结果不一致
- 使用配置化费率：增加复杂度，当前需求明确使用固定公式

### 3. 数据获取与 IPC 通信

**Decision**: 复用现有 IPC 通信模式，新增 `historicalTradeAPI` 接口。

**Rationale**:
- 项目已有 `positionApi`、`stockWatcherAPI` 等 IPC 接口模式
- 遵循现有模式保持代码一致性
- 在 `electron/index.ts` 中注册新的 IPC 处理器

**Alternatives considered**:
- 扩展现有 `positionApi`：职责不同，混合会增加复杂度
- 使用新的通信机制：无必要，现有模式已满足需求

### 4. 前端状态管理

**Decision**: 使用 Pinia store 管理历史开仓记录状态，复用项目现有状态管理模式。

**Rationale**:
- 项目已使用 Pinia（`watchlist.ts`, `position.ts`）
- 历史交易数据适合集中管理，支持多组件共享
- 遵循现有 store 模式（如 `position.ts`）

**Alternatives considered**:
- 使用 composables 直接管理：适合简单场景，但历史交易数据可能被多组件使用
- 使用组件本地状态：不适合，数据需要在多个组件间共享

### 5. 类型定义位置

**Decision**: 历史交易相关类型定义在 `src/types.ts`（渲染进程使用）和 `shared/types/index.ts`（跨进程共享）。

**Rationale**:
- 项目规则要求"类型统一在 types.ts 文件中定义，需要共享的类型在 shared/types/index.ts 文件中定义"
- 历史开仓记录类型（如 `HistoricalTradeRecord`）需要在主进程和渲染进程间共享
- 计算输入/输出类型应放在 `shared/types/index.ts`

## Implementation Approach

### 主进程 (Electron)

1. **新增 `historicalTradeService.ts`**:
   - `identifyTradeCycles(stockCode: string): TradeCycle[]` - 识别交易周期
   - `calculateCycleStats(cycle: TradeCycle): HistoricalTradeRecord` - 计算周期统计
   - `calculateBuyFee(amount: number): number` - 计算买入手续费
   - `calculateSellFee(amount: number): number` - 计算卖出手续费
   - `getAllHistoricalTrades(): HistoricalTradeRecord[]` - 获取所有历史记录

2. **扩展 `database.ts`**:
   - `getAllTradeRecords(): TradeRecord[]` - 获取所有交易记录
   - `getTradeRecordsByStockCode(stockCode: string): TradeRecord[]` - 按股票代码查询

3. **注册 IPC 处理器**:
   - `historicalTrade:getAll` - 获取所有历史开仓记录
   - `historicalTrade:getCycleDetails` - 获取指定周期的交易明细

### 渲染进程 (Vue 3)

1. **新增 `HistoricalTradesView.vue`**: 主页面组件
2. **新增 `HistoricalTradeItem.vue`**: 单条历史记录项
3. **新增 `HistoricalTradeDetail.vue`**: 展开的交易明细
4. **新增 `useHistoricalTrades.ts`**: 数据获取组合式函数
5. **新增 `historicalTrades.ts` store**: 状态管理

## Performance Considerations

- 交易周期识别和计算在主进程完成，避免阻塞渲染进程
- 使用 `ipcRenderer.invoke` 异步获取数据
- 对于大量交易记录（>1000 条），考虑添加分页或虚拟滚动
- 当前预期数据量有限，无需复杂优化

## Edge Cases Handled

1. **股息交易**: 包含在周期边界内，但不计入买入/卖出统计
2. **多周期股票**: 每个开仓-清仓周期作为独立记录
3. **清仓后立即开仓**: 清仓后的任何买入都视为新周期开始
4. **无历史记录**: 显示空状态提示
5. **总买入金额为 0**: 避免除以零错误（盈利比例显示为 0%）
