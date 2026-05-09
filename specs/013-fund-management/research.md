# Research: 资金管理功能

**Date**: 2026-05-03  
**Feature**: 013-fund-management

## Technical Decisions & Rationale

### 1. 数据库表结构设计

**Decision**: 在现有SQLite数据库中创建`transfer_records`表

**Rationale**: 
- 项目已使用sql.js作为本地数据库（见`electron/database.ts`）
- 转账记录需要持久化存储，适合关系型数据库
- 与现有的持仓数据、网格策略数据存储方式保持一致

**Schema Design**:
```sql
CREATE TABLE transfer_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_date TEXT NOT NULL,      -- YYYY-MM-DD格式
  amount REAL NOT NULL,             -- 正数金额
  type TEXT NOT NULL,               -- 'IN' (转入) 或 'OUT' (转出)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transfer_date ON transfer_records(transfer_date DESC);
```

**Alternatives considered**:
- JSON文件存储：不适合频繁查询和排序操作
- IndexedDB：Electron环境中sql.js更成熟且与现有代码一致

---

### 2. 无限滚动实现方案

**Decision**: 使用Vue 3组合式函数 +  Intersection Observer API实现无限滚动

**Rationale**:
- Vue 3原生支持组合式函数，符合项目技术栈
- Intersection Observer API性能优于scroll事件监听
- 无需引入第三方库，减少依赖
- 与项目现有的 composables 模式一致（见`src/composables/`）

**Implementation approach**:
```typescript
// useInfiniteScroll.ts composable
- 维护当前页码、加载状态、是否有更多数据
- 使用Intersection Observer监听底部触发元素
- 每次加载20条记录（按规范FR-012a）
- 支持重置和刷新功能
```

**Alternatives considered**:
- 第三方库（vue-infinite-loading）：增加依赖，功能过剩
- 分页按钮：用户体验不如无限滚动流畅
- 虚拟滚动：对于1000条记录来说过度优化

---

### 3. 模态对话框实现

**Decision**: 创建可复用的Modal组件，通过Teleport挂载到body

**Rationale**:
- Vue 3提供Teleport API，适合模态对话框场景
- 避免z-index层级问题
- 可复用性强，未来其他功能也可使用
- 符合Vue 3最佳实践

**Implementation approach**:
```vue
<!-- Modal.vue 基础组件 -->
<Teleport to="body">
  <div class="modal-overlay" @click="close">
    <div class="modal-content" @click.stop>
      <slot />
    </div>
  </div>
</Teleport>
```

**Alternatives considered**:
- 内联对话框：可能有z-index和样式隔离问题
- 第三方UI库：项目未使用UI库，保持一致性更重要

---

### 4. 持仓市值计算机制

**Decision**: 通过kline_data表获取各持股在指定日期的收盘价，结合持仓数量计算持仓市值

**Rationale**:
- 规范要求FR-011：从kline_data表中获取各持股收盘价计算持仓市值
- kline_data表已存储所有自选股的日K线数据，包含收盘价(close)字段
- 需要同时计算期初和期末两个时间点的持仓市值
- 对于缺失日期的K线数据，使用距离该日期最近的前一个交易日的收盘价

**Implementation approach**:
```typescript
// Main process (electron/services/fundService.ts)
async getHoldingsMarketValue(date: string) {
  // 1. 获取所有持仓股票代码和数量
  const holdings = getHoldings();
  
  // 2. 对每只持股，从kline_data获取指定日期的收盘价
  for (const holding of holdings) {
    const kline = db.exec(`
      SELECT close FROM kline_data 
      WHERE stock_code = ? AND trade_date <= ? 
      ORDER BY trade_date DESC LIMIT 1
    `, [holding.stockCode, date]);
    
    marketValue += kline.close * holding.holdingCount;
  }
  
  return marketValue;
}
```

**Error handling**:
- 查询kline_data失败时显示错误提示（FR-011a）
- 无K线数据时提示"无K线数据"并跳过该持股
- 引导用户检查K线数据下载状态

---

### 5. 日期范围选择器实现

**Decision**: 使用原生HTML5 date input + 自定义样式

**Rationale**:
- 无需引入第三方日期选择器库
- HTML5 date input在所有现代浏览器中受支持
- Electron基于Chromium，完全支持
- 保持轻量级，减少依赖

**Implementation approach**:
```vue
<input type="date" v-model="startDate" :max="endDate" />
<input type="date" v-model="endDate" :min="startDate" />
```

**Validation**:
- 开始日期不能晚于结束日期
- 两个日期都为必填项
- 显示清晰的错误提示

**Alternatives considered**:
- 第三方库（element-plus, ant-design-vue）：项目未使用UI框架
- 自定义日历组件：开发成本高，必要性低

---

### 6. 盈亏计算公式验证

**Decision**: 严格遵循规范公式：盈亏金额=(期末账户余额+期末持仓市值)-(期初账户余额+期初持仓市值)+(转出金额-转入金额)

**Rationale**:
- 规范FR-007明确定义的计算公式
- 业务逻辑清晰：盈亏=资产变化+净流出，其中资产变化=(期末资产-期初资产)，净流出=(转出-转入)
- 正值表示盈利，负值表示亏损
- 数据来源明确：账户余额来自transfer_records表，持仓市值来自kline_data表，转入转出来自trade_record表

**Data Source Mapping**:
- 期初账户余额: transfer_records表中截止期初日期最近一条记录的account_balance
- 期末账户余额: transfer_records表中截止期末日期最近一条记录的account_balance
- 期初持仓市值: kline_data各持股在期初日期收盘价×持仓数量之和
- 期末持仓市值: kline_data各持股在期末日期收盘价×持仓数量之和
- 转入金额: trade_record表中BUY类型交易总金额（买入金额+手续费）
- 转出金额: trade_record表中SELL类型交易总金额（卖出金额-手续费-印花税）

