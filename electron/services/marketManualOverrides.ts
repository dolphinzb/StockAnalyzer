/**
 * 人工维护的证券清单
 *
 * 用途（见 design D6/D11）：
 * - 交易所官方名录与退市清单都无法覆盖时，用人工清单补充，优先级最高
 * - 北交所暂无稳定公开退市清单，退市标的通过 `BSE_DELISTED_FALLBACK` 静态兜底
 *
 * 约束：不得编造代码、名称或日期；无法确认的日期一律留空。
 * 新增条目请填写代码、交易所、简称，并按需填写上市/退市日期。
 */

import type { MarketExchange } from './marketRepository';

/** 人工覆盖的证券条目 */
export interface MarketManualSecurity {
  code: string;
  exchange: MarketExchange;
  name: string;
  listDate?: string | null;
  delistDate?: string | null;
  isActive?: boolean;
}

/** 人工覆盖清单（优先级最高） */
export const MANUAL_SECURITIES: readonly MarketManualSecurity[] = [];

/** 北交所退市静态兜底清单（is_active = 0） */
export const BSE_DELISTED_FALLBACK: readonly MarketManualSecurity[] = [];
