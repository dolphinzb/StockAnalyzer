import { Database } from 'sql.js';
import log from 'electron-log';

/**
 * 资金管理服务
 * 提供转账记录的CRUD操作和盈利统计功能
 */
export class FundService {
  constructor(private db: Database) {}

  /**
   * 获取分页的转账记录列表（按日期倒序）
   * @param limit 每页数量
   * @param offset 偏移量
   * @returns 转账记录数组
   */
  async getTransferRecords(limit: number, offset: number): Promise<any[]> {
    try {
      const result = this.db.exec(
        `SELECT id, transfer_date, amount, type, created_at, updated_at
         FROM transfer_records
         ORDER BY transfer_date DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return [];
      }

      const columns = result[0].columns;
      return result[0].values.map(row => {
        const record: any = {};
        columns.forEach((col, idx) => {
          record[col] = row[idx];
        });
        // 转换字段名为camelCase
        return {
          id: record.id,
          transferDate: record.transfer_date,
          amount: record.amount,
          type: record.type,
          createdAt: record.created_at,
          updatedAt: record.updated_at,
        };
      });
    } catch (error) {
      log.error('getTransferRecords error:', error);
      throw error;
    }
  }

  /**
   * 新增转账记录
   * @param record 转账记录数据
   * @returns 新记录的ID
   */
  async addTransferRecord(record: { transferDate: string; amount: number; type: string }): Promise<number> {
    try {
      // 验证金额必须为正数
      if (record.amount <= 0) {
        throw new Error('转账金额必须为正数');
      }

      // 验证类型必须是IN或OUT
      if (record.type !== 'IN' && record.type !== 'OUT') {
        throw new Error('转账类型必须为IN或OUT');
      }

      this.db.run(
        `INSERT INTO transfer_records (transfer_date, amount, type)
         VALUES (?, ?, ?)`,
        [record.transferDate, record.amount, record.type]
      );

      // 获取最后插入的ID
      const result = this.db.exec('SELECT last_insert_rowid() as id');
      const newId = result[0].values[0][0] as number;

      log.info(`新增转账记录成功，ID: ${newId}`);
      return newId;
    } catch (error) {
      log.error('addTransferRecord error:', error);
      throw error;
    }
  }

  /**
   * 更新转账记录
   * @param id 记录ID
   * @param data 更新数据
   * @returns 是否成功
   */
  async updateTransferRecord(id: number, data: { transferDate?: string; amount?: number; type?: string }): Promise<boolean> {
    try {
      // 验证金额如果提供则必须为正数
      if (data.amount !== undefined && data.amount <= 0) {
        throw new Error('转账金额必须为正数');
      }

      // 验证类型如果提供则必须是IN或OUT
      if (data.type !== undefined && data.type !== 'IN' && data.type !== 'OUT') {
        throw new Error('转账类型必须为IN或OUT');
      }

      // 构建动态UPDATE语句
      const updates: string[] = [];
      const values: any[] = [];

      if (data.transferDate !== undefined) {
        updates.push('transfer_date = ?');
        values.push(data.transferDate);
      }
      if (data.amount !== undefined) {
        updates.push('amount = ?');
        values.push(data.amount);
      }
      if (data.type !== undefined) {
        updates.push('type = ?');
        values.push(data.type);
      }

      if (updates.length === 0) {
        return true; // 没有需要更新的字段
      }

      // 添加updated_at自动更新
      updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now')");

      values.push(id);

      this.db.run(
        `UPDATE transfer_records SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      log.info(`更新转账记录成功，ID: ${id}`);
      return true;
    } catch (error) {
      log.error('updateTransferRecord error:', error);
      throw error;
    }
  }

  /**
   * 删除转账记录
   * @param id 记录ID
   * @returns 是否成功
   */
  async deleteTransferRecord(id: number): Promise<boolean> {
    try {
      this.db.run('DELETE FROM transfer_records WHERE id = ?', [id]);
      log.info(`删除转账记录成功，ID: ${id}`);
      return true;
    } catch (error) {
      log.error('deleteTransferRecord error:', error);
      throw error;
    }
  }

  /**
   * 获取指定时间段的转入转出统计
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @returns 统计数据
   */
  async getTransferStatsInRange(startDate: string, endDate: string): Promise<{ totalIn: number; totalOut: number }> {
    try {
      const result = this.db.exec(
        `SELECT 
           COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE 0 END), 0) as total_in,
           COALESCE(SUM(CASE WHEN type = 'OUT' THEN amount ELSE 0 END), 0) as total_out
         FROM transfer_records
         WHERE transfer_date >= ? AND transfer_date <= ?`,
        [startDate, endDate]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return { totalIn: 0, totalOut: 0 };
      }

      return {
        totalIn: result[0].values[0][0] as number,
        totalOut: result[0].values[0][1] as number,
      };
    } catch (error) {
      log.error('getTransferStatsInRange error:', error);
      throw error;
    }
  }
}
