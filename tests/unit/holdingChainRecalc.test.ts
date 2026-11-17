import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs, { type Database } from 'sql.js';

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
import {
  deleteTradeRecord,
  rebuildHoldingChain,
  updateTradeRecord,
  type UpdateTradeInput,
} from '../../electron/database';
import { recalculateBalancesFrom } from '../../electron/services/fundService';
import { calcHoldingPrice, calcStockBuyAmount } from '../../electron/services/tradeService';

let database: Database;

const STOCK_CODE = '000001';

interface ChainRow {
  id: number;
  tradeDate: string;
  holdingCount: number;
  holdingPrice: number;
}

function readChain(): ChainRow[] {
  const result = database.exec(
    `SELECT id, trade_date, holding_count, holding_price FROM trade_record WHERE stock_code = ? ORDER BY trade_date ASC, id ASC`,
    [STOCK_CODE]
  );
  if (result.length === 0) {
    return [];
  }
  return result[0].values.map(row => ({
    id: Number(row[0]),
    tradeDate: String(row[1]),
    holdingCount: Number(row[2]),
    holdingPrice: Number(row[3]),
  }));
}

function readTransfer(tradeRecordId: number): { amount: number; balance: number; date: string } | null {
  const result = database.exec(
    `SELECT amount, account_balance, transfer_date FROM transfer_records WHERE trade_record_id = ?`,
    [tradeRecordId]
  );
  if (result.length === 0) {
    return null;
  }
  const row = result[0].values[0];
  return { amount: Number(row[0]), balance: Number(row[1]), date: String(row[2]) };
}

function transferCount(): number {
  const result = database.exec('SELECT COUNT(*) FROM transfer_records');
  return Number(result[0].values[0][0]);
}

function seed(): void {
  const trades = [
    { id: 1, date: '2026-01-01', price: 10 },
    { id: 2, date: '2026-01-02', price: 12 },
    { id: 3, date: '2026-01-03', price: 14 },
  ];
  for (const trade of trades) {
    database.run(
      `INSERT INTO trade_record (id, stock_code, stock_name, trade_date, trade_type, trade_price, trade_count, holding_count, holding_price)
       VALUES (?, ?, '测试股票', ?, 'BUY', ?, 100, 0, 0)`,
      [trade.id, STOCK_CODE, trade.date, trade.price]
    );
    database.run(
      `INSERT INTO transfer_records (transfer_date, amount, type, account_balance, trade_record_id)
       VALUES (?, ?, 'STOCK_BUY', 0, ?)`,
      [trade.date, calcStockBuyAmount(trade.price, 100, STOCK_CODE), trade.id]
    );
  }
  rebuildHoldingChain(STOCK_CODE, database);
  recalculateBalancesFrom(database, '2026-01-01');
}

function editInput(id: number, overrides: Partial<UpdateTradeInput> = {}): UpdateTradeInput {
  return {
    id,
    stockCode: STOCK_CODE,
    stockName: '测试股票',
    tradeType: 'BUY',
    tradeDate: '2026-01-02',
    tradePrice: 12,
    tradeCount: 100,
    ...overrides,
  };
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  database = new SQL.Database();
  runMigrations(database, { isNewDatabase: true });
  seed();
});

afterEach(() => {
  database.close();
});

describe('编辑交易后重放持仓快照链', () => {
  it('修改中间一笔价格后，该笔及之后全部按新价格递推', () => {
    const before = readChain();
    updateTradeRecord(editInput(2, { tradePrice: 20 }), { skipSave: true, target: database });
    const after = readChain();

    const first = calcHoldingPrice(null, 'BUY', 10, 100, STOCK_CODE);
    const second = calcHoldingPrice(
      { ...before[0], holdingCount: first.holdingCount, holdingPrice: first.holdingPrice } as never,
      'BUY', 20, 100, STOCK_CODE
    );
    const third = calcHoldingPrice(
      { ...after[1], holdingCount: second.holdingCount, holdingPrice: second.holdingPrice } as never,
      'BUY', 14, 100, STOCK_CODE
    );

    expect(after[0].holdingPrice).toBe(before[0].holdingPrice);
    expect(after[1].holdingPrice).toBe(second.holdingPrice);
    expect(after[2].holdingPrice).toBe(third.holdingPrice);
    expect(after[2].holdingCount).toBe(300);
  });

  it('修改买入数量时同步关联明细金额并重算余额链', () => {
    updateTradeRecord(editInput(2, { tradeCount: 200 }), { skipSave: true, target: database });
    const linked = readTransfer(2);
    const expectedAmount = calcStockBuyAmount(12, 200, STOCK_CODE);

    expect(linked?.amount).toBe(expectedAmount);
    expect(transferCount()).toBe(3);
    const last = readTransfer(3);
    const first = readTransfer(1);
    expect(last?.balance).toBe(
      Number((-((first?.amount ?? 0) + expectedAmount + calcStockBuyAmount(14, 100, STOCK_CODE))).toFixed(2))
    );
  });

  it('把交易日期改到更早时按新顺序重放全链', () => {
    const before = readChain();
    updateTradeRecord(editInput(3, { tradeDate: '2025-12-31', tradePrice: 14 }), {
      skipSave: true,
      target: database,
    });
    const after = readChain();

    expect(after[0].id).toBe(3);
    expect(after[0].tradeDate).toBe('2025-12-31');
    // 原本的第一笔现在变成第二笔，快照必须基于新前序重新计算
    expect(after[1].id).toBe(1);
    expect(after[1].holdingPrice).not.toBe(before[0].holdingPrice);
    expect(after[2].holdingCount).toBe(300);
  });
});

describe('删除交易后重放持仓链与资金余额链', () => {
  it('删除中间一笔后，剩余记录与关联明细全部重算', () => {
    deleteTradeRecord(2, { skipSave: true, target: database });

    const chain = readChain();
    expect(chain).toHaveLength(2);
    expect(chain[1].holdingCount).toBe(200);
    expect(transferCount()).toBe(2);
    expect(readTransfer(2)).toBeNull();

    const first = calcHoldingPrice(null, 'BUY', 10, 100, STOCK_CODE);
    const third = calcHoldingPrice(
      { ...chain[0], holdingCount: first.holdingCount, holdingPrice: first.holdingPrice } as never,
      'BUY', 14, 100, STOCK_CODE
    );
    expect(chain[1].holdingPrice).toBe(third.holdingPrice);

    const last = readTransfer(3);
    const firstTransfer = readTransfer(1);
    expect(last?.balance).toBe(
      Number((-((firstTransfer?.amount ?? 0) + calcStockBuyAmount(14, 100, STOCK_CODE))).toFixed(2))
    );
  });

  it('删除最后一笔后持仓快照回到该笔之前状态', () => {
    deleteTradeRecord(3, { skipSave: true, target: database });
    const chain = readChain();
    expect(chain).toHaveLength(2);
    expect(chain[1].holdingCount).toBe(200);
    expect(transferCount()).toBe(2);
  });
});
