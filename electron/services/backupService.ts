/**
 * 数据库备份服务
 * 
 * 功能：
 * - 每天15:30自动备份数据库文件
 * - 保留最近3天的备份
 * - 自动清理过期备份文件
 */

import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync, renameSync, writeFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import log from 'electron-log';
import { getDatabasePath } from '../database';

// 模块级状态变量
let isBackupRunning = false;
let backupTimeout: NodeJS.Timeout | null = null;

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
 */
export async function performBackup(): Promise<void> {
  // 并发控制：如果已在运行，跳过
  if (isBackupRunning) {
    log.warn('备份已在运行中，跳过本次备份');
    return;
  }

  isBackupRunning = true;
  
  try {
    const dbPath = getDatabasePath();
    
    // 验证数据库文件存在
    if (!existsSync(dbPath)) {
      log.error(`数据库文件不存在: ${dbPath}`);
      return;
    }
    
    const backupPath = generateBackupPath(dbPath);
    const tempPath = backupPath + '.tmp'; // 临时文件
    const startTime = Date.now();
    
    try {
      // 原子写入：先写入临时文件，然后重命名
      copyFileSync(dbPath, tempPath);
      renameSync(tempPath, backupPath); // 原子重命名
      
      const duration = Date.now() - startTime;
      const fileSize = statSync(backupPath).size;
      
      log.info(`✅ 备份成功: ${backupPath}`);
      log.info(`   文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      log.info(`   耗时: ${duration}ms`);
      
      // 备份完成后执行清理
      await cleanupOldBackups(dbPath);
      
    } catch (copyError) {
      // 如果临时文件存在，删除它
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch (e) {
          // 忽略删除临时文件的错误
        }
      }
      throw copyError;
    }
    
  } catch (error) {
    log.error(`❌ 备份失败: ${error instanceof Error ? error.message : String(error)}`);
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
  try {
    const dir = dirname(dbPath);
    const baseName = basename(dbPath, '.db');
    const files = readdirSync(dir);
    
    const now = Date.now();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    
    files.forEach(file => {
      // 匹配备份文件模式：{name}_YYYYMMDD.db 或 {name}_YYYYMMDD_001.db
      const pattern = new RegExp(`^${baseName}_\\d{8}(?:_\\d{3})?\\.db$`);
      
      if (pattern.test(file)) {
        const filePath = join(dir, file);
        
        try {
          const stats = statSync(filePath);
          const age = now - stats.mtimeMs;
          
          if (age > retentionMs) {
            unlinkSync(filePath);
            log.info(`🗑️  已删除过期备份: ${file}`);
            deletedCount++;
          }
        } catch (error) {
          log.error(`删除备份文件失败 ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });
    
    if (deletedCount > 0) {
      log.info(`清理完成: 删除了 ${deletedCount} 个过期备份文件`);
    }
    
    return deletedCount;
    
  } catch (error) {
    log.error(`清理备份文件失败: ${error instanceof Error ? error.message : String(error)}`);
    return 0;
  }
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
    performBackup();
    scheduleNextBackup(); // 递归调度下一次
  }, delay);
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
