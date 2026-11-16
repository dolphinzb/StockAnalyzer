/**
 * 数据库备份服务
 * 
 * 功能：
 * - 每天15:30自动备份数据库文件
 * - 保留最近3天的备份
 * - 自动清理过期备份文件
 */

import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';
import { join, dirname, basename } from 'path';
import log from 'electron-log';
import type { BackupResult } from '../../shared/types';
import { getDatabasePath, saveDatabase } from '../database';

// 模块级状态变量
let isBackupRunning = false;
let backupTimeout: NodeJS.Timeout | null = null;
let failureNotifier: ((reason: string) => void) | null = null;

/** 注册自动备份失败的用户可见通知回调（由主进程注入系统通知） */
export function setBackupFailureNotifier(notifier: (reason: string) => void): void {
  failureNotifier = notifier;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 生成备份文件路径
 * @param dbPath 数据库文件路径
 * @returns 备份文件路径（格式：{name}_YYYYMMDD.db 或 {name}_YYYYMMDD_001.db）
 */
function generateBackupPath(dbPath: string): string {
  const dir = dirname(dbPath);
  const baseName = basename(dbPath, '.db');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  
  let backupPath = join(dir, `${baseName}_${dateStr}.db`);
  
  // 如果文件已存在，追加序号
  let sequence = 1;
  while (existsSync(backupPath)) {
    backupPath = join(dir, `${baseName}_${dateStr}_${String(sequence).padStart(3, '0')}.db`);
    sequence++;
  }
  
  return backupPath;
}

/**
 * 执行数据库备份
 * 所有失败路径都映射为 success:false，不再吞掉异常让调用方误以为成功
 */
export async function performBackup(): Promise<BackupResult> {
  // 并发控制：如果已在运行，明确返回失败
  if (isBackupRunning) {
    log.warn('备份已在运行中，跳过本次备份');
    return { success: false, error: '已有备份在执行，请稍后再试' };
  }

  isBackupRunning = true;

  try {
    // sql.js 是内存库：复制磁盘文件前先落盘，保证备份包含全部已提交写入
    try {
      saveDatabase();
    } catch (error) {
      const reason = `备份前落盘失败：${errorText(error)}`;
      log.error(`❌ ${reason}`);
      return { success: false, error: reason };
    }

    const dbPath = getDatabasePath();
    if (!existsSync(dbPath)) {
      const reason = `数据库文件不存在：${dbPath}`;
      log.error(`❌ ${reason}`);
      return { success: false, error: reason };
    }

    const backupPath = generateBackupPath(dbPath);
    const tempPath = backupPath + '.tmp';
    const startTime = Date.now();

    try {
      // 原子写入：先写入临时文件，然后重命名
      copyFileSync(dbPath, tempPath);
      renameSync(tempPath, backupPath);
    } catch (error) {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          // 忽略临时文件清理失败，主错误仍需返回
        }
      }
      const reason = `备份文件写入失败：${errorText(error)}`;
      log.error(`❌ ${reason}`);
      return { success: false, error: reason };
    }

    const duration = Date.now() - startTime;
    const fileSize = statSync(backupPath).size;
    log.info(`✅ 备份成功: ${backupPath}`);
    log.info(`   文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    log.info(`   耗时: ${duration}ms`);

    try {
      await cleanupOldBackups(dbPath);
    } catch (error) {
      const reason = `备份文件已生成，但清理旧备份失败：${errorText(error)}`;
      log.error(`❌ ${reason}`);
      return { success: false, error: reason, backupPath };
    }

    return { success: true, backupPath };
  } finally {
    isBackupRunning = false;
  }
}

/**
 * 清理过期备份文件
 * @param dbPath 数据库文件路径
 * @param retentionDays 保留天数（默认3天）
 * @returns 删除的文件数量
 */
async function cleanupOldBackups(dbPath: string, retentionDays: number = 3): Promise<number> {
  // 清理失败向上抛出，由 performBackup 映射为备份失败结果
  const dir = dirname(dbPath);
  const baseName = basename(dbPath, '.db');
  const files = readdirSync(dir);
  const now = Date.now();
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const pattern = new RegExp(`^${baseName}_\\d{8}(?:_\\d{3})?\\.db$`);
  let deletedCount = 0;

  for (const file of files) {
    if (!pattern.test(file)) {
      continue;
    }
    const filePath = join(dir, file);
    try {
      const stats = statSync(filePath);
      if (now - stats.mtimeMs > retentionMs) {
        unlinkSync(filePath);
        log.info(`🗑️  已删除过期备份: ${file}`);
        deletedCount++;
      }
    } catch (error) {
      throw new Error(`处理备份文件 ${file} 失败：${errorText(error)}`);
    }
  }

  if (deletedCount > 0) {
    log.info(`清理完成: 删除了 ${deletedCount} 个过期备份文件`);
  }
  return deletedCount;
}

/**
 * 调度下一次备份
 */
function scheduleNextBackup(): void {
  const now = new Date();
  const target = new Date();
  
  // 设置目标时间为今天15:30
  target.setHours(15, 30, 0, 0);
  
  // 如果今天15:30已过，则调度明天
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  
  const delay = target.getTime() - now.getTime();
  
  log.info(`⏰ 下次备份调度于: ${target.toLocaleString()} (延迟 ${Math.round(delay / 1000 / 60)} 分钟)`);
  
  backupTimeout = setTimeout(() => {
    void runScheduledBackup();
    scheduleNextBackup(); // 递归调度下一次
  }, delay);
}

/** 执行一次定时备份，失败时给出用户可见提示；导出以便契约测试直接调用 */
export async function runScheduledBackup(): Promise<BackupResult> {
  const result = await performBackup();
  if (!result.success && failureNotifier) {
    try {
      failureNotifier(result.error ?? '未知原因');
    } catch (error) {
      log.error('备份失败通知发送失败:', errorText(error));
    }
  }
  return result;
}

/**
 * 启动备份调度器
 */
export function startBackupScheduler(): void {
  log.info('🔄 启动数据库备份调度器');
  scheduleNextBackup();
}

/**
 * 停止备份调度器
 */
export function stopBackupScheduler(): void {
  if (backupTimeout) {
    clearTimeout(backupTimeout);
    backupTimeout = null;
    log.info('⏹️  备份调度器已停止');
  }
}
