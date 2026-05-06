import { Database } from 'sql.js';
import log from 'electron-log';

/**
 * 资金管理服务
 * 提供转账记录的CRUD操作和盈利统计功能
 */
export class FundService {
  constructor(private db: Database) {}

  /**
   * 获取分页的资金明细记录列表（按日期倒序）
   * @param limit 每页数量
   * @param offset 偏移量
   * @returns 资金明细记录数组（包含accountBalance）
   */
  async getTransferRecords(limit: number, offset: number): Promise<any[]> {
    try {
      const result = this.db.exec(
        `SELECT id, transfer_date, amount, type, account_balance, created_at, updated_at
         FROM transfer_records
         ORDER BY transfer_date DESC, id DESC
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
          amount: record.amount || 0,
          type: record.type,
          accountBalance: typeof record.account_balance === 'number' ? record.account_balance : 0,
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
   * 新增资金明细记录
   * @param record 资金明细记录数据
   * @returns 新记录的ID
   */
  async addTransferRecord(record: { transferDate: string; amount: number; type: string }): Promise<number> {
    try {
      // 验证金额必须为正数
      if (record.amount <= 0) {
        throw new Error('金额必须为正数');
      }

      // 验证类型必须是7种之一
      const validTypes = ['IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX', 'STOCK_BUY', 'STOCK_SELL', 'INTEREST'];
      if (!validTypes.includes(record.type)) {
        throw new Error('资金类型必须为IN、OUT、DIVIDEND、DIVIDEND_TAX、STOCK_BUY、STOCK_SELL或INTEREST');
      }

      // 获取上一条记录的余额
      const prevBalanceResult = this.db.exec(`
        SELECT account_balance FROM transfer_records 
        WHERE transfer_date < ? OR (transfer_date = ? AND id < (
          SELECT COALESCE(MAX(id), 0) FROM transfer_records WHERE transfer_date = ?
        ))
        ORDER BY transfer_date DESC, id DESC 
        LIMIT 1
      `, [record.transferDate, record.transferDate, record.transferDate]);

      let previousBalance = 0;
      if (prevBalanceResult.length > 0 && prevBalanceResult[0].values.length > 0) {
        previousBalance = prevBalanceResult[0].values[0][0] as number;
      }

      // 计算新记录的账户余额
      const newBalance = this.calculateBalance(previousBalance, record.amount, record.type);
      
      // 确保保存前消除 -0
      const normalizedBalance = newBalance === 0 ? 0 : newBalance;

      // 插入新记录（包含account_balance）
      this.db.run(
        `INSERT INTO transfer_records (transfer_date, amount, type, account_balance)
         VALUES (?, ?, ?, ?)`,
        [record.transferDate, record.amount, record.type, normalizedBalance]
      );

      // 获取最后插入的ID
      const result = this.db.exec('SELECT last_insert_rowid() as id');
      const newId = result[0].values[0][0] as number;

      log.info(`新增资金明细记录成功，ID: ${newId}, 余额: ${newBalance}`);
      
      // 重新计算该日期之后的所有记录的余额
      this.recalculateBalancesAfterDate(record.transferDate);
      
      return newId;
    } catch (error) {
      log.error('addTransferRecord error:', error);
      throw error;
    }
  }

  /**
   * 更新资金明细记录
   * @param id 记录ID
   * @param data 更新数据（包含可选的accountBalance）
   * @returns 是否成功
   */
  async updateTransferRecord(id: number, data: { transferDate?: string; amount?: number; type?: string; accountBalance?: number | string | null }): Promise<boolean> {
    try {
      log.info(`updateTransferRecord called with data:`, JSON.stringify(data));
      
      // 验证金额如果提供则必须为正数
      if (data.amount !== undefined && data.amount <= 0) {
        throw new Error('金额必须为正数');
      }

      // 验证类型如果提供则必须是7种之一
      const validTypes = ['IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX', 'STOCK_BUY', 'STOCK_SELL', 'INTEREST'];
      if (data.type !== undefined && !validTypes.includes(data.type)) {
        throw new Error('资金类型必须为IN、OUT、DIVIDEND、DIVIDEND_TAX、STOCK_BUY、STOCK_SELL或INTEREST');
      }

      // 获取原记录的日期（用于确定重算起点）
      const originalRecord = this.db.exec(
        `SELECT transfer_date FROM transfer_records WHERE id = ?`,
        [id]
      );
      
      if (originalRecord.length === 0 || originalRecord[0].values.length === 0) {
        throw new Error('记录不存在');
      }
      
      const originalDate = originalRecord[0].values[0][0] as string;
      const updateDate = data.transferDate || originalDate;
      
      // 确定重算起点：使用原日期和更新日期中较早的那个
      const recalcStartDate = originalDate < updateDate ? originalDate : updateDate;

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
      
      // 判断用户是否手动设置了账户余额（排除空值、空字符串、NaN）
      const hasManualBalance = data.accountBalance !== undefined && 
                               data.accountBalance !== null && 
                               data.accountBalance !== '' && 
                               !isNaN(Number(data.accountBalance));
      
      // 如果用户手动设置了账户余额，直接更新
      if (hasManualBalance) {
        updates.push('account_balance = ?');
        values.push(Number(data.accountBalance));
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

      // 如果用户没有手动设置账户余额，则重新计算该记录及后续所有记录的账户余额
      if (!hasManualBalance) {
        log.info(`未设置手动余额，开始重算从 ${recalcStartDate} 开始的记录`);
        this.recalculateBalancesAfterDate(recalcStartDate);
      } else {
        // 如果用户手动设置了余额，只重算后续记录
        log.info(`使用手动余额 ${data.accountBalance}，只重算后续记录`);
        this.recalculateBalancesAfterDate(originalDate);
      }
      
      log.info(`更新资金明细记录成功，ID: ${id}`);
      return true;
    } catch (error) {
      log.error('updateTransferRecord error:', error);
      throw error;
    }
  }

  /**
   * 删除资金明细记录
   * @param id 记录ID
   * @returns 是否成功
   */
  async deleteTransferRecord(id: number): Promise<boolean> {
    try {
      // 获取被删除记录的日期
      const record = this.db.exec(
        `SELECT transfer_date FROM transfer_records WHERE id = ?`,
        [id]
      );
      
      let deleteDate = '';
      if (record.length > 0 && record[0].values.length > 0) {
        deleteDate = record[0].values[0][0] as string;
      }
      
      // 删除记录
      this.db.run('DELETE FROM transfer_records WHERE id = ?', [id]);
      
      // 如果获取到了日期，重新计算后续记录的余额
      if (deleteDate) {
        this.recalculateBalancesAfterDate(deleteDate);
      }
      
      log.info(`删除资金明细记录成功，ID: ${id}`);
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

  /**
   * 获取账户余额
   * @returns 账户余额
   */
  async getAccountBalance(): Promise<number> {
    try {
      const result = this.db.exec(
        'SELECT account_balance FROM account_config WHERE id = 1'
      );

      if (result.length === 0 || result[0].values.length === 0) {
        log.warn('未找到账户配置记录，返回默认值0');
        return 0;
      }

      const balance = result[0].values[0][0] as number;
      log.info(`获取账户余额成功: ${balance}`);
      return balance;
    } catch (error) {
      log.error('getAccountBalance error:', error);
      throw error;
    }
  }

  /**
   * 更新账户余额
   * @param balance 新的账户余额
   * @returns 是否成功
   */
  async updateAccountBalance(balance: number): Promise<boolean> {
    try {
      // 验证余额不能为负数
      if (balance < 0) {
        throw new Error('账户余额不能为负数');
      }

      this.db.run(
        `UPDATE account_config 
         SET account_balance = ?, 
             updated_at = strftime('%Y-%m-%dT%H:%M:%S', 'now') 
         WHERE id = 1`,
        [balance]
      );

      log.info(`更新账户余额成功: ${balance}`);
      return true;
    } catch (error) {
      log.error('updateAccountBalance error:', error);
      throw error;
    }
  }

  /**
   * 计算给定记录的账户余额
   * @param previousBalance 上一条记录的余额
   * @param amount 当前记录金额
   * @param type 资金类型
   * @returns 计算后的余额
   */
  private calculateBalance(previousBalance: number, amount: number, type: string): number {
    // 将金额转换为分（整数）进行计算，避免浮点数精度问题
    const previousCents = Math.round(previousBalance * 100);
    const amountCents = Math.round(amount * 100);
    
    let resultCents: number;
    
    // IN、DIVIDEND、STOCK_SELL、INTEREST 增加余额
    if (type === 'IN' || type === 'DIVIDEND' || type === 'STOCK_SELL' || type === 'INTEREST') {
      resultCents = previousCents + amountCents;
    } 
    // OUT、DIVIDEND_TAX、STOCK_BUY 减少余额
    else if (type === 'OUT' || type === 'DIVIDEND_TAX' || type === 'STOCK_BUY') {
      resultCents = previousCents - amountCents;
    } else {
      resultCents = previousCents;
    }
    
    // 转换回元，并保留2位小数
    const result = resultCents / 100;
    
    // 消除 -0
    return result === 0 ? 0 : Number(result.toFixed(2));
  }

  /**
   * 重新计算指定日期之后的所有记录的账户余额
   * @param afterDate 从此日期之后开始重算（不包含此日期）
   */
  private recalculateBalancesAfterDate(afterDate: string): void {
    try {
      // 获取需要重算的记录（按日期升序）
      // 注意：包括 afterDate 当天及之后的所有记录
      const result = this.db.exec(`
        SELECT id, amount, type 
        FROM transfer_records 
        WHERE transfer_date >= ?
        ORDER BY transfer_date ASC, id ASC
      `, [afterDate]);

      if (result.length === 0 || result[0].values.length === 0) {
        log.info('没有记录需要重算');
        return;
      }

      // 获取重算起始点之前的余额（作为初始余额）
      const prevBalanceResult = this.db.exec(`
        SELECT account_balance FROM transfer_records 
        WHERE transfer_date < ? 
        ORDER BY transfer_date DESC, id DESC 
        LIMIT 1
      `, [afterDate]);

      let currentBalance = 0;
      if (prevBalanceResult.length > 0 && prevBalanceResult[0].values.length > 0) {
        currentBalance = prevBalanceResult[0].values[0][0] as number;
      }

      log.info(`开始重算 ${result[0].values.length} 条记录，起始余额: ${currentBalance}`);

      // 逐条更新余额
      for (const row of result[0].values) {
        const id = row[0] as number;
        const amount = row[1] as number;
        const type = row[2] as string;

        currentBalance = this.calculateBalance(currentBalance, amount, type);
        
        // 确保保存前消除 -0
        const normalizedBalance = currentBalance === 0 ? 0 : currentBalance;

        this.db.run(
          `UPDATE transfer_records SET account_balance = ? WHERE id = ?`,
          [normalizedBalance, id]
        );
      }

      log.info(`成功重算 ${result[0].values.length} 条记录的账户余额，最终余额: ${currentBalance}`);
    } catch (error) {
      log.error('recalculateBalancesAfterDate error:', error);
      throw error;
    }
  }

  /**
   * 批量重新计算所有记录的账户余额（用于数据迁移）
   */
  recalculateAllAccountBalances(): void {
    try {
      const result = this.db.exec(`
        SELECT id, amount, type 
        FROM transfer_records 
        ORDER BY transfer_date ASC, id ASC
      `);

      if (result.length === 0 || result[0].values.length === 0) {
        log.info('没有记录需要重新计算');
        return;
      }

      let currentBalance = 0;

      for (const row of result[0].values) {
        const id = row[0] as number;
        const amount = row[1] as number;
        const type = row[2] as string;

        currentBalance = this.calculateBalance(currentBalance, amount, type);
        
        // 确保保存前消除 -0
        const normalizedBalance = currentBalance === 0 ? 0 : currentBalance;

        this.db.run(
          `UPDATE transfer_records SET account_balance = ? WHERE id = ?`,
          [normalizedBalance, id]
        );
      }

      log.info(`成功重新计算 ${result[0].values.length} 条记录的账户余额`);
    } catch (error) {
      log.error('recalculateAllAccountBalances error:', error);
      throw error;
    }
  }
}
