import log from 'electron-log';
import { Database } from 'sql.js';

/**
 * 资金管理服务
 * 提供转账记录的CRUD操作和盈利统计功能
 */
export class FundService {
  constructor(private db: Database) { }

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
        // 如果用户手动设置了余额，使用手动设置的余额作为起始点，重算后续记录
        log.info(`使用手动余额 ${data.accountBalance}，重算 ${updateDate} 之后的记录`);
        this.recalculateBalancesAfterDate(updateDate, Number(data.accountBalance));
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
   * 获取指定日期之前的账户余额（期初余额）
   * 即开始日期之前最后一条记录的account_balance
   * @param date 日期字符串 (YYYY-MM-DD)
   * @returns 期初余额，如果没有记录则返回0
   */
  async getOpeningBalance(date: string): Promise<number> {
    try {
      const result = this.db.exec(
        `SELECT account_balance FROM transfer_records WHERE transfer_date < ? ORDER BY transfer_date DESC, id DESC LIMIT 1`,
        [date]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return 0;
      }

      return result[0].values[0][0] as number;
    } catch (error) {
      log.error('getOpeningBalance error:', error);
      throw error;
    }
  }

  /**
   * 获取账户余额（从资金明细表最后一条记录获取）
   * @returns 账户余额
   */
  async getAccountBalance(): Promise<number> {
    try {
      // 从资金明细表中获取最近一条记录的账户余额
      const result = this.db.exec(
        'SELECT account_balance FROM transfer_records ORDER BY transfer_date DESC, id DESC LIMIT 1'
      );

      if (result.length === 0 || result[0].values.length === 0) {
        log.warn('未找到资金明细记录，返回默认值0');
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
   * @param startBalance 可选的起始余额，如果提供则使用该值作为起始余额，否则查询数据库
   */
  private recalculateBalancesAfterDate(afterDate: string, startBalance?: number): void {
    try {
      // 获取需要重算的记录（按日期升序）
      // 如果提供了startBalance，说明afterDate当天的记录已经手动设置过余额，只重算之后的记录
      // 否则重算afterDate当天及之后的所有记录
      const dateCondition = startBalance !== undefined ? 'transfer_date > ?' : 'transfer_date >= ?';
      
      const result = this.db.exec(`
        SELECT id, amount, type 
        FROM transfer_records 
        WHERE ${dateCondition}
        ORDER BY transfer_date ASC, id ASC
      `, [afterDate]);

      if (result.length === 0 || result[0].values.length === 0) {
        log.info('没有记录需要重算');
        return;
      }

      // 获取重算起始点之前的余额（作为初始余额）
      let currentBalance: number;
      if (startBalance !== undefined) {
        // 如果提供了起始余额，直接使用
        currentBalance = startBalance;
        log.info(`使用提供的起始余额: ${currentBalance}`);
      } else {
        // 否则从数据库中获取
        const prevBalanceResult = this.db.exec(`
          SELECT account_balance FROM transfer_records 
          WHERE transfer_date < ? 
          ORDER BY transfer_date DESC, id DESC 
          LIMIT 1
        `, [afterDate]);

        currentBalance = 0;
        if (prevBalanceResult.length > 0 && prevBalanceResult[0].values.length > 0) {
          currentBalance = prevBalanceResult[0].values[0][0] as number;
        }
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

  /**
   * 获取指定日期的持仓市值（使用kline_data收盘价计算）
   * 对每只持股，从kline_data获取指定日期的收盘价，无数据时使用最近前一个交易日收盘价
   * @param date 目标日期 (YYYY-MM-DD)
   * @returns 持仓市值计算结果
   */
  async getHoldingsMarketValue(date: string): Promise<{
    marketValue: number;
    details: Array<{
      stockCode: string;
      stockName: string;
      closePrice: number;
      holdingCount: number;
      marketValue: number;
    }>;
    missingKlineStocks: string[];
  }> {
    try {
      // 获取截止指定日期的持仓股票（持仓数量>0）
      // 使用子查询获取每只股票截止指定日期最近一条交易记录的持仓数量
      const positionsResult = this.db.exec(`
        SELECT t1.stock_code, t1.stock_name, t1.holding_count
        FROM trade_record t1
        INNER JOIN (
          SELECT stock_code, MAX(trade_date) as max_date
          FROM trade_record
          WHERE trade_date <= ?
          GROUP BY stock_code
        ) t2 ON t1.stock_code = t2.stock_code AND t1.trade_date = t2.max_date
        WHERE t1.holding_count > 0
      `, [date]);

      if (positionsResult.length === 0 || positionsResult[0].values.length === 0) {
        return { marketValue: 0, details: [], missingKlineStocks: [] };
      }

      const details: Array<{
        stockCode: string;
        stockName: string;
        closePrice: number;
        holdingCount: number;
        marketValue: number;
      }> = [];
      const missingKlineStocks: string[] = [];
      let totalMarketValue = 0;

      for (const row of positionsResult[0].values) {
        const stockCode = row[0] as string;
        const stockName = row[1] as string;
        const holdingCount = row[2] as number;

        // 从kline_data获取指定日期或最近前一个交易日的收盘价
        const klineResult = this.db.exec(`
          SELECT close FROM kline_data 
          WHERE stock_code = ? AND trade_date <= ? 
          ORDER BY trade_date DESC LIMIT 1
        `, [stockCode, date]);

        if (klineResult.length === 0 || klineResult[0].values.length === 0 || klineResult[0].values[0][0] === null) {
          // 无K线数据
          missingKlineStocks.push(stockCode);
          log.warn(`股票 ${stockCode}(${stockName}) 无K线数据，日期: ${date}`);
          continue;
        }

        const closePrice = klineResult[0].values[0][0] as number;
        const marketValue = closePrice * holdingCount;
        totalMarketValue += marketValue;

        details.push({
          stockCode,
          stockName,
          closePrice,
          holdingCount,
          marketValue: Number(marketValue.toFixed(2)),
        });
      }

      log.info(`获取持仓市值成功，日期: ${date}, 总市值: ${totalMarketValue}, 持股数: ${details.length}, 无K线数据: ${missingKlineStocks.length}`);

      return {
        marketValue: Number(totalMarketValue.toFixed(2)),
        details,
        missingKlineStocks,
      };
    } catch (error) {
      log.error('getHoldingsMarketValue error:', error);
      throw error;
    }
  }

  /**
   * 获取截止指定日期最近一条记录的账户余额
   * 用于获取期初/期末账户余额
   * @param date 目标日期 (YYYY-MM-DD)
   * @returns 账户余额，无记录则返回0
   */
  async getClosingBalance(date: string): Promise<number> {
    try {
      const result = this.db.exec(
        `SELECT account_balance FROM transfer_records WHERE transfer_date <= ? ORDER BY transfer_date DESC, id DESC LIMIT 1`,
        [date]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return 0;
      }

      return result[0].values[0][0] as number;
    } catch (error) {
      log.error('getClosingBalance error:', error);
      throw error;
    }
  }

  /**
   * 获取指定时间段内的资金转入转出统计（来自transfer_records表）
   * 转入金额 = IN类型的amount之和
   * 转出金额 = OUT类型的amount之和
   * @param startDate 开始日期 (YYYY-MM-DD)
   * @param endDate 结束日期 (YYYY-MM-DD)
   * @returns 资金转入转出统计结果
   */
  async getTradeStatsInRange(startDate: string, endDate: string): Promise<{ totalIn: number; totalOut: number }> {
    try {
      // 获取IN类型转入总金额
      const inResult = this.db.exec(
        `SELECT COALESCE(SUM(amount), 0) as total_in
         FROM transfer_records
         WHERE type = 'IN' AND transfer_date >= ? AND transfer_date <= ?`,
        [startDate, endDate]
      );

      // 获取OUT类型转出总金额
      const outResult = this.db.exec(
        `SELECT COALESCE(SUM(amount), 0) as total_out
         FROM transfer_records
         WHERE type = 'OUT' AND transfer_date >= ? AND transfer_date <= ?`,
        [startDate, endDate]
      );

      const totalIn = inResult.length > 0 ? (inResult[0].values[0][0] as number) : 0;
      const totalOut = outResult.length > 0 ? (outResult[0].values[0][0] as number) : 0;

      log.info(`获取资金转入转出统计成功，时间段: ${startDate} ~ ${endDate}, 转入: ${totalIn}, 转出: ${totalOut}`);

      return {
        totalIn: Number(totalIn.toFixed(2)),
        totalOut: Number(totalOut.toFixed(2)),
      };
    } catch (error) {
      log.error('getTradeStatsInRange error:', error);
      throw error;
    }
  }

  /**
   * 获取指定时间段内的盈亏统计数据
   * 盈亏公式：盈亏金额=(期末账户余额+期末持仓市值)-(期初账户余额+期初持仓市值)+(转出金额-转入金额)
   * @param startDate 开始日期 (YYYY-MM-DD) - 期初
   * @param endDate 结束日期 (YYYY-MM-DD) - 期末
   * @returns 完整的盈亏统计数据
   */
  async getProfitStatistics(startDate: string, endDate: string): Promise<{
    startDate: string;
    endDate: string;
    openingAccountBalance: number;
    closingAccountBalance: number;
    openingHoldingsValue: number;
    closingHoldingsValue: number;
    totalIn: number;
    totalOut: number;
    profit: number;
  }> {
    try {
      // 1. 获取期初账户余额（截止期初日期最近记录的account_balance，不包含期初当天）
      const openingAccountBalance = await this.getOpeningBalance(startDate);

      // 2. 获取期末账户余额（截止期末日期最近记录的account_balance，包含期末当天）
      const closingAccountBalance = await this.getClosingBalance(endDate);

      // 3. 获取期初持仓市值
      const openingHoldings = await this.getHoldingsMarketValue(startDate);
      const openingHoldingsValue = openingHoldings.marketValue;

      // 4. 获取期末持仓市值
      const closingHoldings = await this.getHoldingsMarketValue(endDate);
      const closingHoldingsValue = closingHoldings.marketValue;

      // 5. 获取交易统计（来自trade_record表）
      const tradeStats = await this.getTradeStatsInRange(startDate, endDate);

      // 6. 计算盈亏金额
      const profit = (closingAccountBalance + closingHoldingsValue)
        - (openingAccountBalance + openingHoldingsValue)
        + (tradeStats.totalOut - tradeStats.totalIn);

      log.info(`盈亏统计计算完成，时间段: ${startDate} ~ ${endDate}, 盈亏: ${profit}`);

      return {
        startDate,
        endDate,
        openingAccountBalance,
        closingAccountBalance,
        openingHoldingsValue,
        closingHoldingsValue,
        totalIn: tradeStats.totalIn,
        totalOut: tradeStats.totalOut,
        profit: Number(profit.toFixed(2)),
      };
    } catch (error) {
      log.error('getProfitStatistics error:', error);
      throw error;
    }
  }

  /**
   * 获取年度盈亏数据（从2024年开始到当前年份）
   * @returns 年度盈亏数据数组
   */
  async getAnnualProfitData(): Promise<Array<{
    year: number;
    openingAccountBalance: number;
    closingAccountBalance: number;
    openingHoldingsValue: number;
    closingHoldingsValue: number;
    totalIn: number;
    totalOut: number;
    profit: number;
  }>> {
    try {
      const currentYear = new Date().getFullYear();
      const startYear = 2024;
      const annualData: Array<{
        year: number;
        openingAccountBalance: number;
        closingAccountBalance: number;
        openingHoldingsValue: number;
        closingHoldingsValue: number;
        totalIn: number;
        totalOut: number;
        profit: number;
      }> = [];

      for (let year = startYear; year <= currentYear; year++) {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        // 计算该年度的盈亏统计
        const stats = await this.getProfitStatistics(startDate, endDate);

        annualData.push({
          year,
          openingAccountBalance: stats.openingAccountBalance,
          closingAccountBalance: stats.closingAccountBalance,
          openingHoldingsValue: stats.openingHoldingsValue,
          closingHoldingsValue: stats.closingHoldingsValue,
          totalIn: stats.totalIn,
          totalOut: stats.totalOut,
          profit: stats.profit,
        });
      }

      log.info(`获取年度盈亏数据成功，共${annualData.length}年`);
      return annualData;
    } catch (error) {
      log.error('getAnnualProfitData error:', error);
      throw error;
    }
  }

  /**
   * 获取月度盈亏数据（过去24个月包括当月）
   * @returns 月度盈亏数据数组
   */
  async getMonthlyProfitData(): Promise<Array<{
    month: string;
    openingAccountBalance: number;
    closingAccountBalance: number;
    openingHoldingsValue: number;
    closingHoldingsValue: number;
    totalIn: number;
    totalOut: number;
    profit: number;
  }>> {
    try {
      const now = new Date();
      const monthlyData: Array<{
        month: string;
        openingAccountBalance: number;
        closingAccountBalance: number;
        openingHoldingsValue: number;
        closingHoldingsValue: number;
        totalIn: number;
        totalOut: number;
        profit: number;
      }> = [];

      // 生成过去24个月的日期范围
      for (let i = 23; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

        // 计算截止日期：当月使用当前日期，历史月份使用月末日期
        let endDate: string;
        if (i === 0) {
          // 当月使用当前日期
          const today = new Date();
          endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        } else {
          // 历史月份使用月末日期
          const lastDay = new Date(year, month, 0).getDate();
          endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }

        // 计算该月的盈亏统计
        const stats = await this.getProfitStatistics(startDate, endDate);

        monthlyData.push({
          month: `${year}-${String(month).padStart(2, '0')}`,
          openingAccountBalance: stats.openingAccountBalance,
          closingAccountBalance: stats.closingAccountBalance,
          openingHoldingsValue: stats.openingHoldingsValue,
          closingHoldingsValue: stats.closingHoldingsValue,
          totalIn: stats.totalIn,
          totalOut: stats.totalOut,
          profit: stats.profit,
        });
      }

      log.info(`获取月度盈亏数据成功，共${monthlyData.length}个月`);
      return monthlyData;
    } catch (error) {
      log.error('getMonthlyProfitData error:', error);
      throw error;
    }
  }

  /**
   * 获取当前资金概览
   * 包含当前账户余额、当前持仓总市值和总资产
   * @returns 资金概览数据
   */
  async getFundOverview(): Promise<{
    currentAccountBalance: number;
    currentHoldingsMarketValue: number;
    totalAssets: number;
  }> {
    try {
      // 1. 获取当前账户余额（最后一条transfer_records的account_balance）
      const currentAccountBalance = await this.getAccountBalance();

      // 2. 获取当前所有持仓股票（holding_count > 0）
      const positionsResult = this.db.exec(`
        SELECT t1.stock_code, t1.stock_name, t1.holding_count
        FROM trade_record t1
        INNER JOIN (
          SELECT stock_code, MAX(trade_date) as max_date
          FROM trade_record
          GROUP BY stock_code
        ) t2 ON t1.stock_code = t2.stock_code AND t1.trade_date = t2.max_date
        WHERE t1.holding_count > 0
      `);

      let currentHoldingsMarketValue = 0;

      if (positionsResult.length > 0 && positionsResult[0].values.length > 0) {
        for (const row of positionsResult[0].values) {
          const stockCode = row[0] as string;
          const holdingCount = row[2] as number;

          // 获取该股票最新的收盘价（从kline_data表）
          const klineResult = this.db.exec(`
            SELECT close FROM kline_data
            WHERE stock_code = ? AND close IS NOT NULL
            ORDER BY trade_date DESC LIMIT 1
          `, [stockCode]);

          if (klineResult.length > 0 && klineResult[0].values.length > 0) {
            const closePrice = klineResult[0].values[0][0] as number;
            currentHoldingsMarketValue += closePrice * holdingCount;
          }
        }
      }

      // 3. 计算总资产
      const totalAssets = currentAccountBalance + currentHoldingsMarketValue;

      log.info(`获取资金概览成功，账户余额: ${currentAccountBalance}, 持仓市值: ${currentHoldingsMarketValue}, 总资产: ${totalAssets}`);

      return {
        currentAccountBalance: Number(currentAccountBalance.toFixed(2)),
        currentHoldingsMarketValue: Number(currentHoldingsMarketValue.toFixed(2)),
        totalAssets: Number(totalAssets.toFixed(2)),
      };
    } catch (error) {
      log.error('getFundOverview error:', error);
      throw error;
    }
  }

  /**
   * 获取过去60个月的月度资金数据
   * 对每个月计算月末账户余额和月末持仓市值
   * 缺失数据使用前值填充
   * @returns 月度资金数据数组（按月份升序排列）
   */
  async getMonthlyFundData(): Promise<
    Array<{
      month: string;
      endOfMonthAccountBalance: number;
      endOfMonthHoldingsMarketValue: number;
      endOfMonthTotalAssets: number;
    }>
  > {
    try {
      const now = new Date();
      const monthlyData: Array<{
        month: string;
        endOfMonthAccountBalance: number;
        endOfMonthHoldingsMarketValue: number;
        endOfMonthTotalAssets: number;
      }> = [];

      // 用于前值填充的变量
      let lastAccountBalance = 0;
      let lastHoldingsMarketValue = 0;

      // 生成过去60个月的日期范围（从最早到最近）
      for (let i = 59; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;

        // 计算截止日期：当月使用当前日期，历史月份使用月末日期
        let endDate: string;
        if (i === 0) {
          // 当月使用当前日期
          const today = new Date();
          endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        } else {
          // 历史月份使用月末日期
          const lastDay = new Date(year, month, 0).getDate();
          endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }

        // 获取月末账户余额（截止月末最后一天最近记录的account_balance）
        let endOfMonthAccountBalance = 0;
        let hasAccountBalanceData = false; // 标记是否有数据
        try {
          const balanceResult = this.db.exec(
            `SELECT account_balance FROM transfer_records WHERE transfer_date <= ? ORDER BY transfer_date DESC, id DESC LIMIT 1`,
            [endDate]
          );
          if (balanceResult.length > 0 && balanceResult[0].values.length > 0) {
            endOfMonthAccountBalance = balanceResult[0].values[0][0] as number;
            hasAccountBalanceData = true; // 有数据记录
          }
        } catch (error) {
          log.error(`获取${monthStr}账户余额失败:`, error);
        }

        // 获取月末持仓市值
        let endOfMonthHoldingsMarketValue = 0;
        let hasHoldingsData = false; // 标记是否有数据
        try {
          const holdingsResult = await this.getHoldingsMarketValue(endDate);
          endOfMonthHoldingsMarketValue = holdingsResult.marketValue;
          hasHoldingsData = true; // 有数据记录
        } catch (error) {
          log.error(`获取${monthStr}持仓市值失败:`, error);
        }

        // 前值填充逻辑：仅在没有数据时才使用前值填充
        // 如果有数据但值为0，应该显示0（这是用户的真实余额）
        if (!hasAccountBalanceData && lastAccountBalance !== 0) {
          endOfMonthAccountBalance = lastAccountBalance;
        }
        if (!hasHoldingsData && lastHoldingsMarketValue !== 0) {
          endOfMonthHoldingsMarketValue = lastHoldingsMarketValue;
        }

        // 更新前值记录（无论值是0还是其他值，只要有数据就更新）
        if (hasAccountBalanceData) {
          lastAccountBalance = endOfMonthAccountBalance;
        }
        if (hasHoldingsData) {
          lastHoldingsMarketValue = endOfMonthHoldingsMarketValue;
        }

        // 计算月末总资产
        const endOfMonthTotalAssets = endOfMonthAccountBalance + endOfMonthHoldingsMarketValue;

        monthlyData.push({
          month: monthStr,
          endOfMonthAccountBalance: Number(endOfMonthAccountBalance.toFixed(2)),
          endOfMonthHoldingsMarketValue: Number(endOfMonthHoldingsMarketValue.toFixed(2)),
          endOfMonthTotalAssets: Number(endOfMonthTotalAssets.toFixed(2)),
        });
      }

      log.info(`获取月度资金数据成功，共${monthlyData.length}个月`);
      return monthlyData;
    } catch (error) {
      log.error('getMonthlyFundData error:', error);
      throw error;
    }
  }
}
