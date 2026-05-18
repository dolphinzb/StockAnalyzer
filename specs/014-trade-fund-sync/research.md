# Research: 交易记录新增时自动同步资金明细

**Date**: 2026-05-07  
**Feature**: 014-trade-fund-sync

## Technical Decisions & Rationale

### 1. 同步逻辑的放置位置

**Decision**: 在 `database.ts` 的 `addTradeRecord` 函数中，交易记录保存成功后调用同步函数

**Rationale**:
- `addTradeRecord` 是所有新增交易记录的唯一入口（通过IPC `position:add-record` 调用）
- 在此处拦截可以确保所有新增操作都会触发同步
- 交易记录保存成功后再同步，满足"同步失败不阻止交易记录保存"的需求(FR-005)
- 复用现有的 `FundService.addTransferRecord` 方法，避免重复实现余额计算逻辑

**Implementation approach**:
```typescript
// database.ts - addTradeRecord 函数末尾
export function addTradeRecord(input: AddTradeInput): TradeRecord {
  // ... 现有的保存逻辑 ...
  
  // 交易记录保存成功后，自动同步到资金明细
  try {
    syncTradeToFundRecord(newRecord);
  } catch (error) {
    log.error('同步资金明细失败:', error);
    // 不抛出异常，交易记录已保存成功
  }
  
  return newRecord;
}
```

**Alternatives considered**:
- 在IPC handler层调用：需要修改index.ts，且难以保证原子性
- 在前端store层调用：需要两次IPC调用，增加失败风险
- 使用事件监听：过度设计，增加复杂度

---

### 2. 手续费计算复用策略

**Decision**: 直接复用 `tradeService.ts` 中已有的手续费计算常量和逻辑，在同步函数中内联计算

**Rationale**:
- 现有 `calcHoldingPrice` 函数内部已包含完整的手续费计算逻辑（佣金、过户费、印花税）
- 已有常量：`TRADE_FEE_RATE`（万三）、`MIN_FEE`（5元）、`TRANSFER_FEE_RATE`（过户费）、`SHENZHEN_STAMP_TAX_RATE`、`SHANGHAI_STAMP_TAX_RATE`
- 已有函数：`getExchange()` 判断交易所
- STOCK_BUY金额 = 买入金额 + 手续费 + 过户费；STOCK_SELL金额 = 卖出金额 - 手续费 - 印花税 - 过户费
- 直接使用现有常量和 `getExchange` 函数计算即可，无需新建独立函数

**Implementation approach**:
```typescript
// 在同步函数中直接使用 tradeService 已有的常量和函数
import { getExchange, TRADE_FEE_RATE, MIN_FEE, TRANSFER_FEE_RATE, SHANGHAI_STAMP_TAX_RATE, SHENZHEN_STAMP_TAX_RATE } from './services/tradeService';

function calcStockBuyAmount(tradePrice: number, tradeCount: number, stockCode: string): number {
  const exchange = getExchange(stockCode);
  const tradeFee = Math.max(tradeCount * tradePrice * TRADE_FEE_RATE, MIN_FEE);
  const transferFee = tradeCount * tradePrice * TRANSFER_FEE_RATE;
  const tradeAmount = tradeCount * tradePrice;
  
  let totalFee = tradeFee;
  if (exchange === 'SHENZHEN') {
    totalFee += huaTaiFee;
  }
  return tradeAmount + totalFee;
}

function calcStockSellAmount(tradePrice: number, tradeCount: number, stockCode: string): number {
  const exchange = getExchange(stockCode);
  const tradeFee = Math.max(tradeCount * tradePrice * TRADE_FEE_RATE, MIN_FEE);
  const transferFee = tradeCount * tradePrice * TRANSFER_FEE_RATE;
  const tradeAmount = tradeCount * tradePrice;
  const stampTax = tradeAmount * (exchange === 'SHENZHEN' ? SHENZHEN_STAMP_TAX_RATE : SHANGHAI_STAMP_TAX_RATE);
  
  let totalFee = tradeFee + stampTax;
  if (exchange === 'SHENZHEN') {
    totalFee += huaTaiFee;
  } else if (exchange === 'SHANGHAI') {
    totalFee += huaTaiFee;
  }
  return tradeAmount - totalFee;
}
```

**Alternatives considered**:
- 新建calcTradeFees函数：逻辑与calcHoldingPrice重复，增加维护成本
- 修改calcHoldingPrice返回费用明细：会改变现有函数签名，影响面大

---

### 3. FIFO股息税计算算法

**Decision**: 在 `tradeService.ts` 中新增 `calcDividendTax` 函数，实现FIFO逐批计算

**Rationale**:
- Spec要求按FIFO逐批计算各买入批次的股息税(FR-003b/003c/003d)
- 需要从trade_record表中构建买入批次队列
- 每个批次独立匹配持股期间的股息事件
- 所有批次税额汇总为一条DIVIDEND_TAX记录

**Algorithm**:
```
1. 获取该股票所有交易记录（按日期升序）
2. 构建买入批次队列（FIFO），遇到卖出时消耗队列前端
3. 将本次卖出数量拆分到各批次
4. 对每个卖出批次：
   a. 计算持股天数 = 卖出日期 - 批次买入日期
   b. 确定税率：≤30天20%, 30~365天10%, >365天0%
   c. 查找该批次持股期间内的股息事件
   d. 计算该批次股息税 = 股息金额 × 持股比例 × 税率
5. 汇总所有批次股息税
```

