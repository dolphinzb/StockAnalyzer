/**
 * 数据库迁移脚本
 * 
 * 使用方法：
 * 1. 备份数据库文件（重要！）
 * 2. 运行: npm run migrate
 * 
 * 注意：此脚本会修改数据库结构，执行前请务必备份！
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import initSqlJs, { Database } from 'sql.js';

// 获取数据库路径（不依赖 Electron）
function getDatabasePath(): string {
  return join(homedir(), '.stockanalyzer', 'stockanalyzer.db');
}

let db: Database | null = null;

/**
 * 初始化数据库连接
 */
async function initializeDatabase(): Promise<void> {
  const dbPath = getDatabasePath();
  console.log(`数据库路径: ${dbPath}`);
  
  if (!existsSync(dbPath)) {
    throw new Error(`数据库文件不存在: ${dbPath}\n请先启动应用以创建数据库`);
  }
  
  const SQL = await initSqlJs();
  const fileBuffer = readFileSync(dbPath);
  db = new SQL.Database(fileBuffer);
  console.log('✅ 数据库加载成功');
}

/**
 * 保存数据库
 */
function saveDatabase(): void {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  
  const dbPath = getDatabasePath();
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(dbPath, buffer);
  console.log('✅ 数据库已保存');
}

/**
 * 获取数据库实例
 */
function getDb(): Database {
  if (!db) {
    throw new Error('数据库未初始化');
  }
  return db;
}

/**
 * 检查是否需要迁移
 */
