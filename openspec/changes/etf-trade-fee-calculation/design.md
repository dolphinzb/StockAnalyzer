## Context

- 当前交易费用计算集中在 `electron/services/tradeService.ts` 的 `calcHoldingPrice` / `calcStockBuyAmount` / `calcStockSellAmount`，对股票和 ETF 一视同仁地收取三项费用：佣金（`TRADE_FEE_RATE=0.0003`，最低 5 元）、过户费（`TRANSFER_FEE_RATE=0.00001`，双向）、印花税（卖出 `0.0005`）。
- 交易记录按 `stockCode` 录入（`trade_record` 表无证券类型字段），ETF 代码（如 `510300`、`588000`）本身已可录入，但费用按股票口径算错。
- 价格展示精度已有 `isFund` 识别（`src/utils/formatPrice.ts`），但 `isFund` 逻辑在 `formatPrice.ts` 与 `electron/services/klineDownloadService.ts` 两处重复，且后者漏掉了 `56/58` 前缀的 ETF。

## Goals / Non-Goals

**Goals:**
- ETF 买入/卖出仅收佣金（免最低 5 元）、免过户费、免印花税。
- ETF 持仓成本（`holding_price`）同步正确（加权均价仅含佣金）。
- 将 `isFund` 收敛为单一来源 `shared/utils/securities.ts`，供交易计算、价格展示、K 线下载复用，并补全 `56/58` 等 ETF 前缀。

**Non-Goals:**
- 不修改数据库结构（不改 `trade_record`）。
- 不处理债券、期货、可转债等其他证券类型。
- 不回填历史 ETF 记录的 `holding_price`（向后兼容，旧口径保留）。
- 不新增可配置费率 UI（沿用现有常量；ETF 最低佣金固定为 0）。

## Decisions

### Decision 1: 按代码前缀自动识别 ETF，不加字段
**选择**：复用 `isFund(stockCode)` 前缀识别，不在 `trade_record` 新增类型字段。
**理由**：与既有价格精度方案（`formatPrice` 亦按前缀判断）一致，零数据迁移，录入 UI 无需改动。
**备选**：在 `trade_record` 新增 `security_type` 字段——需 DB 迁移与历史数据补全，被否决。

### Decision 2: `isFund` 单一来源放 `shared/utils/securities.ts`
**选择**：新建 `shared/utils/securities.ts` 导出 `isFund`，正则 `/^(5[01268]|1[568])/`，覆盖上交所 `50/51/52/56/58`、深交所 `15/16/18` 基金前缀；`formatPrice.ts` 与 `klineDownloadService.ts` 改为引用它。
**理由**：消除三处重复、统一口径，且 `shared` 同时被主进程与渲染进程引用，无需新增跨进程通信。
**备选**：在各模块内各自维护正则——已存在漂移（klineDownloadService 漏 `56/58`），否决。

### Decision 3: ETF 佣金免最低 5 元
**选择**：`commissionMin = isFund ? 0 : MIN_FEE`，即 ETF 佣金按 `交易金额 × TRADE_FEE_RATE` 实收，不受 5 元下限约束。
**理由**：用户已确认"免 5（推荐）"，符合多数券商 ETF 政策。
**备选**：保留 5 元下限——用户已否决。

### Decision 4: 分支内置于 calc 函数
**选择**：在 `calcHoldingPrice` / `calcStockBuyAmount` / `calcStockSellAmount` 内部以 `if (isFund)` 分支处理，调用方（`database.addTradeRecord`、`electron/index.ts` 的 `position:add-record`）保持不变。
**理由**：改动局部、风险低，对外接口与资金明细同步逻辑不变。

## Risks / Trade-offs

- **[Risk] 历史 ETF 记录 `holding_price` 仍为旧口径** → 不影响新计算；如需一致可在数据管理页触发重算（本期不做，向后兼容）。
- **[Risk] `isFund` 前缀漏判新型基金代码** → 默认按股票计（多收印花/过户），仅费用略偏高，可在 `isFund` 补前缀修复。
- **[Trade-off] "免 5" 为多数券商政策** → 少数券商 ETF 仍收 5 元；本期按用户选择固定为 0，后续如需可参数化。

## Migration Plan

- 纯计算逻辑变更，无 DB 迁移。部署后新录入的 ETF 交易即按新规则计算。
- 回滚：还原 `tradeService.ts` 与 `shared/utils/securities.ts` 即可；历史记录不受影响（仍为当时计算口径）。

## Open Questions

- 是否需要对历史 ETF 记录提供"一键重算持仓成本"功能？**已决策：不做。** 历史 ETF 记录保持录入时口径，新记录按新规则计算，向后兼容，不强制回填。
