# Quickstart: 资金管理功能

**Date**: 2026-05-03  
**Feature**: 013-fund-management

## Overview

本指南帮助开发者快速理解和开发资金管理功能。该功能包含转账记录管理和盈利统计两个核心模块。

## Prerequisites

- Node.js >= 18
- npm >= 9
- 熟悉 Vue 3 Composition API
- 了解 Electron IPC 通信机制
- 基本的 SQL 知识

## Project Structure

```
specs/013-fund-management/
├── spec.md          # 功能规范文档
├── plan.md          # 实施计划
├── research.md      # 技术调研
├── data-model.md    # 数据模型
└── quickstart.md    # 本文件

src/
├── views/
│   └── FundManagementView.vue    # 主页面
├── components/
│   ├── TransferRecordList.vue    # 转账列表
│   ├── TransferRecordItem.vue    # 列表项
│   ├── TransferEditor.vue        # 编辑对话框
│   ├── ProfitStatistics.vue      # 盈利统计
│   └── DateRangePicker.vue       # 日期选择器
├── stores/
│   └── fundManagement.ts         # Pinia store
├── composables/
│   └── useFundManagement.ts      # 组合式函数
└── types.ts                      # 类型定义

electron/
├── database.ts                   # 数据库操作
└── services/
    └── fundService.ts            # Electron服务

shared/types/
└── index.ts                      # 共享类型
```

## Development Workflow

### 1. 数据库表初始化

在 `electron/database.ts` 中添加转账记录表的初始化逻辑：

