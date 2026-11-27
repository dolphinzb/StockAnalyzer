import { describe, expect, it, vi } from 'vitest';
import {
  SCHEMAS,
  validatedHandle,
  type IpcHandler,
  type IpcRegister,
  type Validator,
} from '../../electron/ipcValidation';

interface ChannelCase {
  channel: string;
  schema: readonly Validator[];
  badArgs: unknown[];
  goodArgs: unknown[];
}

const tradeInput = {
  stockCode: '000001',
  stockName: '测试股票',
  tradeType: 'BUY',
  tradeDate: '2026-01-01',
  tradePrice: 10,
  tradeCount: 100,
};

const cases: ChannelCase[] = [
  {
    channel: 'config:set',
    schema: SCHEMAS.configSet,
    badArgs: [{}],
    goodArgs: [{
      trading: { morningStart: '09:30', morningEnd: '11:30', afternoonStart: '13:00', afternoonEnd: '15:00' },
      polling: { interval: 1 },
      api: { provider: 'sina', url: 'https://hq.sinajs.cn/list=' },
    }],
  },
  {
    channel: 'position:get-records',
    schema: SCHEMAS.positionGetRecords,
    badArgs: ['000001', 1, -1],
    goodArgs: ['000001', 1, 20],
  },
  {
    channel: 'position:add-record',
    schema: SCHEMAS.positionAddRecord,
    badArgs: [{ ...tradeInput, tradeType: 'MERGE' }],
    goodArgs: [tradeInput],
  },
  {
    channel: 'position:update-record',
    schema: SCHEMAS.positionUpdateRecord,
    badArgs: [{ ...tradeInput, id: 0 }],
    goodArgs: [{ ...tradeInput, id: 1 }],
  },
  {
    channel: 'position:delete-record',
    schema: SCHEMAS.positionDeleteRecord,
    badArgs: ['1'],
    goodArgs: [1],
  },
  {
    channel: 'get-transfer-records',
    schema: SCHEMAS.getTransferRecords,
    badArgs: ['20', 0],
    goodArgs: [20, 0],
  },
  {
    channel: 'add-transfer-record',
    schema: SCHEMAS.addTransferRecord,
    badArgs: [{ transferDate: '2026-01-01', amount: -1, type: 'IN' }],
    goodArgs: [{ transferDate: '2026-01-01', amount: 100, type: 'IN' }],
  },
  {
    channel: 'update-transfer-record',
    schema: SCHEMAS.updateTransferRecord,
    badArgs: [1, { amount: 'many' }],
    goodArgs: [1, { amount: 200 }],
  },
  {
    channel: 'delete-transfer-record',
    schema: SCHEMAS.deleteTransferRecord,
    badArgs: [0],
    goodArgs: [1],
  },
  {
    channel: 'watchlist:add',
    schema: SCHEMAS.watchlistAdd,
    badArgs: [{ stockCode: '', stockName: '测试', buyThreshold: 1, sellThreshold: 2 }],
    goodArgs: [{ stockCode: '000001', stockName: '测试', buyThreshold: 1, sellThreshold: 2 }],
  },
  {
    channel: 'kline:get-trade-records',
    schema: SCHEMAS.klineGetTradeRecords,
    badArgs: [123],
    goodArgs: ['000001'],
  },
  {
    channel: 'kline:download-batch',
    schema: SCHEMAS.klineDownloadBatch,
    badArgs: [undefined],
    goodArgs: [{ stockCodes: ['000001'], startDate: '20260101', endDate: '20261114', periods: ['d', 'w'] }],
  },
];

function invokeFor(testCase: ChannelCase, handler: IpcHandler) {
  let listener: ((event: unknown, ...args: unknown[]) => unknown) | null = null;
  const register: IpcRegister = (_channel, fn) => {
    listener = fn;
  };
  validatedHandle(register, testCase.channel, testCase.schema, handler, { warn: () => undefined });
  return (...args: unknown[]) => (listener as (event: unknown, ...a: unknown[]) => unknown)(null, ...args);
}

describe('已接入校验的通道契约', () => {
  it.each(cases)('$channel 非法入参返回统一错误且不执行业务逻辑', (testCase) => {
    const handler = vi.fn(() => 'business-ran');
    const invoke = invokeFor(testCase, handler as IpcHandler);

    const result = invoke(...testCase.badArgs) as Record<string, unknown>;
    expect(result).toMatchObject({
      success: false,
      code: 'INVALID_INPUT',
      channel: testCase.channel,
    });
    expect(typeof result.field).toBe('string');
    expect(typeof result.message).toBe('string');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(cases)('$channel 合法入参正常进入业务逻辑', (testCase) => {
    const handler = vi.fn(() => 'business-ran');
    const invoke = invokeFor(testCase, handler as IpcHandler);

    expect(invoke(...testCase.goodArgs)).toBe('business-ran');
    expect(handler).toHaveBeenCalledOnce();
  });
});