function needsMigration(): boolean {
  const database = getDb();
  
  try {
    // 检查表是否存在
    const tableExists = database.exec(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='transfer_records'
    `);
    
    if (tableExists.length === 0) {
      console.log('❌ transfer_records 表不存在，无需迁移');
      return false;
    }
    
    // 检查account_balance字段
    const columns = database.exec(`PRAGMA table_info(transfer_records)`);
    const hasAccountBalance = columns[0].values.some((col: any) => col[1] === 'account_balance');
    
    if (!hasAccountBalance) {
      console.log('✅ 检测到需要迁移：缺少 account_balance 字段');
      return true;
    }
    
    // 检查type约束是否支持新类型
    const testDate = new Date().toISOString().split('T')[0];
    try {
      database.run(`
        INSERT INTO transfer_records (transfer_date, amount, type, account_balance)
        VALUES (?, 0.01, 'INTEREST', 0)
      `, [testDate]);
      
      database.run(`DELETE FROM transfer_records WHERE transfer_date = ? AND amount = 0.01 AND type = 'INTEREST'`, [testDate]);
      
      console.log('✅ 数据库已是最新版本，无需迁移');
      return false;
    } catch (error) {
      console.log('✅ 检测到需要迁移：type约束不支持新类型');
      return true;
    }
  } catch (error) {
    console.error('❌ 检查迁移状态失败:', error);
    return false;
  }
}

/**
 * 添加account_balance字段
 */
function addAccountBalanceColumn(): void {
  const database = getDb();
  console.log('正在添加 account_balance 字段...');
  
  database.run(`ALTER TABLE transfer_records ADD COLUMN account_balance REAL NOT NULL DEFAULT 0`);
  
  console.log('✅ account_balance 字段添加成功');
}

/**
 * 重建表以更新type约束
 */
function recreateTableWithNewConstraint(): void {
  const database = getDb();
  console.log('正在重建表以更新type约束...');
  
  // 1. 创建临时表
  database.run(`
    CREATE TABLE transfer_records_temp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      type TEXT NOT NULL CHECK(type IN ('IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX', 'STOCK_BUY', 'STOCK_SELL', 'INTEREST')),
      account_balance REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now')),
      updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S', 'now'))
    )
  `);
  console.log('  ✓ 临时表创建成功');
  
  // 2. 复制数据
  database.run(`
    INSERT INTO transfer_records_temp (id, transfer_date, amount, type, account_balance, created_at, updated_at)
    SELECT id, transfer_date, amount, type, account_balance, created_at, updated_at
    FROM transfer_records
  `);
  console.log('  ✓ 数据复制成功');
  
  // 3. 删除旧表
  database.run(`DROP TABLE transfer_records`);
  console.log('  ✓ 旧表删除成功');
  
  // 4. 重命名临时表
  database.run(`ALTER TABLE transfer_records_temp RENAME TO transfer_records`);
  console.log('  ✓ 表重命名成功');
  
  // 5. 重新创建索引
  database.run(`CREATE INDEX idx_transfer_date_desc ON transfer_records(transfer_date DESC)`);
  database.run(`CREATE INDEX idx_transfer_type_date ON transfer_records(type, transfer_date)`);
  console.log('  ✓ 索引重建成功');
  
  console.log('✅ 表重建完成，type约束已更新为7种类型');
}

/**
 * 重新计算所有记录的账户余额
 */
function recalculateAllBalances(): void {
  const database = getDb();
  console.log('正在重新计算所有记录的账户余额...');
  
  const result = database.exec(`
    SELECT id, transfer_date, amount, type 
    FROM transfer_records 
    ORDER BY transfer_date ASC, id ASC
  `);
  
  if (result.length === 0 || result[0].values.length === 0) {
    console.log('ℹ️  没有记录需要重新计算');
    return;
  }
  
  const records = result[0].values;
  let currentBalance = 0;
  let updatedCount = 0;
  
  for (const row of records) {
    const id = row[0] as number;
    const amount = row[2] as number;
    const type = row[3] as string;
    
    // 根据类型计算余额（支持7种类型）
    if (type === 'IN' || type === 'DIVIDEND' || type === 'STOCK_SELL' || type === 'INTEREST') {
      currentBalance += amount;
    } else if (type === 'OUT' || type === 'DIVIDEND_TAX' || type === 'STOCK_BUY') {
      currentBalance -= amount;
    }
    
    // 更新记录的账户余额
    database.run(
      `UPDATE transfer_records SET account_balance = ? WHERE id = ?`,
      [currentBalance, id]
    );
    updatedCount++;
  }
  
  console.log(`✅ 成功重新计算 ${updatedCount} 条记录的账户余额`);
}

/**
 * 执行迁移
 */
async function runMigration(): Promise<void> {
  console.log('\n========================================');
  console.log('  数据库迁移工具');
  console.log('========================================\n');
  
  // 初始化数据库
  console.log('1️⃣  初始化数据库连接...');
  await initializeDatabase();
  console.log('✅ 数据库连接成功\n');
  
  // 检查是否需要迁移
  console.log('2️⃣  检查迁移状态...');
  if (!needsMigration()) {
    console.log('\n✨ 数据库已是最新版本，无需迁移\n');
    process.exit(0);
  }
  console.log();
  
  // 警告用户
  console.log('⚠️  警告：即将执行数据库迁移操作');
  console.log('⚠️  此操作会修改数据库结构');
  console.log('⚠️  请确保已备份数据库文件！\n');
  
  // 询问确认（在命令行环境中）
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('是否继续执行迁移？(yes/no): ', async (answer: string) => {
    readline.close();
    
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ 迁移已取消\n');
      process.exit(0);
    }
    
    try {
      console.log('\n3️⃣  开始执行迁移...\n');
      
      const database = getDb();
      
      // 检查account_balance字段
      const columns = database.exec(`PRAGMA table_info(transfer_records)`);
      const hasAccountBalance = columns[0].values.some((col: any) => col[1] === 'account_balance');
      
      if (!hasAccountBalance) {
        addAccountBalanceColumn();
      }
      
      // 检查并更新type约束
      const testDate = new Date().toISOString().split('T')[0];
      let needsRecreate = false;
      try {
        database.run(`
          INSERT INTO transfer_records (transfer_date, amount, type, account_balance)
          VALUES (?, 0.01, 'INTEREST', 0)
        `, [testDate]);
        database.run(`DELETE FROM transfer_records WHERE transfer_date = ? AND amount = 0.01 AND type = 'INTEREST'`, [testDate]);
      } catch (error) {
        needsRecreate = true;
      }
      
      if (needsRecreate) {
        recreateTableWithNewConstraint();
      }
      
      // 重新计算余额
      recalculateAllBalances();
      
      // 保存数据库
      saveDatabase();
      
      console.log('\n========================================');
      console.log('  ✨ 迁移完成！');
      console.log('========================================\n');
      console.log('建议操作：');
      console.log('1. 启动应用验证功能是否正常');
      console.log('2. 检查资金明细列表显示是否正确');
      console.log('3. 测试新增/编辑/删除操作\n');
      
      process.exit(0);
    } catch (error) {
      console.error('\n❌ 迁移失败:', error);
      console.error('\n建议操作：');
      console.error('1. 从备份恢复数据库');
      console.error('2. 检查错误信息');
      console.error('3. 联系技术支持\n');
      process.exit(1);
    }
  });
}

// 执行迁移
runMigration().catch(error => {
  console.error('❌ 迁移脚本执行失败:', error);
  process.exit(1);
});
