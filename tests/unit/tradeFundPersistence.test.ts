import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '', getAppPath: () => '' },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock('electron-log', () => ({
  default: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import { runMigrations } from '../../electron/migrations';
import { addTradeRecord, runInTransaction } from '../../electron/database';
import { FundService } from '../../electron/services/fundService';
import { calcStockBuyAmount } from '../../electron/services/tradeService';
import { SqliteDatabase, type DatabaseLike as Database } from '../../electron/sqliteEngine';

let database: Database;
let fundService: FundService;
let tempDir = '';

const tradeInput = {
  stockCode: '000001',
  stockName: '测试股票',
  tradeType: 'BUY' as const,
  tradeDate: '2026-01-01',
  tradePrice: 10,
  tradeCount: 100,
};

function countRows(db: Database, table: string): number {
  const result = db.exec(`SELECT COUNT(*) FROM ${table}`);
  return Number(result[0].values[0][0]);
}

async function writeBatch(): Promise<void> {
  await runInTransaction(async () => {
    const added = addTradeRecord(tradeInput, { target: database });
    await fundService.addTransferRecord({
      transferDate: tradeInput.tradeDate,
      amount: calcStockBuyAmount(tradeInput.tradePrice, tradeInput.tradeCount, tradeInput.stockCode),
      type: 'STOCK_BUY',
      tradeRecordId: added.record.id,
    });
  }, database);
}

beforeEach(async () => {
  database = new SqliteDatabase(':memory:');
  tempDir = mkdtempSync(join(tmpdir(), 'stockanalyzer-fund-'));
  runMigrations(database, { isNewDatabase: true });
  fundService = new FundService(database);
});

afterEach(() => {
  database.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe('交易与资金明细的批次落盘', () => {
  it('批次提交后导出的数据库同时包含交易记录与资金明细', async () => {
    await writeBatch();
    expect(countRows(database, 'trade_record')).toBe(1);
    expect(countRows(database, 'transfer_records')).toBe(1);

    // 模拟落盘后的磁盘文件：把导出字节写成文件后重新打开
    const filePath = join(tempDir, 'restored.db');
    writeFileSync(filePath, Buffer.from(database.export()));
    const reloaded = new SqliteDatabase(filePath);
    expect(countRows(reloaded, 'trade_record')).toBe(1);
    expect(countRows(reloaded, 'transfer_records')).toBe(1);
    reloaded.close();
  });

  it('批次任一步失败时回滚全部写入，不留半态', async () => {
    await expect(
      runInTransaction(async () => {
        const added = addTradeRecord(tradeInput, { target: database });
        await fundService.addTransferRecord({
          transferDate: tradeInput.tradeDate,
          amount: 1005,
          type: 'STOCK_BUY',
          tradeRecordId: added.record.id,
        });
        throw new Error('sync failed');
      }, database)
    ).rejects.toThrow('sync failed');

    expect(countRows(database, 'trade_record')).toBe(0);
    expect(countRows(database, 'transfer_records')).toBe(0);
  });

  it('事务提交后不留下事务标记，可连续执行多个批次', async () => {
    await writeBatch();
    await expect(writeBatch()).resolves.toBeUndefined();
    expect(countRows(database, 'trade_record')).toBe(2);
    expect(countRows(database, 'transfer_records')).toBe(2);
  });
});
