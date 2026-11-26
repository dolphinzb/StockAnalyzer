## 1. 搜狐 K 线客户端骨架

- [x] 1.1 新增 `electron/services/sohuKlineClient.ts`，导出实现 `MarketSdkLike['getHistoryKline']` 的客户端
- [x] 1.2 实现 `sh/sz/bj` 代码到 `cn_` 前缀的转换，并覆盖 ETF/北交所样本
- [x] 1.3 实现 URL 构造：`code/start/end/period=d/order=A/stat=0/rt=json`
- [x] 1.4 实现 GBK 响应解码、JSON 解析、`status !== 0` 与空 `hq` 的失败处理
- [x] 1.5 实现 hq 字段归一化：日期、开高低收、涨跌额、涨跌幅、成交量、成交额、换手率、振幅
- [x] 1.6 实现成交额万元→元换算，并用样本股与东财值回归确认
- [x] 1.7 实现日期升序排序与按日期去重，忽略第 11 字段
- [x] 1.8 单元测试：URL、代码转换、GBK 解码、字段映射、异常状态和 10/11 字段兼容

## 2. 本地复权因子引擎

- [x] 2.1 新增 `electron/services/sohuAdjustment.ts`，实现从搜狐日线推导事件因子的纯函数
- [x] 2.2 实现 `impliedPrevClose = close - changeAmount`，涨跌额不可用时退化为按涨跌幅反推
- [x] 2.3 实现原始前收与反推前收的差异判定，并排除舍入噪声
- [x] 2.4 实现 qfq 因子链：以最新交易日为基准，历史价格逐段累乘事件因子
- [x] 2.5 实现 hfq 因子链：以可得最早交易日为基准，事件后价格逐段除以事件因子
- [x] 2.6 实现价格字段复权，保持成交量/成交额不变，并计算复权口径下的振幅
- [x] 2.7 实现因子缺失或覆盖不完整时回退全历史日线重建因子链
- [x] 2.8 单元测试：现金分红、送股、混合事件、首日、无事件、涨跌额缺失和因子缺失回退

## 3. 混合 marketSdkClient 与请求复用

- [x] 3.1 修改 `marketSdkClient.ts`，非 K 线方法继续委托 `StockSDK`
- [x] 3.2 将 `getHistoryKline()` 委托给搜狐客户端，保持 `MarketKlineItem[]` 返回类型
- [x] 3.3 实现按 `symbol + startDate + endDate` 的 in-flight 请求缓存，供 raw/qfq/hfq 三条任务复用
- [x] 3.4 为请求缓存设置容量上限、过期清理和失败清理
- [x] 3.5 确认搜狐 K 线失败不回退东财，错误对象携带 URL/代码/复权类型/日期区间/cause
- [x] 3.6 单元测试：`MarketSdkLike` 契约不变、非 K 线方法仍调用 StockSDK、三类 adjust 共享一次 raw 请求
- [x] 3.7 定义只读因子读取器接口并在搜狐客户端中使用；内存缓存缺失时通过注入的读取器获取历史因子，并补单元测试

## 4. 同步服务 wiring 与数据源标识

- [x] 4.1 将 `DAILY_RAW_SOURCE` 改为 `sohu_hisHq`
- [x] 4.2 在 `getMarketSyncService()` 中构造混合 K 线客户端，并保留 `meta.sync_rps` 对 StockSDK 元数据请求的限流透传
- [x] 4.3 保持 `DAILY_KINDS`、任务键、`last_success_date`、全量/增量互斥和失败重试逻辑不变
- [x] 4.4 单元测试：构造参数与来源标识正确，任务元数据未被改变
- [x] 4.5 将 `FACTOR_SOURCE` 改为 `derived:sohu_hisHq`，并在 `getMarketSyncService()` 中注入 `readAdjustFactors(db, code)` 作为只读因子读取器

## 5. 全量与增量行为验证

- [x] 5.1 验证全量回填时三类日线任务共享一次搜狐 raw 请求，并写出 raw/qfq/hfq 对应数据
- [x] 5.2 验证增量下载时 raw 任务只请求增量区间
- [x] 5.3 验证 qfq/hfq 增量优先复用当前进程因子缓存
- [x] 5.4 验证进程重启后可从 `adjust_factors` 读取历史因子
- [x] 5.5 验证因子缺失或覆盖不完整时回退全历史日线重建
- [x] 5.6 验证增量区间发生除权除息时，现有 qfq 全历史重标定流程仍可正常工作
- [x] 5.7 验证质量异常仍只记录不阻断导入
- [x] 5.8 验证 `kline_daily_raw.source = sohu_hisHq` 且 `adjust_factors.source = derived:sohu_hisHq`

## 6. 迁移与验收

- [ ] 6.1 使用 20～50 只股票执行小样本全量回填，检查任务成功率、耗时和 `source=sohu_hisHq`
- [x] 6.2 抽样对比搜狐与东财 raw 字段，确认成交额单位换算和涨跌额/涨跌幅口径
- [ ] 6.3 选取含分红/送除权的股票，确认因子跳变日与真实除权除息日一致
- [ ] 6.4 执行增量补跑，确认 `last_success_date` 推进且未完成时仍拒绝增量
- [ ] 6.5 观察小样本回填期间的 429/断连，记录并必要时调整 `meta.sync_rps`
- [ ] 6.6 回归自选股手动下载、每日自动下载、图表、资金估值和形态识别，确认读取路径未切换
- [ ] 6.7 输出验收记录，说明旧东财数据需重新全量回填且不得混用

## 7. 默认限速参数

- [x] 7.1 将默认并发保持为 10、默认 RPS 改为 3（333ms 间隔），并同步 SDK 内部限流、规格与单元测试
- [x] 7.2 将搜狐 `status=2 / non-existent` 响应视为空数据，不进入失败重试
- [x] 7.3 将同步调度从滑动窗口改为 333ms 最小间隔匀速限流器，并补单元测试
