import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import log from 'electron-log';
import type { Database } from 'sql.js';

/**
 * 迁移文件命名约定：NNN_name.sql
 * - NNN：三位数字版本号，从 001 起
 * - name：小写字母、数字、下划线
 * 版本号不允许为 0（0 是「无版本记录」的保留值）
 */
const MIGRATION_FILE_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

/** 迁移文件描述 */
export interface Migration {
  /** 版本号（取自文件名前缀） */
  version: number;
  /** 迁移名称（取自文件名） */
  name: string;
  /** 迁移文件绝对路径 */
  file: string;
}

/** 单次迁移执行结果 */
export interface MigrationResult {
  /** 执行前的版本号 */
  fromVersion: number;
  /** 执行后的版本号 */
  toVersion: number;
  /** 本次实际执行的迁移（基线标记时为空） */
  applied: Migration[];
  /** 本次是否做了存量库基线标记（0 → 首版） */
  baselineApplied: boolean;
}

/**
 * 定位迁移目录（按候选路径依次探测）
 * 1. 编译产物相邻：dist-electron/electron/../sql/migrations（源码直跑时等价于仓库 sql/migrations）
 * 2. 上两级：兼容更深的目录层级
 * 3. 应用资源目录：预留给未来的 extraResources 打包方式
 * @returns 存在的迁移目录绝对路径
 * @throws 全部候选路径都不存在时抛错，并列出尝试过的路径
 */
export function getMigrationsDir(): string {
  const candidates = [
    join(__dirname, '..', 'sql', 'migrations'),
    join(__dirname, '..', '..', 'sql', 'migrations'),
    ...(process.resourcesPath ? [join(process.resourcesPath, 'sql', 'migrations')] : []),
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }

  throw new Error(`未找到数据库迁移目录，已尝试以下路径:\n${candidates.join('\n')}`);
}

/**
 * 读取并校验迁移目录下的全部迁移文件
 * @param dir 迁移目录，默认按 getMigrationsDir() 探测
 * @returns 按版本号升序排列的迁移列表
 * @throws 目录不可读、命名不合规、版本号重复、目录为空时抛错
 */
export function listMigrations(dir?: string): Migration[] {
  const migrationsDir = dir ?? getMigrationsDir();

  let files: string[];
  try {
    files = readdirSync(migrationsDir);
  } catch (error) {
    throw new Error(`迁移目录不可读: ${migrationsDir}（${String(error)}）`);
  }

  const seen = new Map<number, string>();
  const migrations: Migration[] = [];

  for (const file of files.filter(name => name.toLowerCase().endsWith('.sql'))) {
    const matched = MIGRATION_FILE_PATTERN.exec(file);
    if (!matched) {
      throw new Error(`迁移文件命名不合规: ${file}（应形如 001_init.sql）`);
    }

    const version = Number(matched[1]);
    if (version === 0) {
      throw new Error(`迁移版本号非法: ${file}（版本号必须大于 0）`);
    }

    const duplicated = seen.get(version);
    if (duplicated) {
      throw new Error(`迁移版本号重复: ${version}（${duplicated} 与 ${file}）`);
    }

    seen.set(version, file);
    migrations.push({ version, name: matched[2], file: join(migrationsDir, file) });
  }

  if (migrations.length === 0) {
    throw new Error(`迁移目录为空: ${migrationsDir}`);
  }

  return migrations.sort((left, right) => left.version - right.version);
}

/**
 * 读取数据库中记录的已应用版本
 * @param database 数据库实例
 * @returns `PRAGMA user_version` 的值，无记录时为 0
 */
export function getUserVersion(database: Database): number {
  const result = database.exec('PRAGMA user_version');
  if (result.length === 0 || result[0].values.length === 0) {
    return 0;
  }
  return Number(result[0].values[0][0]);
}

/**
 * 写入已应用版本
 * @param database 数据库实例
 * @param version 版本号（必须为非负整数）
 * @remarks PRAGMA 不支持参数绑定，故拼接字面量；入参已校验为整数
 */
