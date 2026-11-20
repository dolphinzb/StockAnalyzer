/**
 * 主进程 IPC 入参运行时校验
 *
 * 本模块刻意不依赖 electron / electron-log：全部导出都是纯函数或可注入依赖的包装器，
 * 便于在 vitest 的 node 环境里直接做契约测试。TypeScript 类型只在编译期有效，
 * 渲染进程传来的值必须在主进程入口处重新校验。
 */

import type { IpcValidationErrorResult } from '../shared/types';

export interface IpcLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

/** 参数校验失败，携带失败字段名，便于统一错误结构与日志定位 */
export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export type Validator<T = unknown> = (value: unknown) => T;
export type IpcRegister = (
  channel: string,
  listener: (event: unknown, ...args: unknown[]) => unknown
) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 各通道参数形态不同，包装层只能透传后由 handler 自行声明类型
export type IpcHandler = (event: unknown, ...args: any[]) => unknown;

function fail(field: string, reason: string): never {
  throw new ValidationError(field, `${field}: ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface StringOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
}

export interface NumberOptions {
  min?: number;
  max?: number;
  integer?: boolean;
  positive?: boolean;
}

export interface ArrayOptions {
  minLength?: number;
  maxLength?: number;
}

export const v = {
  string: (field: string, opts: StringOptions = {}): Validator<string> => (value) => {
    if (typeof value !== 'string') {
      fail(field, '必须是字符串');
    }
    const text = value as string;
    if (!opts.allowEmpty && text.trim().length === 0) {
      fail(field, '不能为空');
    }
    if (opts.minLength !== undefined && text.length < opts.minLength) {
      fail(field, `长度不能小于 ${opts.minLength}`);
    }
    if (opts.maxLength !== undefined && text.length > opts.maxLength) {
      fail(field, `长度不能大于 ${opts.maxLength}`);
    }
    if (opts.pattern && !opts.pattern.test(text)) {
      fail(field, '格式不合法');
    }
    return text;
  },

  number: (field: string, opts: NumberOptions = {}): Validator<number> => (value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(field, '必须是有限数字');
    }
    const num = value as number;
    if (opts.integer && !Number.isInteger(num)) {
      fail(field, '必须是整数');
    }
    if (opts.positive && num <= 0) {
      fail(field, '必须大于 0');
    }
    if (opts.min !== undefined && num < opts.min) {
      fail(field, `不能小于 ${opts.min}`);
    }
    if (opts.max !== undefined && num > opts.max) {
      fail(field, `不能大于 ${opts.max}`);
    }
    return num;
  },

  enumOf: (field: string, allowed: readonly string[]): Validator<string> => (value) => {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      fail(field, `必须是 ${allowed.map(item => item === '' ? '""' : item).join(' / ')} 之一`);
    }
    return value as string;
  },

  /** 日期格式校验：默认 YYYY-MM-DD，K线入参用 YYYYMMDD */
  date: (field: string, format: 'YYYY-MM-DD' | 'YYYYMMDD' = 'YYYY-MM-DD'): Validator<string> => (value) => {
    if (typeof value !== 'string') {
      fail(field, '必须是日期字符串');
    }
    const text = value as string;
    const pattern = format === 'YYYYMMDD' ? /^\d{8}$/ : /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(text)) {
      fail(field, `格式必须为 ${format}`);
    }
    const iso = format === 'YYYYMMDD'
      ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
      : text;
    const parsed = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
      fail(field, '不是有效日期');
    }
    return text;
  },

  /** 对象按 shape 逐字段校验；未列出的字段原样保留，避免破坏既有调用 */
  object: (field: string, shape: Record<string, Validator>): Validator<Record<string, unknown>> => (value) => {
    if (!isPlainObject(value)) {
      fail(field, '必须是对象');
    }
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = { ...source };
    for (const [key, validator] of Object.entries(shape)) {
      result[key] = validator(source[key]);
    }
    return result;
  },

  arrayOf: (field: string, item: Validator, opts: ArrayOptions = {}): Validator<unknown[]> => (value) => {
    if (!Array.isArray(value)) {
      fail(field, '必须是数组');
    }
    const list = value as unknown[];
    if (opts.minLength !== undefined && list.length < opts.minLength) {
      fail(field, `至少需要 ${opts.minLength} 项`);
    }
    if (opts.maxLength !== undefined && list.length > opts.maxLength) {
      fail(field, `最多允许 ${opts.maxLength} 项`);
    }
    return list.map(entry => item(entry));
  },

  /** 允许缺省；缺省时返回 fallback，不做额外校验 */
  optional: <T>(inner: Validator<T>, fallback: T | undefined): Validator<T | undefined> => (value) =>
    value === undefined || value === null ? fallback : inner(value),

  /** 不校验具体类型，仅用于既有 UI 可能传多种形态的可选字段 */
  unknown: (): Validator<unknown> => (value) => value,
};

/** 校验参数列表，返回归一化后的参数；失败抛 ValidationError */
export function validateArgs(
  channel: string,
  schema: readonly Validator[],
  args: readonly unknown[]
): unknown[] {
  void channel;
  return schema.map((validator, index) => validator(args[index]));
}

/** 统一的结构化校验错误，日志只记录通道与字段、不记录原始参数值 */
export function toIpcError(channel: string, error: ValidationError): IpcValidationErrorResult {
  return {
    success: false,
    code: 'INVALID_INPUT',
    channel,
    field: error.field,
    message: error.message,
  };
}

/**
 * 包装 ipcMain.handle：先校验再执行业务逻辑。
 * register 由调用方注入，使本模块在测试环境无需 electron 运行时。
 */
export function validatedHandle(
  register: IpcRegister,
  channel: string,
  schema: readonly Validator[],
  handler: IpcHandler,
  logger: IpcLogger = console
): void {
  register(channel, (event: unknown, ...args: unknown[]) => {
    let validated: unknown[];
    try {
      validated = validateArgs(channel, schema, args);
    } catch (error) {
      if (error instanceof ValidationError) {
        logger.warn('[IPC] 参数校验失败', { channel, field: error.field, code: 'INVALID_INPUT' });
        return toIpcError(channel, error);
      }
      throw error;
    }
    return handler(event, ...validated);
  });
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const TRADE_TYPES = ['BUY', 'SELL', 'DIVIDEND'] as const;
const TRANSFER_TYPES = ['IN', 'OUT', 'DIVIDEND', 'DIVIDEND_TAX', 'STOCK_BUY', 'STOCK_SELL', 'INTEREST'] as const;
const API_PROVIDERS = ['sina', 'eastmoney', 'tencent'] as const;
const KLINE_PERIODS = ['d', 'w', 'm'] as const;
const ADJUST_TYPES = ['', 'qfq'] as const;

const appConfigValidator = v.object('config', {
  trading: v.object('config.trading', {
    morningStart: v.string('config.trading.morningStart', { pattern: TIME_PATTERN }),
    morningEnd: v.string('config.trading.morningEnd', { pattern: TIME_PATTERN }),
    afternoonStart: v.string('config.trading.afternoonStart', { pattern: TIME_PATTERN }),
    afternoonEnd: v.string('config.trading.afternoonEnd', { pattern: TIME_PATTERN }),
  }),
  polling: v.object('config.polling', {
    interval: v.number('config.polling.interval', { min: 0.1, max: 3600 }),
  }),
  api: v.object('config.api', {
    provider: v.enumOf('config.api.provider', API_PROVIDERS),
    // 该值由主进程按 provider 派生、不参与落盘，故允许空串（仅结构兼容）
    url: v.string('config.api.url', { allowEmpty: true }),
  }),
});

const tradeInputShape: Record<string, Validator> = {
  stockCode: v.string('input.stockCode', { minLength: 1, maxLength: 32 }),
  stockName: v.string('input.stockName', { minLength: 1, maxLength: 64 }),
  tradeType: v.enumOf('input.tradeType', TRADE_TYPES),
  tradeDate: v.date('input.tradeDate'),
  tradePrice: v.number('input.tradePrice', { min: 0 }),
  tradeCount: v.number('input.tradeCount'),
};

/** 各通道的入参 schema，顺序与 ipcRenderer.invoke 的参数顺序一致 */
export const SCHEMAS = {
  configSet: [appConfigValidator],
  positionGetRecords: [
    v.string('stockCode', { minLength: 1, maxLength: 32 }),
    v.optional(v.number('page', { integer: true, min: 1 }), 1),
    v.optional(v.number('pageSize', { integer: true, min: 1, max: 100 }), 20),
  ],
  positionAddRecord: [v.object('input', tradeInputShape)],
  positionUpdateRecord: [
    v.object('input', {
      ...tradeInputShape,
      id: v.number('input.id', { integer: true, min: 1 }),
    }),
  ],
  positionDeleteRecord: [v.number('id', { integer: true, min: 1 })],
  getTransferRecords: [
    v.optional(v.number('limit', { integer: true, min: 1, max: 100 }), 20),
    v.optional(v.number('offset', { integer: true, min: 0 }), 0),
    v.optional(v.arrayOf('types', v.enumOf('types[]', TRANSFER_TYPES)), undefined),
  ],
  addTransferRecord: [
    v.object('record', {
      transferDate: v.date('record.transferDate'),
      amount: v.number('record.amount', { positive: true }),
      type: v.enumOf('record.type', TRANSFER_TYPES),
      tradeRecordId: v.optional(v.number('record.tradeRecordId', { integer: true, min: 1 }), null),
    }),
  ],
  updateTransferRecord: [
    v.number('id', { integer: true, min: 1 }),
    v.object('data', {
      transferDate: v.optional(v.date('data.transferDate'), undefined),
      amount: v.optional(v.number('data.amount', { positive: true }), undefined),
      type: v.optional(v.enumOf('data.type', TRANSFER_TYPES), undefined),
      accountBalance: v.unknown(),
    }),
  ],
  deleteTransferRecord: [v.number('id', { integer: true, min: 1 })],
  watchlistAdd: [
    v.object('input', {
      // 现有 UI 允许纯数字或带 sh/sz/bj 前缀的代码，这里只约束字符集，避免误拒历史写法
      stockCode: v.string('input.stockCode', { minLength: 1, maxLength: 32, pattern: /^[a-zA-Z0-9]+$/ }),
      stockName: v.string('input.stockName', { minLength: 1, maxLength: 64 }),
      buyThreshold: v.number('input.buyThreshold'),
      sellThreshold: v.number('input.sellThreshold'),
    }),
  ],
  klineGetTradeRecords: [v.string('stockCode', { minLength: 1, maxLength: 32 })],
  klineDownloadBatch: [
    v.object('input', {
      stockCodes: v.arrayOf('input.stockCodes', v.string('stockCodes[]', { minLength: 1 }), { minLength: 1 }),
      startDate: v.date('input.startDate', 'YYYYMMDD'),
      endDate: v.date('input.endDate', 'YYYYMMDD'),
      adjustTypes: v.optional(v.arrayOf('input.adjustTypes', v.enumOf('adjustTypes[]', ADJUST_TYPES)), undefined),
      period: v.optional(v.enumOf('input.period', KLINE_PERIODS), undefined),
    }),
  ],
} satisfies Record<string, readonly Validator[]>;
