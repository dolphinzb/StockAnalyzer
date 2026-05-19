import { getDb, saveDatabase } from '../electron/database';

/**
 * 数据库迁移:为 transfer_records 表添加 trade_record_id 字段
 * 此脚本用于升级现有数据库结构
 */
export function migrateAddTradeRecordId(): void {
  const db = getDb();
  
  console.log('开始执行数据库迁移:添加 trade_record_id 字段...');
  
  // 检查字段是否已存在
  const tableInfo = db.exec("PRAGMA table_info(transfer_records)");
  
  if (tableInfo.length === 0 || tableInfo[0].values.length === 0) {
    throw new Error('无法获取 transfer_records 表信息');
  }
  
  const hasTradeRecordId = tableInfo[0].values.some(row => row[1] === 'trade_record_id');
  
  if (!hasTradeRecordId) {
    console.log('正在添加 trade_record_id 字段...');
    db.run('ALTER TABLE transfer_records ADD COLUMN trade_record_id INTEGER');
    saveDatabase();
    console.log('✓ trade_record_id 字段添加成功');
  } else {
    console.log('✓ trade_record_id 字段已存在,跳过迁移');
  }
}

// 如果直接运行此脚本,执行迁移
if (require.main === module) {
  try {
    migrateAddTradeRecordId();
    console.log('迁移完成');
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}