export function setUserVersion(database: Database, version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`非法的数据库版本号: ${String(version)}`);
  }
  database.run(`PRAGMA user_version = ${version}`);
}

/**
 * 判断库中是否已存在业务表（用于区分「空库」与「存量库」）
 * @param database 数据库实例
 * @returns 存在非 sqlite 内置表时返回 true
 */
export function hasUserTables(database: Database): boolean {
  const result = database.exec(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
  );
  return result.length > 0 && result[0].values.length > 0;
}

/**
 * 解析本次迁移的起始版本
 * - 已有版本记录：从该版本继续
 * - 无版本记录但已有业务表：视为首个迁移对应的基线版本（只盖章，不执行）
 * - 其余（新库 / 空库）：从 0 开始，执行全部迁移
 * @param database 数据库实例
 * @param isNewDatabase 数据库文件是否为新文件（不存在或为空）
 * @param baselineVersion 首个迁移的版本号
 * @returns 起始版本与是否走基线标记
 */
export function resolveStartVersion(
  database: Database,
  isNewDatabase: boolean,
  baselineVersion: number
): { version: number; baseline: boolean } {
  const recorded = getUserVersion(database);
  if (recorded > 0) {
    return { version: recorded, baseline: false };
  }
  if (!isNewDatabase && hasUserTables(database)) {
    return { version: baselineVersion, baseline: true };
  }
  return { version: 0, baseline: false };
}

/**
 * 查询待执行的迁移
 * @param database 数据库实例
 * @param options.isNewDatabase 数据库文件是否为新文件
 * @param options.dir 迁移目录，默认自动探测
 * @returns 版本号大于当前起始版本的迁移列表
 */
export function getPendingMigrations(
  database: Database,
  options: { isNewDatabase: boolean; dir?: string }
): Migration[] {
  const all = listMigrations(options.dir);
  const start = resolveStartVersion(database, options.isNewDatabase, all[0].version);
  return all.filter(migration => migration.version > start.version);
}

/**
 * 执行迁移，把数据库升到迁移目录中的最新版本
 * - 基线标记与全部待执行迁移包在同一个事务中
 * - 任一迁移失败则整体回滚并抛出，调用方不得落盘
 * @param database 数据库实例
 * @param options.isNewDatabase 数据库文件是否为新文件
 * @param options.dir 迁移目录，默认自动探测
 * @returns 迁移执行结果
 */
export function runMigrations(
  database: Database,
  options: { isNewDatabase: boolean; dir?: string }
): MigrationResult {
  const all = listMigrations(options.dir);
  const latestVersion = all[all.length - 1].version;
  const start = resolveStartVersion(database, options.isNewDatabase, all[0].version);
  const pending = all.filter(migration => migration.version > start.version);

  if (pending.length === 0 && !start.baseline) {
    log.info(`数据库结构已是最新版本 v${start.version}，无需迁移`);
    return {
      fromVersion: start.version,
      toVersion: start.version,
      applied: [],
      baselineApplied: false,
    };
  }

  log.info(
    `数据库迁移开始: v${start.version} → v${latestVersion}，待执行 ${pending.length} 个` +
      (start.baseline ? '（存量库基线标记）' : '')
  );

  database.run('BEGIN');
  try {
    if (start.baseline) {
      setUserVersion(database, start.version);
      log.info(`存量库基线标记完成: user_version 0 → ${start.version}，不执行 ${all[0].name}`);
    }

    for (const migration of pending) {
      database.run(readFileSync(migration.file, 'utf-8'));
      setUserVersion(database, migration.version);
      log.info(`已应用迁移 ${String(migration.version).padStart(3, '0')}_${migration.name}`);
    }

    database.run('COMMIT');
  } catch (error) {
    try {
      database.run('ROLLBACK');
    } catch (rollbackError) {
      log.error('数据库迁移回滚失败:', rollbackError);
    }
    log.error('数据库迁移失败，已回滚:', error);
    throw error;
  }

  log.info(`数据库迁移完成: v${start.version} → v${latestVersion}`);
  return {
    fromVersion: start.version,
    toVersion: latestVersion,
    applied: pending,
    baselineApplied: start.baseline,
  };
}
