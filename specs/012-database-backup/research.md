# 研究文档：数据库备份功能

**功能**: 012-database-backup  
**日期**: 2026-04-29  
**状态**: 已完成

## 概述

本文档记录了数据库备份功能的技术决策，包括自动备份（已实现）和手动备份（待实现）的关键设计选择。

---

## 决策 1: 备份调度机制

**问题**: 如何实现每天15:30的定时备份？

**决策**: 使用 `setTimeout` 精确计算延迟，而非 `setInterval` 轮询

**理由**:
- ✅ **零轮询开销** - 只在需要时触发，无每分钟检查的开销
- ✅ **更精确** - 在15:30:00准时执行，而不是15:30:00-15:30:59之间任意时刻
- ✅ **符合最佳实践** - 定时器应该精确调度，而非频繁检查

**实现**:
```typescript
function scheduleNextBackup(): void {
  const now = new Date();
  const target = new Date();
  target.setHours(15, 30, 0, 0);
  
  if (now >= target) {
    target.setDate(target.getDate() + 1); // 明天
  }
  
  const delay = target.getTime() - now.getTime();
  backupTimeout = setTimeout(() => {
    performBackup();
    scheduleNextBackup(); // 递归调度下一次
  }, delay);
}
```

**替代方案**:
- ❌ `setInterval` 每60秒检查 - 有轮询开销，精度低
- ❌ node-cron 库 - 引入额外依赖，不必要

---

## 决策 2: 备份文件命名冲突处理

**问题**: 同一天多次备份（自动+手动）如何处理文件名冲突？

**决策**: 追加序号后缀（_001, _002, ...）

**理由**:
- ✅ **保留所有备份** - 不覆盖任何备份文件
- ✅ **清晰可辨** - 序号明确表示同一天的第几次备份
- ✅ **易于排序** - 文件名按字典序自然排序

**实现**:
```typescript
function generateBackupPath(dbPath: string): string {
  const dir = dirname(dbPath);
  const baseName = basename(dbPath, '.db');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  let backupPath = join(dir, `${baseName}_${dateStr}.db`);
  
  let sequence = 1;
  while (existsSync(backupPath)) {
    backupPath = join(dir, `${baseName}_${dateStr}_${String(sequence).padStart(3, '0')}.db`);
    sequence++;
  }
  
  return backupPath;
}
```

**示例输出**:
- `stockanalyzer_20260429.db` (第一次备份)
- `stockanalyzer_20260429_001.db` (第二次备份)
- `stockanalyzer_20260429_002.db` (第三次备份)

**替代方案**:
- ❌ 覆盖同名文件 - 丢失备份历史
- ❌ 使用时间戳（HHMMSS）- 文件名过长，不易读

---

## 决策 3: 原子写入安全

**问题**: 如何防止备份过程中程序崩溃导致文件损坏？

**决策**: 先写入临时文件，然后原子重命名

**理由**:
- ✅ **防止损坏** - 如果复制过程中断，临时文件可删除，不影响已有备份
- ✅ **原子操作** - `renameSync` 在同一文件系统上是原子操作
- ✅ **简单可靠** - 无需复杂的锁机制

**实现**:
```typescript
const tempPath = backupPath + '.tmp';
try {
  copyFileSync(dbPath, tempPath);
  renameSync(tempPath, backupPath); // 原子重命名
} catch (copyError) {
  if (existsSync(tempPath)) {
    unlinkSync(tempPath); // 清理临时文件
  }
  throw copyError;
}
```

**替代方案**:
- ❌ 直接复制 - 中断时可能产生损坏的部分文件
- ❌ 文件锁 - 增加复杂性，SQLite本身已有锁机制

---

## 决策 4: 并发控制

**问题**: 如何防止同时执行多个备份任务？

**决策**: 使用内存布尔标志 `isBackupRunning`

**理由**:
- ✅ **简单有效** - 单进程应用，无需分布式锁
- ✅ **轻量级** - 无外部依赖
- ✅ **快速检查** - O(1)时间复杂度

