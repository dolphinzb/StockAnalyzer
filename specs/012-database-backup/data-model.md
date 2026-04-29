# 数据模型：数据库备份功能

**功能**: 012-database-backup  
**日期**: 2026-04-29  
**状态**: 已完成

## 概述

本文档定义了数据库备份功能涉及的数据实体和IPC通信契约。

---

## 核心实体

### 1. Backup File (备份文件)

**描述**: 数据库文件的备份副本

**属性**:
- `path`: string - 完整文件路径
- `name`: string - 文件名（格式：`{name}_YYYYMMDD.db` 或 `{name}_YYYYMMDD_NNN.db`）
- `size`: number - 文件大小（字节）
- `createdAt`: Date - 文件创建时间（通过文件系统mtime获取）
- `isExpired`: boolean - 是否超过保留期（>3天）

**命名规则**:
```
基础格式: {database_name}_{YYYYMMDD}.db
冲突处理: {database_name}_{YYYYMMDD}_{NNN}.db

示例:
- stockanalyzer_20260429.db        (第一次备份)
- stockanalyzer_20260429_001.db    (同一天第二次备份)
- stockanalyzer_20260429_002.db    (同一天第三次备份)
```

**验证规则**:
- 文件名必须匹配正则: `/^\w+_\d{8}(?:_\d{3})?\.db$/`
- 文件大小必须 > 0
- 创建时间必须在过去3天内（否则视为过期）

**生命周期**:
```
创建 → 存在(≤3天) → 过期(>3天) → 删除
```

---

## IPC 通信契约

### 1. backup:manual (手动触发备份)

**方向**: 渲染进程 → 主进程

**请求**: 无参数

**响应**:
```typescript
interface BackupResult {
  success: boolean;      // 备份是否成功
  backupPath?: string;   // 备份文件路径（成功时）
  error?: string;        // 错误信息（失败时）
}
```

**使用示例**:
```typescript
// 渲染进程
const result = await ipcRenderer.invoke('backup:manual');
if (result.success) {
  console.log('备份成功:', result.backupPath);
} else {
  console.error('备份失败:', result.error);
}
```

**错误情况**:
- 数据库文件不存在
- 磁盘空间不足
- 文件权限问题
- 备份已在运行中

---

### 2. backup:status (查询备份状态) - 可选

**方向**: 渲染进程 → 主进程

**请求**: 无参数

**响应**:
```typescript
interface BackupStatus {
  isRunning: boolean;    // 是否有备份正在进行
  lastBackupTime?: Date; // 上次备份时间
  nextScheduledTime?: Date; // 下次自动备份时间
}
```

**用途**: 
- 显示备份按钮的禁用状态
- 显示下次自动备份倒计时

---

## UI 状态模型

### BackupButton 组件状态

```typescript
interface BackupButtonState {
  isBackingUp: boolean;     // 备份进行中
  lastResult?: {
    success: boolean;
    message: string;
    timestamp: Date;
  };
}
```

**状态转换**:
```
Idle → Backing Up → Success/Error → Idle
```

---

## 清理策略

### 过期备份判断

**算法**:
```typescript
function isBackupExpired(backupFile: BackupFile, retentionDays: number = 3): boolean {
  const now = Date.now();
  const fileAge = now - backupFile.createdAt.getTime();
  const maxAge = retentionDays * 24 * 60 * 60 * 1000;
  
  return fileAge > maxAge;
}
```

**清理时机**:
- 每次备份完成后立即执行
- 扫描备份目录，删除所有过期文件

**清理日志**:
```
🗑️ 已删除过期备份: stockanalyzer_20260425.db
清理完成: 删除了 2 个过期备份文件
```

---

## 数据流图

### 自动备份流程
```
定时器触发 (15:30)
    ↓
检查并发标志 (isBackupRunning)
    ↓
生成备份路径 (generateBackupPath)
    ↓
原子复制文件 (copyFileSync + renameSync)
    ↓
记录成功日志
    ↓
清理过期备份 (cleanupOldBackups)
    ↓
调度下一次备份
```

### 手动备份流程
```
用户点击按钮
    ↓
禁用按钮 (isBackingUp = true)
    ↓
调用 IPC (ipcRenderer.invoke)
    ↓
主进程执行备份 (performBackup)
    ↓
返回结果 {success, backupPath?, error?}
    ↓
渲染进程显示 Toast 通知
    ↓
恢复按钮状态 (isBackingUp = false)
```

---

## 约束与假设

### 约束
1. **单实例**: 同时只能有一个备份任务在执行
2. **原子性**: 备份文件要么完整，要么不存在（通过临时文件机制保证）
3. **保留期**: 严格保留3天，第4天凌晨自动删除

### 假设
1. **数据库可复制**: SQLite数据库在运行时可以安全复制
2. **磁盘空间充足**: 备份前不检查磁盘空间（失败时记录日志）
3. **时间准确**: 依赖系统本地时间，不考虑时区变化
4. **单用户**: 无需考虑多用户并发访问备份功能

---

## 扩展点

未来可能的扩展：
1. **自定义保留天数**: 允许用户在设置中调整保留期
2. **备份压缩**: 使用gzip压缩备份文件节省空间
3. **远程备份**: 支持上传到云存储
4. **备份历史UI**: 显示备份列表，支持手动恢复

当前实现专注于核心功能，这些扩展点暂不实现。
