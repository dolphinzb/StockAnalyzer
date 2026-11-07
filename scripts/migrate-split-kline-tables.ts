/**
 * K线表拆分迁移脚本
 *
 * 将存量单表 kline_data 迁移为按周期分表：
 *   kline_data → kline_daily（RENAME，不搬行数据）
 *   + kline_weekly / kline_monthly（由 sql/init.sql 创建）
 *
 * 使用方法：
 *   1. 关闭应用（应用持有内存数据库副本，运行中执行会被退出时的整体回写覆盖）
 *   2. 运行: npm run migrate-kline-tables
 *
 * 安全措施：迁移前整库文件级备份，行数核对不一致时自动还原。
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import initSqlJs, { Database } from 'sql.js';

/**
 * 数据库文件路径（与 electron/database.ts 保持一致）
 * 支持 STOCKANALYZER_DB_PATH 覆盖，便于在数据库副本上演练迁移
 */
const DB_PATH = process.env.STOCKANALYZER_DB_PATH || join(homedir(), '.stockanalyzer', 'stockanalyzer.db');

/** 旧单表的索引（RENAME 后索引名不变，需清理后由新 DDL 重建） */
const LEGACY_INDEXES = [
  'idx_kline_data_stock_code',
  'idx_kline_data_trade_date',
  'idx_kline_data_stock_date_adjust',
];

/**
 * 定位 init.sql（兼容源码运行与编译后 dist-electron/scripts 运行）
 * @returns init.sql 绝对路径
 */
function resolveInitSqlPath(): string {
  const candidates = [
    join(__dirname, '..', '..', 'sql', 'init.sql'), // dist-electron/scripts → 项目根
    join(__dirname, '..', 'sql', 'init.sql'),
    join(process.cwd(), 'sql', 'init.sql'),
  ];
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(`初始化SQL文件不存在，已尝试: ${candidates.join(' | ')}`);
  }
  return found;
}

/**
 * 判断表是否存在
 */
function tableExists(database: Database, table: string): boolean {
  const result = database.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`
  );
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * 统计表行数
 */
function countRows(database: Database, table: string): number {
  const result = database.exec(`SELECT COUNT(*) FROM ${table}`);
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  return Number(result[0].values[0][0]);
}

/**
 * 执行 init.sql（全部语句均为 IF NOT EXISTS / INSERT OR IGNORE，可重复执行）
 * 用于创建 kline_weekly / kline_monthly 及三张表的新索引
 */
function execInitSql(database: Database): void {
  const sqlContent = readFileSync(resolveInitSqlPath(), 'utf-8');
  database.run(sqlContent);
  console.log('  ✓ 已执行 init.sql（补齐三张K线表与索引）');
}

/**
 * 执行迁移主流程
 */
async function runMigration(): Promise<void> {
  console.log('\n========================================');
  console.log('  K线表拆分迁移工具');
  console.log('========================================\n');

  if (!existsSync(DB_PATH)) {
    throw new Error(`数据库文件不存在: ${DB_PATH}\n请先执行 npm run init-db 初始化数据库`);
  }

  console.log(`数据库路径: ${DB_PATH}`);
  const SQL = await initSqlJs();
  const database = new SQL.Database(readFileSync(DB_PATH));
  console.log('✅ 数据库加载成功\n');

  const hasOldTable = tableExists(database, 'kline_data');
  const hasDailyTable = tableExists(database, 'kline_daily');

  // 已迁移（例如应用启动时已自动迁移过）：无需任何操作
  if (!hasOldTable && hasDailyTable) {
    console.log(`ℹ️  已完成迁移，无需操作（kline_daily 现有 ${countRows(database, 'kline_daily')} 条）`);
    process.exit(0);
  }

  // 既无旧表也无新表：说明库未初始化，迁移脚本不承担建库职责
  if (!hasOldTable && !hasDailyTable) {
    console.error('❌ 未找到任何K线表，请先执行 npm run init-db 初始化数据库');
    process.exit(1);
  }

  // 两表并存：无法判断数据归属，不做任何修改
  if (hasOldTable && hasDailyTable) {
    console.error('❌ kline_data 与 kline_daily 同时存在，请人工确认数据归属后再执行');
    process.exit(1);
  }

  // ---- 正常迁移：kline_data 存在且 kline_daily 不存在 ----
  const oldCount = countRows(database, 'kline_data');
  console.log(`1️⃣  开始迁移：kline_data → kline_daily，并新建周线/月线表`);
  console.log(`   迁移前日线记录: ${oldCount} 条\n`);

  const backupPath = `${DB_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  copyFileSync(DB_PATH, backupPath);
  console.log(`✅ 已备份数据库: ${backupPath}\n`);

  try {
    console.log('2️⃣  执行表改名...');
    database.run('ALTER TABLE kline_data RENAME TO kline_daily');
    console.log('  ✓ kline_data 已改名为 kline_daily');

    for (const index of LEGACY_INDEXES) {
      database.run(`DROP INDEX IF EXISTS ${index}`);
      console.log(`  ✓ 已清理旧索引 ${index}`);
    }

    execInitSql(database);

    console.log('\n3️⃣  核对迁移结果...');
    const newCount = countRows(database, 'kline_daily');
    console.log(`   迁移后日线记录: ${newCount} 条`);
    if (newCount !== oldCount) {
      throw new Error(`行数核对失败：迁移前 ${oldCount} 条，迁移后 ${newCount} 条`);
    }

    writeFileSync(DB_PATH, Buffer.from(database.export()));
    console.log(`✅ 数据库已保存\n`);

    console.log('========================================');
    console.log('  ✨ 迁移完成！');
    console.log('========================================');
    console.log(`日线记录: ${newCount} 条（与迁移前一致）`);
    console.log('周线表/月线表: 已创建（空表，需在应用内下载）');
    console.log(`备份文件: ${backupPath}\n`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 迁移失败:', error instanceof Error ? error.message : error);
    copyFileSync(backupPath, DB_PATH);
    console.error(`❌ 已从备份还原数据库: ${backupPath}`);
    process.exit(1);
  }
}

runMigration().catch((error: unknown) => {
  console.error('❌ 迁移脚本执行失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