**实现**:
```typescript
let isBackupRunning = false;

async function performBackup(): Promise<void> {
  if (isBackupRunning) {
    log.warn('备份已在运行中，跳过本次备份');
    return;
  }

  isBackupRunning = true;
  try {
    // 备份逻辑
  } finally {
    isBackupRunning = false;
  }
}
```

**替代方案**:
- ❌ 文件锁 - 过度复杂，不需要跨进程同步
- ❌ 队列系统 - 过度设计，单一备份任务足够

---

## 决策 5: IPC 通信方式（手动备份）

**问题**: 渲染进程如何触发主进程的备份功能？

**决策**: 使用 `ipcMain.handle` + `ipcRenderer.invoke`

**理由**:
- ✅ **标准模式** - Electron推荐的IPC通信方式
- ✅ **异步支持** - 天然支持Promise，便于前端处理
- ✅ **错误传播** - 异常可以传递到渲染进程

**实现**:
```typescript
// electron/index.ts (主进程)
ipcMain.handle('backup:manual', async () => {
  try {
    await performBackup();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// src/composables/useBackup.ts (渲染进程)
import { ipcRenderer } from 'electron';

export async function triggerManualBackup() {
  const result = await ipcRenderer.invoke('backup:manual');
  if (!result.success) {
    throw new Error(result.error);
  }
}
```

**替代方案**:
- ❌ `ipcRenderer.send` + `ipcMain.on` - 回调风格，不够优雅
- ❌ 共享状态 - 违反Electron安全模型

---

## 决策 6: UI反馈机制

**问题**: 如何向用户显示备份成功/失败？

**决策**: 复用现有的 Toast 通知系统

**理由**:
- ✅ **一致性** - 与项目其他通知保持一致
- ✅ **已实现** - 无需新建UI组件
- ✅ **用户体验好** - 非阻塞、自动消失

**实现**:
```typescript
// src/composables/useBackup.ts
import { useToast } from '@/composables/useToast';

export async function triggerManualBackup() {
  const toast = useToast();
  
  try {
    await ipcRenderer.invoke('backup:manual');
    toast.success('备份成功');
  } catch (error) {
    toast.error(`备份失败: ${error.message}`);
  }
}
```

**替代方案**:
- ❌ 对话框 - 过于侵入性，需要用户点击关闭
- ❌ 状态栏消息 - 不够显眼，可能被忽略

---

## 决策 7: 按钮防重复点击

**问题**: 如何防止用户在备份进行中重复点击按钮？

**决策**: 禁用按钮 + 显示加载状态

**理由**:
- ✅ **视觉反馈** - 用户清楚知道操作正在进行
- ✅ **物理阻止** - 禁用按钮防止再次点击
- ✅ **简单实现** - Vue响应式数据绑定

**实现**:
```vue
<template>
  <button 
    @click="handleBackup" 
    :disabled="isBackingUp"
    class="backup-button"
  >
    <span v-if="isBackingUp">备份中...</span>
    <span v-else>备份数据库</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const isBackingUp = ref(false);

async function handleBackup() {
  isBackingUp.value = true;
  try {
    await triggerManualBackup();
  } finally {
    isBackingUp.value = false;
  }
}
</script>
```

**替代方案**:
- ❌ 仅忽略点击 - 用户不知道操作是否被接受
- ❌ 显示模态框 - 过度复杂

---

## 总结

所有关键技术决策已完成，主要结论：

1. **调度**: `setTimeout` 精确延迟
2. **命名**: 日期 + 序号后缀
3. **安全**: 临时文件 + 原子重命名
4. **并发**: 内存布尔标志
5. **IPC**: `ipcMain.handle` / `ipcRenderer.invoke`
6. **UI反馈**: Toast通知
7. **防重复**: 禁用按钮 + 加载状态

这些决策确保备份功能可靠、高效、用户友好。
