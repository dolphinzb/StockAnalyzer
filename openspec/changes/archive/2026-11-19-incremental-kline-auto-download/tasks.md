## 1. 数据库只读查询

- [x] 1.1 `electron/database.ts` 新增 `getLatestTradeDates(stockCodes: string[], period: KlinePeriod): Map<string, { unadjusted: string | null; adjusted: string | null }>`
- [x] 1.2 实现为单条 SQL：`SELECT stock_code, adjust_type, MAX(trade_date) FROM ${tableOf(period)} WHERE stock_code IN (...) GROUP BY stock_code, adjust_type`，表名必须经 `tableOf()` 取得
- [x] 1.3 返回结果中的 `trade_date` 由 `YYYY-MM-DD` 转为 `YYYYMMDD`；空列表直接返回空 Map，不执行 SQL
- [x] 1.4 查询不接受外部字符串拼接，`stockCodes` 逐个绑定占位符；查询异常向上抛出，由调用方按股票降级处理

## 2. 日期与交易日历工具

- [x] 2.1 `klineDownloadService.ts` 新增 `localDateYmd(date = new Date()): string`，用本地时间拼 `YYYYMMDD`（禁止 `toISOString()`）
- [x] 2.2 新增 `getLastTradingDay(): Promise<string>`：复用 `getTradingCalendar()` 的缓存，取最后一个 `<= 今天` 的日期并转 `YYYYMMDD`
- [x] 2.3 `getLastTradingDay()` 的兜底：日历为空、接口抛错、或最后一条 `< 今天` 时，回退「排除周六周日」规则并 `log.warn`；不得返回过期日历的末条日期
- [x] 2.4 交易日历缓存策略保持现状（应用层同日复用 + SDK 12h TTL），不新增落盘缓存

## 3. 批量下载支持逐只起点

- [x] 3.1 `shared/types/index.ts` 定义批量下载股票项类型（`stockCode` / `stockName` / 可选 `startDate`），`KlineBatchProgressPayload` 增加可选 `startDate` 字段
- [x] 3.2 `downloadBatch()` 签名改为接收该类型，逐只计算 `const from = stock.startDate ?? startDate`
- [x] 3.3 逐只 `from` 需钳制到 `<= endDate`；单只 `from` 格式非法时回退整批 `startDate` 并 `log.warn`，不影响整批
- [x] 3.4 进度回调与日志的区间信息使用逐只 `from`（含 `period`），便于排查
- [x] 3.5 手动批量下载路径（`electron/index.ts` 的 `kline:download-batch`）不传 `startDate`，行为与现状完全一致

## 4. 自动下载改为增量

- [x] 4.1 `performAutoDownload()` 改用 `localDateYmd()` 取「今天」，移除 `toISOString()` 写法
- [x] 4.2 调用 `getLastTradingDay()` 得到 `endDate`；保持现有「非交易日整体跳过」判断不变（`isTradingDay()` 仍是最外层守卫）
- [x] 4.3 按周期查询 `getLatestTradeDates(watchlistCodes, period)`，为每只股票计算 `startDate = earliest(不复权最新日, 前复权最新日)`；两者皆无数据时回退常量 `EARLIEST_START_DATE = '19900101'`（MUST NOT 回退为 `endDate`）
- [x] 4.4 日线批次传入逐只 `startDate`，日志输出每只的实际区间（或区间汇总）
- [x] 4.5 起点计算与查询过程不得抛出中断整批；单只异常降级为 `endDate`

## 5. 周线/月线增量

- [x] 5.1 `refreshRecentPeriodKline()` 删除 `30 * dayMs` / `90 * dayMs` 固定窗口与 `formatDate` 的 UTC 写法
- [x] 5.2 周线、月线分别按各自表的 `MAX(trade_date)` 计算逐只起点（各自无数据时同样回退 `19900101`），终点使用同一 `endDate`
- [x] 5.3 保留「周/月线失败不影响日线成功判定」的现有行为（仅 `log.warn`）
- [x] 5.4 确认当前周期覆盖清理仍由 `saveKlineData` 的 `trade_date >= 当前周期起点` 删除逻辑承担，不在服务层重复实现

## 6. 调度最小间隔保护

- [x] 6.1 `scheduleNextDownload()` 新增 `MIN_LEAD_MS = 2 * 60 * 1000`，把 `now >= target` 判断改为 `now.getTime() + MIN_LEAD_MS >= target.getTime()`
- [x] 6.2 顺延后继续执行既有的周末跳过逻辑，保证落点不在周六/周日
- [x] 6.3 调度日志保留目标时刻与延迟分钟数，便于核对是否发生顺延
- [x] 6.4 不引入「当日已执行」内存标记，不做跨重启去重（本次明确不做）

## 7. 单元测试

- [x] 7.1 新增起点计算测试：两复权取更早、单边缺失、均缺失回退 `19900101`、未来日期钳制
- [x] 7.2 新增 `getLastTradingDay` 测试：交易日、法定假期、周末、日历过期、接口失败回退（mock `getTradingCalendar`）
- [x] 7.3 新增调度最小间隔测试：提前 13 秒触发时目标顺延到次日；正常启动、临近时刻启动、顺延落周末
- [x] 7.4 更新 `tests/unit/klineBatchDownload.test.ts`，适配 `downloadBatch` 入参扩展
- [x] 7.5 `getLatestTradeDates` 用内存库验证：同股不同复权返回各自最新日、无数据返回 null、空入参返回空 Map

## 8. 验证

- [x] 8.1 `npm run test` 全量通过
- [x] 8.2 `npm run typecheck` 无类型错误；`npm run build:electron` 编译通过
- [x] 8.3 在应用内观察一次自动下载日志：确认日线/周线/月线区间为「库内最新日 ~ 最近交易日」，而非固定当日与 30/90 天
- [x] 8.4 复现 2026-11-17 的场景（提前触发）：确认当天只执行一次，日志显示目标顺延到次日
- [x] 8.5 手动单只下载与手动批量下载各执行一次，确认区间仍完全由用户输入决定
- [x] 8.6 取一只库内无数据的自选股执行一次自动下载，确认请求区间为 `19900101 ~ 最近交易日`、数据源未截断（首条记录接近上市日）、耗时与落盘正常

## 9. 启动补跑（15:10 后启动补齐当日缺失）

- [x] 9.1 `isPeriodComplete(latest, endDate)`：不复权与前复权的最新日均 `>= endDate` 才算该股该周期已完成
- [x] 9.2 `collectPendingStocks(stocks, period, endDate)`：逐只分组，已完成的股票不进入下载清单；查询异常时整批按待补处理且只下载终点
- [x] 9.3 `performAutoDownload()` 改为逐周期只下载待补股票；三周期均完整时仅记录「当日 K 线已完整」不发请求
- [x] 9.4 `isPastDailyScheduleTime(now)` + `runStartupCatchUp()`：仅在本地时间 `>= 15:10` 时触发，早于该时刻交由定时任务
- [x] 9.5 `electron/index.ts` 在 `whenReady` 中 `void runStartupCatchUp()`，不阻塞窗口显示
- [x] 9.6 单元测试：完成判定（含单边缺失/落后/未来日期）、待补筛选、启动触发时刻边界
- [x] 9.7 验证：15:10 之后启动，日志出现「日线已完整，跳过下载」/「日线待补 N 只（已完成跳过 M 只）, 区间 …」，且已完成的股票无请求
- [x] 9.8 验证：15:10 之前启动，日志出现「未到每日自动下载时刻（15:10），启动补跑不触发」，当天仅由定时任务执行
