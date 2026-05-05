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

### 4. 持仓数据实时查询机制

**Decision**: 通过Electron IPC从主进程查询持仓数据，每次计算盈利时重新获取

**Rationale**:
- 规范要求FR-011：实时查询确俜数据准确性
- Electron架构中，持仓数据可能在主进程管理
- IPC通信是Electron标准的进程间通信方式
- 参考现有代码`electron/services/priceFetcher.ts`的模式

**Implementation approach**:
```typescript
// Renderer process (Vue组件)
const currentHoldings = await window.api.getCurrentHoldingsTotal();

// Main process (electron/index.ts)
ipcMain.handle('get-current-holdings-total', async () => {
  // 从持仓系统获取最新总市值
  return calculateTotalHoldingsValue();
});
```

**Error handling**:
- 查询失败时显示错误提示（FR-011a）
- 引导用户检查持仓系统状态
- 不缓存旧数据，避免误导

**Alternatives considered**:
- 定时刷新缓存：可能导致数据不一致
- 用户手动输入：操作繁琐，易出错

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

### 6. 盈利计算公式验证

**Decision**: 严格遵循规范公式：盈利 = 转出金额 - 转入金额 + 当前持仓金额

**Rationale**:
- 规范FR-007明确定义的计算公式
- 业务逻辑清晰：转出（资金离开）- 转入（资金进入）+ 当前持仓价值
- 正值表示盈利，负值表示亏损

**Example calculation**:
```
假设时间段内：
- 转入总额：10,000元（追加投资）
- 转出总额：2,000元（提取收益）
- 当前持仓市值：15,000元

盈利 = 2,000 - 10,000 + 15,000 = 7,000元
```

**Edge cases handled**:
- 无转账记录：盈利 = 0 - 0 + 当前持仓 = 当前持仓
- 无持仓数据：显示"无持仓数据"提示
- 查询失败：显示错误提示

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
    transferRecords: [],      // 转账记录列表
    profitStats: null,        // 盈利统计结果
    loading: false,           // 加载状态
    error: null              // 错误信息
  }),
  actions: {
    async fetchTransferRecords(page, limit),
    async addTransferRecord(record),
    async updateTransferRecord(id, data),
    async deleteTransferRecord(id),
    async calculateProfit(startDate, endDate)
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
  type: 'IN' | 'OUT';     // 枚举值
  createdAt?: string;
  updatedAt?: string;
}

export interface ProfitStatistics {
  startDate: string;
  endDate: string;
  totalIn: number;
  totalOut: number;
  currentHoldings: number;
  profit: number;
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
- 调用现有持仓服务获取总市值
- 可能需要扩展`position.ts` store或创建新的IPC handler

### 3. 数据库迁移
- 在应用启动时检查并创建`transfer_records`表
- 参考`database.ts`中的表初始化逻辑

---

## Risk Assessment

### Low Risk
- 无限滚动实现：成熟的技术方案
- 模态对话框：Vue 3标准功能
- 日期选择器：HTML5原生支持

### Medium Risk
- 持仓数据实时查询：需要了解现有持仓系统的接口
- 数据库表扩展：需要确保不影响现有表结构

### Mitigation Strategies
- 先调研现有持仓服务的实现方式
- 数据库操作前备份现有数据
- 充分的边界情况测试

---

## Open Questions (Resolved)

✅ All NEEDS CLARIFICATION items from Technical Context have been resolved through this research phase.
