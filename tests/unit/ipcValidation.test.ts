import { readFileSync } from 'fs';
import { describe, expect, it, vi } from 'vitest';
import {
  SCHEMAS,
  ValidationError,
  v,
  validateArgs,
  validatedHandle,
  type IpcHandler,
  type IpcLogger,
  type IpcRegister,
  type Validator,
} from '../../electron/ipcValidation';

/** 捕获注册进来的 listener，便于直接以任意入参调用 */
function capture(schema: readonly Validator[], handler: IpcHandler, logger?: IpcLogger) {
  let listener: ((event: unknown, ...args: unknown[]) => unknown) | null = null;
  const register: IpcRegister = (_channel, fn) => {
    listener = fn;
  };
  validatedHandle(register, 'demo:channel', schema, handler, logger);
  if (!listener) {
    throw new Error('register 未捕获到 listener');
  }
  return (...args: unknown[]) => (listener as (event: unknown, ...a: unknown[]) => unknown)(null, ...args);
}

describe('IPC 入参校验基础构件', () => {
  it('字符串校验覆盖类型、空值、长度与格式', () => {
    const validator = v.string('code', { minLength: 2, maxLength: 6, pattern: /^[a-z]+$/ });
    expect(validator('abc')).toBe('abc');
    expect(() => validator(123)).toThrow(ValidationError);
    expect(() => validator('')).toThrow(/不能为空/);
    expect(() => validator('a')).toThrow(/长度不能小于/);
    expect(() => validator('abcdefg')).toThrow(/长度不能大于/);
    expect(() => validator('AB1')).toThrow(/格式不合法/);
  });

  it('数字校验覆盖类型、整数、正数与范围边界', () => {
    const validator = v.number('pageSize', { integer: true, min: 1, max: 100 });
    expect(validator(1)).toBe(1);
    expect(validator(100)).toBe(100);
    expect(() => validator('20')).toThrow(ValidationError);
    expect(() => validator(Number.NaN)).toThrow(/必须是有限数字/);
    expect(() => validator(1.5)).toThrow(/必须是整数/);
    expect(() => validator(0)).toThrow(/不能小于/);
    expect(() => validator(101)).toThrow(/不能大于/);
    expect(() => v.number('amount', { positive: true })(0)).toThrow(/必须大于 0/);
  });

  it('枚举值必须在白名单内，空字符串可作为合法复权值', () => {
    expect(v.enumOf('period', ['d', 'w', 'm'])('w')).toBe('w');
    expect(() => v.enumOf('period', ['d'])('x')).toThrow(ValidationError);
    expect(v.enumOf('adjust', ['', 'qfq'])('')).toBe('');
  });

  it('日期校验同时支持 YYYY-MM-DD 与 YYYYMMDD，并拒绝不存在的日期', () => {
    expect(v.date('tradeDate')('2026-11-14')).toBe('2026-11-14');
    expect(v.date('startDate', 'YYYYMMDD')('20261114')).toBe('20261114');
    expect(() => v.date('tradeDate')('2026-02-30')).toThrow(/不是有效日期/);
    expect(() => v.date('startDate', 'YYYYMMDD')('2026-11-14')).toThrow(/格式必须为/);
  });

  it('对象按 shape 递归校验且保留未声明字段', () => {
    const validator = v.object('input', {
      id: v.number('input.id', { integer: true, min: 1 }),
      type: v.enumOf('input.type', ['BUY', 'SELL']),
    });
    expect(validator({ id: 3, type: 'BUY', legacy: true })).toEqual({ id: 3, type: 'BUY', legacy: true });
    expect(() => validator({ id: 0, type: 'BUY' })).toThrow(/input.id/);
    expect(() => validator(null)).toThrow(/必须是对象/);
  });

  it('数组逐项校验并限制长度', () => {
    const validator = v.arrayOf('codes', v.string('codes[]', { minLength: 1 }), { minLength: 1, maxLength: 2 });
    expect(validator(['000001', '600519'])).toEqual(['000001', '600519']);
    expect(() => validator([])).toThrow(/至少需要/);
    expect(() => validator(['a', 'b', 'c'])).toThrow(/最多允许/);
    expect(() => validator('000001')).toThrow(/必须是数组/);
  });

  it('optional 缺省返回 fallback，validateArgs 按位置映射参数', () => {
    const schema: Validator[] = [
      v.string('code'),
      v.optional(v.number('page', { integer: true, min: 1 }), 1),
    ];
    expect(validateArgs('demo', schema, ['000001'])).toEqual(['000001', 1]);
    expect(validateArgs('demo', schema, ['000001', 3])).toEqual(['000001', 3]);
  });
});

