/**
 * 日志文件管理服务
 *
 * 职责：
 * - 计算日志目录与按天分文件的路径
 * - 枚举保留窗口内可用的日志日期
 * - 清理超出保留窗口的日志文件
 * - 将存量 main.log / main.old.log 迁移为按天命名
 *
 * 本模块**不输出任何日志**：存量迁移发生在 electron-log 初始化之前，
 * 此时调用 log 会按默认配置重新创建 main.log，破坏迁移结果。
 * 迁移与清理的结果由调用方（主进程入口）负责记录。
 */

import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

/** 按天日志文件名模式：main-YYYY-MM-DD.log */
const LOG_FILE_PATTERN = /^main-(\d{4}-\d{2}-\d{2})\.log$/;

/** 保留天数（含当天） */
export const LOG_RETENTION_DAYS = 30;

/** 存量日志文件名，迁移后不再产生 */
const LEGACY_LOG_FILES = ['main.log', 'main.old.log'] as const;

/**
 * 格式化为本地日期字符串（YYYY-MM-DD）
 * 必须使用本地时间，不能用 toISOString：后者是 UTC，会导致凌晨日志归档到前一天
 * @param date 时间
 * @returns 本地日期字符串
 */
export function formatLogDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 日志目录（<userData>/logs）
 * @returns 日志目录绝对路径
 */
export function getLogDir(): string {
  return join(app.getPath('userData'), 'logs');
}

/**
 * 指定日期的日志文件路径
 * @param logDir 日志目录
 * @param date 本地日期字符串（YYYY-MM-DD）
 * @returns 日志文件绝对路径
 */
export function getLogFilePath(logDir: string, date: string): string {
  return join(logDir, `main-${date}.log`);
}

/**
 * 校验日期字符串是否为合法的 YYYY-MM-DD
 * 既校验格式，也校验日期真实存在（拒绝 2026-13-01 这类值）
 * @param value 待校验字符串
 * @returns 是否合法
 */
export function isValidLogDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/**
 * 保留窗口的起始日期（含当天，共 LOG_RETENTION_DAYS 天）
 * @param today 今天
 * @returns 起始日期字符串
 */
function getRetentionStart(today: Date): string {
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - (LOG_RETENTION_DAYS - 1)
  );
  return formatLogDate(start);
}

/**
 * 列出保留窗口内存在的日志日期，按日期倒序
 * @param logDir 日志目录
 * @param today 今天（用于计算保留窗口）
 * @returns 日期字符串数组
 */
export function listLogDates(logDir: string, today: Date = new Date()): string[] {
  if (!existsSync(logDir)) {
    return [];
  }

  const retentionStart = getRetentionStart(today);
  const dates: string[] = [];

  for (const fileName of readdirSync(logDir)) {
    const match = LOG_FILE_PATTERN.exec(fileName);
    if (!match) {
      continue;
    }

    const date = match[1];
    if (date < retentionStart) {
      continue;
    }

    dates.push(date);
  }

  return dates.sort((a, b) => (a < b ? 1 : -1));
}

/**
 * 删除超出保留窗口的日志文件
 * 只处理严格匹配 main-YYYY-MM-DD.log 的文件，其余文件一律不动
 * @param logDir 日志目录
 * @param today 今天（用于计算保留窗口）
 * @returns 被删除的文件名列表
 */
export function cleanupExpiredLogs(logDir: string, today: Date = new Date()): string[] {
  if (!existsSync(logDir)) {
    return [];
  }

  const retentionStart = getRetentionStart(today);
  const deleted: string[] = [];

  for (const fileName of readdirSync(logDir)) {
    const match = LOG_FILE_PATTERN.exec(fileName);
    if (!match || match[1] >= retentionStart) {
      continue;
    }

    try {
      unlinkSync(join(logDir, fileName));
      deleted.push(fileName);
    } catch {
      // 文件被占用等异常不影响主流程，下次启动会再次尝试
    }
  }

  return deleted;
}

/** 存量日志迁移结果 */
export interface LegacyLogMigrationResult {
  /** 已重命名的文件 */
  renamed: Array<{ from: string; to: string }>;
  /** 因目标已存在而跳过的文件 */
  skipped: Array<{ from: string; to: string }>;
}

/**
 * 迁移存量日志：main.log / main.old.log 按各自最后修改时间的本地日期重命名
 * 幂等：源文件不存在时不做任何操作；目标已存在时跳过且不覆盖
 * @param logDir 日志目录
 * @returns 迁移结果
 */
export function migrateLegacyLogs(logDir: string): LegacyLogMigrationResult {
  const result: LegacyLogMigrationResult = { renamed: [], skipped: [] };

  if (!existsSync(logDir)) {
    return result;
  }

  for (const legacyName of LEGACY_LOG_FILES) {
    const sourcePath = join(logDir, legacyName);
    if (!existsSync(sourcePath)) {
      continue;
    }

    const targetName = `main-${formatLogDate(statSync(sourcePath).mtime)}.log`;
    const targetPath = join(logDir, targetName);

    if (existsSync(targetPath)) {
      result.skipped.push({ from: legacyName, to: targetName });
      continue;
    }

    renameSync(sourcePath, targetPath);
    result.renamed.push({ from: legacyName, to: targetName });
  }

  return result;
}
