## 1. 共享识别逻辑

- [x] 1.1 新建 `shared/utils/securities.ts`，导出 `isFund(stockCode)`，正则 `/^(5[01268]|1[568])/`，覆盖上交所 `50/51/52/56/58`、深交所 `15/16/18` 基金前缀
- [x] 1.2 `src/utils/formatPrice.ts` 改为从 `shared/utils/securities` 引入 `isFund`，移除本地重复定义
- [x] 1.3 `electron/services/klineDownloadService.ts` 改为从 `shared/utils/securities` 引入 `isFund`，移除本地重复正则（同时补全 `56/58` 前缀下载支持）

## 2. ETF 费用计算

- [x] 2.1 `electron/services/tradeService.ts` 引入 `isFund`；`calcStockBuyAmount` 对 ETF 仅计佣金（免最低 5 元）、免过户费
- [x] 2.2 `calcStockSellAmount` 对 ETF 仅计佣金（免最低 5 元）、免印花税、免过户费
- [x] 2.3 `calcHoldingPrice` 对 ETF：佣金免最低 5 元、买入/卖出加权均价不含过户费与印花税（`tax=0`）；股票分支行为不变
- [x] 2.4 确认 `calcDividendTax` 对 ETF 仍按差别化红利税计征，无需改动

## 3. 验证与回归

- [x] 3.1 运行 `tsc -p tsconfig.node.json` 确认主进程与 shared 类型检查通过
- [x] 3.2 校验资金明细同步（`position:add-record`）ETF 的 `STOCK_BUY`/`STOCK_SELL` 金额按新规则写入
- [x] 3.3 人工核对 ETF 与股票买卖金额/持仓成本差异符合预期（可对比一例 510300 与 600519）