describe('validatedHandle 包装器', () => {
  it('合法入参原样交给业务 handler', () => {
    const handler = vi.fn((_event: unknown, code: string, count: number) => `${code}:${count}`);
    const invoke = capture([v.string('code'), v.number('count')], handler as IpcHandler);
    expect(invoke('000001', 10)).toBe('000001:10');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('非法入参返回统一错误结构，且不执行业务逻辑', () => {
    const handler = vi.fn(() => 'should-not-run');
    const warn = vi.fn();
    const invoke = capture([v.number('count', { integer: true, min: 1 })], handler as IpcHandler, { warn });

    const result = invoke('not-a-number') as Record<string, unknown>;
    expect(result).toEqual({
      success: false,
      code: 'INVALID_INPUT',
      channel: 'demo:channel',
      field: 'count',
      message: expect.stringContaining('count'),
    });
    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[IPC] 参数校验失败', {
      channel: 'demo:channel',
      field: 'count',
      code: 'INVALID_INPUT',
    });
    // 日志只记录通道与字段，不得包含原始参数值
    expect(JSON.stringify(warn.mock.calls)).not.toContain('not-a-number');
  });

  it('业务异常继续上抛，不被包装成参数校验错误', () => {
    const handler = () => {
      throw new Error('business failed');
    };
    const invoke = capture([v.string('code')], handler);
    expect(() => invoke('000001')).toThrow('business failed');
  });
});

describe('关键通道 schema', () => {
  it('config:set 拒绝缺字段与非法时段', () => {
    const valid = {
      trading: { morningStart: '09:30', morningEnd: '11:30', afternoonStart: '13:00', afternoonEnd: '15:00' },
      polling: { interval: 1 },
      api: { provider: 'sina', url: 'https://hq.sinajs.cn/list=' },
    };
    expect(() => validateArgs('config:set', SCHEMAS.configSet, [valid])).not.toThrow();
    expect(() => validateArgs('config:set', SCHEMAS.configSet, [{ polling: { interval: 1 } }])).toThrow(/config.trading/);
    expect(() => validateArgs('config:set', SCHEMAS.configSet, [{ ...valid, polling: { interval: 'fast' } }])).toThrow(/config.polling.interval/);
  });

  it('config:set 允许空地址（由服务端派生），但仍拒绝非法 provider', () => {
    const valid = {
      trading: { morningStart: '09:30', morningEnd: '11:30', afternoonStart: '13:00', afternoonEnd: '15:00' },
      polling: { interval: 1 },
      api: { provider: 'sina', url: '' },
    };
    expect(() => validateArgs('config:set', SCHEMAS.configSet, [valid])).not.toThrow();
    expect(() => validateArgs('config:set', SCHEMAS.configSet, [
      { ...valid, api: { provider: 'binance', url: '' } },
    ])).toThrow(/config.api.provider/);
  });

  it('position:get-records 拒绝负数 pageSize 并给缺省值', () => {
    expect(validateArgs('position:get-records', SCHEMAS.positionGetRecords, ['000001'])).toEqual(['000001', 1, 20]);
    expect(() => validateArgs('position:get-records', SCHEMAS.positionGetRecords, ['000001', 1, -1])).toThrow(/pageSize/);
    expect(() => validateArgs('position:get-records', SCHEMAS.positionGetRecords, ['000001', 1, '20'])).toThrow(/pageSize/);
  });

  it('kline:download-batch 入参为空时明确报参数缺失', () => {
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [undefined])).toThrow(/input: 必须是对象/);
    const valid = { stockCodes: ['000001'], startDate: '20260101', endDate: '20261114' };
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [valid])).not.toThrow();
  });

  it('kline:download-batch 的 periods 支持缺省、多元素，并拒绝空数组与非法元素', () => {
    const valid = { stockCodes: ['000001'], startDate: '20260101', endDate: '20261114' };

    // 缺省：不传 periods 视为合法（主进程按日线兜底）
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [valid])).not.toThrow();

    // 合法多元素
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [
      { ...valid, periods: ['d', 'w', 'm'] },
    ])).not.toThrow();

    // 空数组：未选周期，拒绝
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [
      { ...valid, periods: [] },
    ])).toThrow(/input\.periods/);

    // 非法元素（字段名为 periods[]）
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [
      { ...valid, periods: ['d', 'y'] },
    ])).toThrow(/periods/);

    // 超出周期数量上限
    expect(() => validateArgs('kline:download-batch', SCHEMAS.klineDownloadBatch, [
      { ...valid, periods: ['d', 'w', 'm', 'd'] },
    ])).toThrow(/periods/);
  });

  it('watchlist:add 拒绝空代码与非法字符', () => {
    const valid = { stockCode: '600519', stockName: '贵州茅台', buyThreshold: 10, sellThreshold: 20 };
    expect(() => validateArgs('watchlist:add', SCHEMAS.watchlistAdd, [valid])).not.toThrow();
    expect(() => validateArgs('watchlist:add', SCHEMAS.watchlistAdd, [{ ...valid, stockCode: '' }])).toThrow(/input.stockCode/);
    expect(() => validateArgs('watchlist:add', SCHEMAS.watchlistAdd, [{ ...valid, stockCode: 'sh 600519' }])).toThrow(/格式不合法/);
  });
});

describe('校验器职责边界', () => {
  it('不引入任何数据源端点常量或端点查询函数', () => {
    const source = readFileSync(new URL('../../electron/ipcValidation.ts', import.meta.url), 'utf8');

    // 端点派生属于配置归一化层（normalizeApiConfig）的职责，校验器必须保持纯结构校验
    for (const token of ['hq.sinajs.cn', 'push2.eastmoney.com', 'web.sqt.gtimg.cn', 'getQuoteEndpoint']) {
      expect(source).not.toContain(token);
    }
  });
});
