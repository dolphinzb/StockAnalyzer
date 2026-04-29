/**
 * 数据库备份 Composable
 * 
 * 提供手动触发数据库备份的功能
 */

import type { BackupAPI } from '../../shared/types';

// 声明全局类型（从 preload 暴露的 API）
declare global {
  interface Window {
    backupApi: BackupAPI;
  }
}

export type BackupResult = Awaited<ReturnType<BackupAPI['manualBackup']>>;

export function useBackup() {
  /**
   * 手动触发数据库备份
   * @returns Promise<BackupResult> 备份结果
   */
  async function triggerManualBackup(): Promise<BackupResult> {
    try {
      const result = await window.backupApi.manualBackup();
      return result;
    } catch (error) {
      console.error('Backup invocation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  return {
    triggerManualBackup
  };
}