**Implementation approach**:
```typescript
// tradeService.ts
export interface BuyBatch {
  /** 批次剩余股数 */
  remainingCount: number;
  /** 买入日期 */
  purchaseDate: string;
}

export interface DividendEvent {
  /** 股息日期 */
  dividendDate: string;
  /** 每股股息 */
  perShareAmount: number;
  /** 当时的持股数量 */
  holdingCount: number;
}

export function calcDividendTax(
  stockCode: string,
  sellDate: string,
  sellCount: number,
  allTrades: TradeRecord[]
): number {
  // 1. 构建FIFO批次队列
  // 2. 拆分卖出数量到各批次
  // 3. 逐批计算股息税
  // 4. 汇总返回
}
```

**Key considerations**:
- 持股天数计算：卖出日期 - 买入日期，临界点按较低税率
- 股息事件匹配：只匹配买入日期之后、卖出日期之前（含）的股息
- 每股股息计算：trade_record中DIVIDEND类型的tradePrice即为每股股息
- 空批次处理：如果FIFO队列为空（数据异常），返回0

**Alternatives considered**:
- 简单方案（最早买入日算起）：不够准确，跨税率临界点时误差大
- 加权平均：不是A股实际规则

---

### 4. 同步失败处理策略

**Decision**: 使用try-catch包裹同步逻辑，失败时通过IPC返回同步状态，前端显示Toast通知

**Rationale**:
- Spec FR-005要求同步失败不阻止交易记录保存
- Toast通知是非阻塞式的，不打断用户操作流程
- 需要修改addTradeRecord的返回值，增加同步状态信息

**Implementation approach**:
```typescript
// 修改AddTradeRecord的返回值
export interface AddTradeResult {
  /** 交易记录 */
  record: TradeRecord;
  /** 资金明细同步是否成功 */
  fundSyncSuccess: boolean;
  /** 同步失败原因（如果失败） */
  fundSyncError?: string;
}

// database.ts
export function addTradeRecord(input: AddTradeInput): AddTradeResult {
  // 保存交易记录（现有逻辑）
  const record = ...;
  
  // 尝试同步
  let fundSyncSuccess = true;
  let fundSyncError: string | undefined;
  try {
    syncTradeToFundRecord(record);
  } catch (error) {
    fundSyncSuccess = false;
    fundSyncError = error instanceof Error ? error.message : '未知错误';
    log.error('同步资金明细失败:', error);
  }
  
  return { record, fundSyncSuccess, fundSyncError };
}
```

**Alternatives considered**:
- 返回布尔值：信息不够，无法显示具体失败原因
- 抛出异常：违反FR-005要求
- 静默失败：用户不知道同步失败，可能导致数据不一致

---

### 5. 卖出次日日期计算

**Decision**: 实现简单的次日日期计算，不考虑交易日历

**Rationale**:
- A股交易日历复杂，需要外部数据源
- 个人记账工具精度要求不高
- 简单的+1天计算已足够，用户可以手动调整

**Implementation approach**:
```typescript
function getNextDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + 1);
  return date.toISOString().split('T')[0];
}
```

**Alternatives considered**:
- 集成交易日历API：过度设计，增加外部依赖
- 跳过周末：逻辑复杂且不准确（还有节假日）

---

### 6. FundService实例获取方式

**Decision**: 在database.ts中通过全局fundService实例调用addTransferRecord

**Rationale**:
- fundService在index.ts的app.whenReady中初始化
- database.ts中的getDb()可以获取数据库实例
- 但FundService封装了余额计算和级联更新逻辑，直接复用更安全

**Implementation approach**:
- 在index.ts中暴露getFundService()方法
- 或者在database.ts中直接使用FundService实例
- 最简方案：在addTradeRecord的IPC handler中调用同步，而非在database.ts中

**最终决策**: 在IPC handler层（index.ts的`position:add-record`）中，交易记录保存成功后调用fundService.addTransferRecord。这样：
1. 不修改database.ts的函数签名
2. fundService已在index.ts中可用
3. 保持关注点分离

**Alternatives considered**:
- 在database.ts中调用：需要获取fundService实例，增加耦合
- 在前端store中调用：需要两次IPC，增加复杂度

---

## Best Practices Identified

### 错误处理
- 同步失败不阻塞主流程
- 使用Toast通知而非模态弹窗
- 日志记录同步失败详情

### 代码复用
- 复用FundService.addTransferRecord（余额自动计算和级联更新）
- 提取calcTradeFees函数（手续费计算复用）
- FIFO算法独立为纯函数（便于测试）

### 数据一致性
- 交易记录和资金明细在同一数据库中
- FundService的余额级联更新确保数据正确

## Integration Points

### 1. 与现有IPC handler集成
- 修改`position:add-record` handler，在保存交易记录后调用同步逻辑
- 无需新增IPC通道

### 2. 与FundService集成
- 调用`fundService.addTransferRecord`创建资金明细
- 复用余额计算和级联更新逻辑

### 3. 与前端组件集成
- 修改PositionItem.vue，处理同步失败时的Toast通知

## Risk Assessment

### Low Risk
- 手续费计算：逻辑已在tradeService中验证
- FundService调用：已有成熟实现
- Toast通知：简单的UI交互

### Medium Risk
- FIFO算法：需要仔细处理批次消耗和股息匹配
- 返回值变更：需要同步修改前端和preload

### Mitigation Strategies
- FIFO算法编写单元测试覆盖各种场景
- 返回值变更时仔细检查类型定义和preload脚本

## Open Questions (Resolved)

✅ All NEEDS CLARIFICATION items from Technical Context have been resolved through this research phase.