```typescript
// 在现有的 initializeDatabase 函数中添加
function initializeTransferRecordsTable(db: Database) {
  const tableExists = db.exec(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='transfer_records'
  `);
  
  if (tableExists.length === 0) {
    db.run(`
      CREATE TABLE transfer_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        type TEXT NOT NULL CHECK(type IN ('IN', 'OUT')),
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
        updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
      )
    `);
    
    db.run(`CREATE INDEX idx_transfer_date_desc ON transfer_records(transfer_date DESC)`);
    db.run(`CREATE INDEX idx_transfer_type_date ON transfer_records(type, transfer_date)`);
  }
}
```

### 2. 定义类型

在 `shared/types/index.ts` 中添加：

```typescript
export interface TransferRecord {
  id: number;
  transferDate: string;
  amount: number;
  type: 'IN' | 'OUT';
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

### 3. 创建 Electron 服务

创建 `electron/services/fundService.ts`：

```typescript
import { Database } from 'sql.js';

export class FundService {
  constructor(private db: Database) {}

  async getTransferRecords(limit: number, offset: number) {
    const stmt = this.db.prepare(`
      SELECT * FROM transfer_records 
      ORDER BY transfer_date DESC 
      LIMIT :limit OFFSET :offset
    `);
    
    const result = stmt.getAsObject({ ':limit': limit, ':offset': offset });
    stmt.free();
    return result;
  }

  async addTransferRecord(record: { transferDate: string; amount: number; type: string }) {
    const stmt = this.db.prepare(`
      INSERT INTO transfer_records (transfer_date, amount, type) 
      VALUES (:transferDate, :amount, :type)
    `);
    
    stmt.run({
      ':transferDate': record.transferDate,
      ':amount': record.amount,
      ':type': record.type
    });
    stmt.free();
    
    return this.db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
  }

  // ... 其他方法
}
```

### 4. 注册 IPC Handlers

在 `electron/index.ts` 中：

```typescript
import { FundService } from './services/fundService';

const fundService = new FundService(db);

ipcMain.handle('get-transfer-records', async (_, limit, offset) => {
  return await fundService.getTransferRecords(limit, offset);
});

ipcMain.handle('add-transfer-record', async (_, record) => {
  return await fundService.addTransferRecord(record);
});

// ... 其他handlers
```

### 5. 创建 Pinia Store

创建 `src/stores/fundManagement.ts`：

```typescript
import { defineStore } from 'pinia';
import type { TransferRecord, ProfitStatistics } from '../../shared/types';

export const useFundManagementStore = defineStore('fundManagement', {
  state: () => ({
    transferRecords: [] as TransferRecord[],
    profitStats: null as ProfitStatistics | null,
    loading: false,
    error: null as string | null,
    hasMore: true,
    currentPage: 0,
    pageSize: 20
  }),
  
  actions: {
    async fetchTransferRecords(reset = false) {
      if (reset) {
        this.transferRecords = [];
        this.currentPage = 0;
        this.hasMore = true;
      }
      
      if (!this.hasMore || this.loading) return;
      
      this.loading = true;
      try {
        const records = await window.api.getTransferRecords(
          this.pageSize,
          this.currentPage * this.pageSize
        );
        
        if (records.length < this.pageSize) {
          this.hasMore = false;
        }
        
        this.transferRecords.push(...records);
        this.currentPage++;
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    
    async calculateProfit(startDate: string, endDate: string) {
      this.loading = true;
      try {
        // 获取转账统计数据
        const stats = await window.api.getProfitStatistics(startDate, endDate);
        
        // 获取当前持仓总额
        const currentHoldings = await window.api.getCurrentHoldingsTotal();
        
        this.profitStats = {
          ...stats,
          currentHoldings,
          profit: stats.totalOut - stats.totalIn + currentHoldings
        };
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    }
  }
});
```

### 6. 创建主视图组件

创建 `src/views/FundManagementView.vue`：

```vue
<template>
  <div class="fund-management">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="转账记录" name="transfers">
        <TransferRecordList />
      </el-tab-pane>
      <el-tab-pane label="盈利统计" name="profit">
        <ProfitStatistics />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TransferRecordList from '../components/TransferRecordList.vue';
import ProfitStatistics from '../components/ProfitStatistics.vue';

const activeTab = ref('transfers');
</script>
```

### 7. 添加到路由

在 `src/App.vue` 或路由配置中添加资金管理页面的路由。

## Key Implementation Details

### 无限滚动实现

使用 Intersection Observer API：

```typescript
// src/composables/useInfiniteScroll.ts
export function useInfiniteScroll(callback: () => Promise<void>) {
  const observer = ref<IntersectionObserver | null>(null);
  const loadMoreRef = ref<HTMLElement | null>(null);
  
  onMounted(() => {
    observer.value = new IntersectionObserver(async (entries) => {
      if (entries[0].isIntersecting) {
        await callback();
      }
    });
    
    if (loadMoreRef.value) {
      observer.value.observe(loadMoreRef.value);
    }
  });
  
  onUnmounted(() => {
    observer.value?.disconnect();
  });
  
  return { loadMoreRef };
}
```

### 模态对话框

使用 Teleport：

```vue
<!-- src/components/Modal.vue -->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-overlay" @click="$emit('update:modelValue', false)">
      <div class="modal-content" @click.stop>
        <slot />
      </div>
    </div>
  </Teleport>
</template>
```

## Testing

### 手动测试清单

1. **转账记录管理**
   - [ ] 页面加载时显示所有历史记录（按日期倒序）
   - [ ] 点击"新增转账"按钮打开编辑对话框
   - [ ] 填写表单并保存，新记录出现在列表顶部
   - [ ] 点击记录的编辑按钮，修改后保存
   - [ ] 点击删除按钮，确认后记录消失
   - [ ] 滚动到底部自动加载更多记录
   - [ ] 输入负数金额时显示错误提示

2. **盈利统计**
   - [ ] 首次进入显示提示信息
   - [ ] 选择日期范围后显示盈利结果
   - [ ] 修改日期范围实时更新结果
   - [ ] 无转账记录时显示正确结果
   - [ ] 持仓数据查询失败时显示错误提示

## Common Issues & Solutions

### Issue 1: 数据库表不存在

**Solution**: 确保在应用启动时调用了 `initializeTransferRecordsTable()`

### Issue 2: IPC 调用失败

**Solution**: 检查 `preload/index.ts` 是否正确暴露了API

### Issue 3: 无限滚动不触发

**Solution**: 确认 Intersection Observer 的 target 元素可见且有足够高度

### Issue 4: 类型错误

**Solution**: 运行 `npm run typecheck` 检查类型定义

## Resources

- [Vue 3 Documentation](https://vuejs.org/)
- [Pinia Documentation](https://pinia.vuejs.org/)
- [Electron IPC](https://www.electronjs.org/docs/latest/api/ipc-main)
- [sql.js Documentation](https://sql.js.org/)
- [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)

## Next Steps

1. 完成基础CRUD功能
2. 实现无限滚动
3. 实现盈利统计
4. 添加错误处理和边界情况处理
5. 优化性能和用户体验
6. 编写单元测试（如果项目配置了测试框架）
