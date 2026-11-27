import { describe, expect, it } from 'vitest';
import { DAILY_RAW_SOURCE } from '../../electron/services/marketDataSyncService';
import { FACTOR_SOURCE } from '../../electron/services/marketRepository';
import { DAILY_KINDS } from '../../electron/services/marketSyncPolicy';

describe('行情库数据源标识', () => {
  it('使用搜狐原始日线与本地推导因子来源', () => {
    expect(DAILY_RAW_SOURCE).toBe('sohu_hisHq');
    expect(FACTOR_SOURCE).toBe('derived:sohu_hisHq');
  });

  it('一只证券只生成一个日线任务', () => {
    expect(DAILY_KINDS).toEqual(['raw_daily']);
  });
});
