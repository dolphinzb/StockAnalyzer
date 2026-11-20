/**
 * SQLite 引擎封装
 *
 * 设计目标：
 * - 用嵌入式 SQLite（better-sqlite3）就地读写数据库文件，事务提交即持久化，
 *   **不再**采用「序列化整库 → 写临时文件 → 重命名覆盖」的落盘方式
 * - 对外暴露与原有 sql.js 兼容的最小接口（exec / run / getRowsModified / export / close），
 *   使业务层只需要原语（queryRows/execute/transaction）即可访问数据库
 * - 与外部 SQLite 客户端（如 DBeaver）共存：WAL + busy_timeout，写写排队、读写并行
 */

import BetterSqlite3 from 'better-sqlite3';
import log from 'electron-log';

/** SQL 值类型 */
export type SqlValue = string | number | null | Uint8Array;

/** 查询结果（与 sql.js 的 QueryExecResult 结构一致，便于业务层按行下标取值） */
export interface QueryExecResult {
  columns: string[];
  values: SqlValue[][];
}

/**
 * 数据库句柄的最小接口
 * 业务层与测试只依赖这些方法，不直接耦合具体驱动
 */
export interface DatabaseLike {
  /** 执行 SQL，返回结果集（无结果集时返回空数组） */
  exec(sql: string, params?: unknown[]): QueryExecResult[];
  /** 执行写语句或多语句脚本 */
  run(sql: string, params?: unknown[]): void;
  /** 最近一次写语句影响的行数 */
  getRowsModified(): number;
  /** 导出当前数据库的完整字节流（一致性快照） */
  export(): Uint8Array;
  /** 关闭连接（WAL 会在关闭时合并） */
  close(): void;
}

/** 默认 PRAGMA：WAL + 适中的 fsync + 5 秒锁等待 */
const DEFAULT_PRAGMAS: Array<[string, string | number]> = [
  ['journal_mode', 'WAL'],
  ['synchronous', 'NORMAL'],
  ['busy_timeout', 5000],
];

/**
 * 基于 better-sqlite3 的数据库实现
 * @remarks 单实例单连接，同步 API；写操作为页级事务，不需要整文件替换
 */
export class SqliteDatabase implements DatabaseLike {
  private readonly db: BetterSqlite3.Database;

  /**
   * @param filename 数据库文件路径，或 ':memory:' 表示内存库
   */
  constructor(filename: string) {
    this.db = new BetterSqlite3(filename);
    for (const [name, value] of DEFAULT_PRAGMAS) {
      try {
        this.db.pragma(`${name} = ${value}`);
      } catch (error) {
        // 内存库不支持 WAL，忽略即可
        log.debug(`PRAGMA ${name} 设置未生效: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * 执行 SQL 并返回结果集
   * - 单条查询：返回列名与行数组
   * - 单条写语句：执行后返回空数组
   * - 多语句脚本：整体执行后返回空数组
   */
  exec(sql: string, params: unknown[] = []): QueryExecResult[] {
    let statement: BetterSqlite3.Statement;
    try {
      statement = this.db.prepare(sql);
    } catch (error) {
      // prepare 失败通常是多语句脚本，交给 exec 整体执行
      if (params.length === 0) {
        this.db.exec(sql);
        return [];
      }
      throw error;
    }

    if (!statement.reader) {
      statement.run(...params);
      return [];
    }

    const rows = statement.all(...params) as Array<Record<string, SqlValue>>;
    // 与 sql.js 语义保持一致：零行时不返回结果集（调用方普遍用 length === 0 判空）
    if (rows.length === 0) {
      return [];
    }
    const columns = statement.columns().map(column => column.name);
    return [{ columns, values: rows.map(row => columns.map(column => row[column])) }];
  }

  /** 执行写语句或脚本 */
  run(sql: string, params: unknown[] = []): void {
    if (params.length === 0) {
      // 支持多语句脚本（迁移文件）
      this.db.exec(sql);
      return;
    }
    this.db.prepare(sql).run(...params);
  }

  /** 最近一次写语句影响的行数 */
  getRowsModified(): number {
    const row = this.db.prepare('SELECT changes() AS changes').get() as { changes: number };
    return row.changes;
  }

  /** 导出完整数据库字节流 */
  export(): Uint8Array {
    return this.db.serialize();
  }

  /** 关闭连接 */
  close(): void {
    this.db.close();
  }
}

/**
 * 创建内存数据库（测试用，接口与文件库一致）
 */
export function createMemoryDatabase(): SqliteDatabase {
  return new SqliteDatabase(':memory:');
}