**Example calculation**:
```
假设时间段：2026-01-01 至 2026-05-06
期初账户余额：8,000元
期末账户余额：5,000元
期初持仓市值：12,000元
期末持仓市值：15,000元
转入金额（BUY交易）：50,000元
转出金额（SELL交易）：45,000元

盈亏 = (5,000 + 15,000) - (8,000 + 12,000) + (45,000 - 50,000)
     = 20,000 - 20,000 + (-5,000)
     = -5,000元（亏损5,000元）
```

**Edge cases handled**:
- 无资金明细记录：期初/期末账户余额均为0
- 无K线数据：提示"无K线数据"，跳过该持股
- 无trade_record记录：转入/转出金额均为0
- 某只持股没有对应日期K线数据：使用最近前一个交易日收盘价

---

### 7. Pinia Store设计

**Decision**: 创建独立的fundManagement store管理资金管理状态

**Rationale**:
- 项目已使用Pinia作为状态管理（见`package.json`）
- 现有store模式：watchlist.ts, position.ts等
- 独立store便于维护和测试
- 符合单一职责原则

**Store structure**:
```typescript
// stores/fundManagement.ts
export const useFundManagementStore = defineStore('fundManagement', {
  state: () => ({
    transferRecords: [],           // 资金明细记录列表
    profitStats: null,             // 盈亏统计结果
    openingAccountBalance: 0,      // 期初账户余额
    closingAccountBalance: 0,      // 期末账户余额
    openingHoldingsValue: 0,       // 期初持仓市值
    closingHoldingsValue: 0,       // 期末持仓市值
    loading: false,                // 加载状态
    error: null                   // 错误信息
  }),
  actions: {
    async fetchTransferRecords(page, limit),
    async addTransferRecord(record),
    async updateTransferRecord(id, data),
    async deleteTransferRecord(id),
    async calculateProfit(startDate, endDate),
    async fetchHoldingsMarketValue(date),
    async fetchTradeStatsInRange(startDate, endDate)
  }
});
```

**Alternatives considered**:
- 组件内部state：无法跨组件共享状态
- Vuex：项目已迁移到Pinia

---

### 8. 类型定义位置

**Decision**: 在`shared/types/index.ts`中扩展TransferRecord接口

**Rationale**:
- 项目已有`shared/types/index.ts`用于共享类型
- 前端和Electron主进程都需要使用这些类型
- 保证类型一致性，避免重复定义
- 参考现有类型定义模式（见`types.ts`）

**Type definition**:
```typescript
export interface TransferRecord {
  id: number;
  transferDate: string;    // YYYY-MM-DD
  amount: number;          // 正数
  type: 'IN' | 'OUT' | 'DIVIDEND' | 'DIVIDEND_TAX' | 'STOCK_BUY' | 'STOCK_SELL' | 'INTEREST';
  accountBalance: number;  // 自动计算
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfitStatistics {
  startDate: string;               // YYYY-MM-DD (期初)
  endDate: string;                 // YYYY-MM-DD (期末)
  openingAccountBalance: number;   // 期初账户余额
  closingAccountBalance: number;   // 期末账户余额
  openingHoldingsValue: number;    // 期初持仓市值
  closingHoldingsValue: number;    // 期末持仓市值
  totalIn: number;                 // 转入总金额 (trade_record BUY)
  totalOut: number;                // 转出总金额 (trade_record SELL)
  profit: number;                  // 盈亏金额
}
```

---

## Best Practices Identified

### Vue 3 Composition API
- 使用`<script setup>`语法
- 组合式函数封装可复用逻辑
- 响应式数据使用`ref`和`reactive`

### Electron IPC Communication
- 使用`ipcMain.handle`和`ipcRenderer.invoke`模式
- 错误处理统一在主进程进行
- 类型安全的IPC调用（通过preload脚本暴露API）

### Database Operations
- 所有数据库操作在主进程执行
- 使用参数化查询防止SQL注入
- 事务处理确保数据一致性

### Performance Optimization
- 无限滚动避免一次性加载大量数据
- 数据库索引优化查询性能
- 防抖处理用户输入（日期选择器等）

---

## Integration Points

### 1. 与现有导航系统集成
- 在侧边栏添加"资金管理"菜单项
- 参考`SideNav.vue`和`useNavigation.ts`的实现

### 2. 与持仓系统交互
- 从kline_data表获取各持股在指定日期的收盘价
- 从持仓系统获取各持股的持仓数量
- 结合收盘价和持仓数量计算期初/期末持仓市值

### 3. 与交易记录系统交互
- 从trade_record表获取指定时间段内的交易记录
- 统计BUY类型交易总金额作为转入金额
- 统计SELL类型交易总金额作为转出金额

### 4. 数据库迁移
- 在应用启动时检查并创建`transfer_records`表
- 参考`database.ts`中的表初始化逻辑

---

## Risk Assessment

### Low Risk
- 无限滚动实现：成熟的技术方案
- 模态对话框：Vue 3标准功能
- 日期选择器：HTML5原生支持

### Medium Risk
- kline_data数据查询：需要确保K线数据已下载且日期覆盖范围足够
- trade_record数据查询：需要正确计算手续费和印花税
- 数据库表扩展：需要确保不影响现有表结构

### Mitigation Strategies
- 先调研现有kline_data表的数据覆盖范围
- 先调研现有trade_record表的结构和手续费计算逻辑
- 数据库操作前备份现有数据
- 充分的边界情况测试

---

## Open Questions (Resolved)

✅ All NEEDS CLARIFICATION items from Technical Context have been resolved through this research phase.
