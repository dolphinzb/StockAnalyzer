/**
 * 数据库初始化脚本
 * 
 * 使用方法：
 * 1. 备份数据库文件（重要！）
 * 2. 运行: npm run init-db
 * 
 * 注意：此脚本会重新初始化数据库结构，执行前请务必备份！
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
 * 获取init.sql文件路径
 */
function getInitSqlPath(): string {
  // 假设脚本在项目根目录的scripts目录下
  const projectRoot = join(__dirname, '..');
  return join(projectRoot, 'sql', 'init.sql');
}

/**
 * 检查是否需要重新初始化
 */
function needsMigration(): boolean {
  const database = getDb();
  
  try {
    // 检查kline_data表是否有adjust_type字段
    const klineColumns = database.exec(`PRAGMA table_info(kline_data)`);
    const hasAdjustType = klineColumns.length > 0 && 
      klineColumns[0].values.some((col: any) => col[1] === 'adjust_type');
    
    if (!hasAdjustType) {
      console.log('✅ 检测到需要迁移：kline_data表缺少 adjust_type 字段');
      return true;
    }
    
    // 检查transfer_records表的account_balance字段
    const transferColumns = database.exec(`PRAGMA table_info(transfer_records)`);
    const hasAccountBalance = transferColumns.length > 0 && 
      transferColumns[0].values.some((col: any) => col[1] === 'account_balance');
    
    if (!hasAccountBalance) {
      console.log('✅ 检测到需要迁移：transfer_records表缺少 account_balance 字段');
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
      
      console.log('✅ 数据库已是最新版本，无需重新初始化');
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
 * 从init.sql文件执行数据库初始化
 */
function executeInitSql(): void {
  const database = getDb();
  const initSqlPath = getInitSqlPath();
  
  console.log(`正在读取初始化SQL文件: ${initSqlPath}`);
  
  if (!existsSync(initSqlPath)) {
    throw new Error(`初始化SQL文件不存在: ${initSqlPath}`);
  }
  
  const sqlContent = readFileSync(initSqlPath, 'utf-8');
  console.log('✅ SQL文件读取成功');
  
  // 执行SQL语句
  console.log('正在执行数据库初始化...');
  database.run(sqlContent);
  console.log('✅ 数据库初始化完成');
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
  console.log('  数据库初始化工具');
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
  console.log('⚠️  警告：即将执行数据库初始化操作');
  console.log('⚠️  此操作会删除并重建所有表结构');
  console.log('⚠️  请确保已备份数据库文件！\n');
  
  // 询问确认（在命令行环境中）
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('是否继续执行初始化？(yes/no): ', async (answer: string) => {
    readline.close();
    
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ 初始化已取消\n');
      process.exit(0);
    }
    
    try {
      console.log('\n3️⃣  开始执行初始化...\n');
      
      // 备份现有数据
      console.log('正在备份现有数据...');
      const database = getDb();
      
      // 备份transfer_records表数据
      const transferData = database.exec('SELECT * FROM transfer_records ORDER BY id ASC');
      const transferRecordsBackup = transferData.length > 0 ? transferData[0].values : [];
      console.log(`  ✓ 备份了 ${transferRecordsBackup.length} 条转账记录`);
      
      // 备份kline_data表数据
      const klineData = database.exec('SELECT * FROM kline_data ORDER BY id ASC');
      const klineDataBackup = klineData.length > 0 ? klineData[0].values : [];
      console.log(`  ✓ 备份了 ${klineDataBackup.length} 条K线数据`);
      
      // 备份watchlist_stocks表数据
      const watchlistData = database.exec('SELECT * FROM watchlist_stocks ORDER BY id ASC');
      const watchlistBackup = watchlistData.length > 0 ? watchlistData[0].values : [];
      console.log(`  ✓ 备份了 ${watchlistBackup.length} 条自选股记录`);
      
      // 备份trade_record表数据
      const tradeData = database.exec('SELECT * FROM trade_record ORDER BY id ASC');
      const tradeBackup = tradeData.length > 0 ? tradeData[0].values : [];
      console.log(`  ✓ 备份了 ${tradeBackup.length} 条交易记录`);
      
      // 备份config表数据
      const configData = database.exec("SELECT * FROM config WHERE key = 'app_config'");
      const configBackup = configData.length > 0 ? configData[0].values : [];
      console.log(`  ✓ 备份了配置数据`);
      
      // 删除所有表（按依赖顺序）
      console.log('\n正在清理旧表结构...');
      database.run('DROP TABLE IF EXISTS kline_data');
      database.run('DROP TABLE IF EXISTS transfer_records');
      database.run('DROP TABLE IF EXISTS watchlist_stocks');
      database.run('DROP TABLE IF EXISTS trade_record');
      database.run('DROP TABLE IF EXISTS config');
      console.log('  ✓ 旧表已清理');
      
      // 执行init.sql初始化新表结构
      executeInitSql();
      
      // 恢复数据
      console.log('\n正在恢复数据...');
      
      // 恢复config数据
      if (configBackup.length > 0) {
        const row = configBackup[0];
        database.run(
          "INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, ?)",
          [row[0], row[1], row[2]]
        );
        console.log('  ✓ 配置数据已恢复');
      }
      
      // 恢复watchlist_stocks数据
      if (watchlistBackup.length > 0) {
        for (const row of watchlistBackup) {
          database.run(
            `INSERT OR IGNORE INTO watchlist_stocks (id, stock_code, stock_name, buy_threshold, sell_threshold, monitor_enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]]
          );
        }
        console.log(`  ✓ 恢复了 ${watchlistBackup.length} 条自选股记录`);
      }
      
      // 恢复transfer_records数据（需要重新计算account_balance）
      if (transferRecordsBackup.length > 0) {
        let currentBalance = 0;
        for (const row of transferRecordsBackup) {
          const amount = row[2] as number;
          const type = row[3] as string;
          
          // 根据类型计算余额
          if (type === 'IN' || type === 'DIVIDEND' || type === 'STOCK_SELL' || type === 'INTEREST') {
            currentBalance += amount;
          } else if (type === 'OUT' || type === 'DIVIDEND_TAX' || type === 'STOCK_BUY') {
            currentBalance -= amount;
          }
          
          database.run(
            `INSERT OR IGNORE INTO transfer_records (id, transfer_date, amount, type, account_balance, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [row[0], row[1], row[2], row[3], currentBalance, row[5], row[6]]
          );
        }
        console.log(`  ✓ 恢复了 ${transferRecordsBackup.length} 条转账记录（已重新计算余额）`);
      }
      
      // 恢复trade_record数据
      if (tradeBackup.length > 0) {
        for (const row of tradeBackup) {
          database.run(
            `INSERT OR IGNORE INTO trade_record (id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8]]
          );
        }
        console.log(`  ✓ 恢复了 ${tradeBackup.length} 条交易记录`);
      }
      
      // 恢复kline_data数据
      if (klineDataBackup.length > 0) {
        for (const row of klineDataBackup) {
          // 旧数据没有adjust_type字段，设置为默认值''
          database.run(
            `INSERT OR IGNORE INTO kline_data (id, stock_code, trade_date, adjust_type, open, close, high, low, volume, amount, amplitude, change_percent, change_amount, turnover_rate, created_at, updated_at)
             VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row[0], row[1], row[2], row[4], row[5], row[6], row[7], row[8], row[9], row[10], row[11], row[12], row[13], row[14], row[15]]
          );
        }
        console.log(`  ✓ 恢复了 ${klineDataBackup.length} 条K线数据`);
      }
      
      // 保存数据库
      saveDatabase();
      
      console.log('\n========================================');
      console.log('  ✨ 初始化完成！');
      console.log('========================================\n');
      console.log('建议操作：');
      console.log('1. 启动应用验证功能是否正常');
      console.log('2. 检查资金明细列表显示是否正确');
      console.log('3. 测试新增/编辑/删除操作\n');
      
      process.exit(0);
    } catch (error) {
      console.error('\n❌ 初始化失败:', error);
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
