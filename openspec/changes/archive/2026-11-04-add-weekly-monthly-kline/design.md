## Context

当前链路（日线独占）：

- 数据源：`stock-sdk@^1.9.0`，`electron/services/klineDownloadService.ts:171-176` 调用 `sdk.getHistoryKline(code, { period: 'daily', adjust, startDate, endDate })`，周期是唯一硬编码点。
- 存储：单表 `kline_data`（`sql/init.sql:67-93`），唯一键 `(stock_code, trade_date, adjust_type)`，无 `period` 列；写入用 `INSERT OR REPLACE`（`electron/database.ts:616`）。
- 查询：`getKlineData`（`database.ts:687`）、`getChartData`（`database.ts:721`，`WHERE stock_code=? AND adjust_type=?`）。
- 其他只读方：`fundService.ts:598/929` 直接 `SELECT close FROM kline_data` 做持仓估值。
- 展示：`KlineChartDialog.vue` 通过 `window.klineAPI.getChartData(stockCode, adjustType)` 取数；`useKlineChart.ts` 纯 Canvas 手绘，日期轴硬编码 `MM-DD` 切片（`useKlineChart.ts:743-745`），交易标记按 `tradeDate` 精确相等匹配。
- 运行时数据库为 sql.js 单文件（`~/.stockanalyzer/stockanalyzer.db`），**无自动迁移框架**，只有 `scripts/` 下手动脚本；`scripts/init-database.ts` 已有「备份 → DROP → 重建 → 恢复」的先例（该文件 242-345 行，曾用于 `adjust_type` 迁移）。

约束：SQLite 无法修改既有 UNIQUE 约束，只能重建表；重建即意味着「一旦脚本漏字段，用户全部日线历史必须重新下载」。

## Goals / Non-Goals

**Goals:**

- 用三张同构表承载日/周/月 K线，避开对存量 `kline_data` 的重建式迁移。
- 存量日线数据零丢失、零重下，迁移可重复执行（幂等）。
- 周期维度从下载入口贯通到图表展示，默认行为与现状完全一致（不选周期 = 日线）。
- 下游估值/形态检测等逻辑显式绑定日线，杜绝周期串味。

**Non-Goals:**

- 不做 `kline_all` UNION 视图。
- 不新增后复权 `hfq`，仍只支持 `'' | 'qfq'`。
- 不做「日线本地聚合生成周/月线」，周线/月线一律取数据源原生结果。
- 不做多周期并排对比图、不做分钟线。

## Decisions

### D1：三表而非「单表 + period 列」

**决策**：`kline_daily` / `kline_weekly` / `kline_monthly`，三表结构完全一致，各自保留 `UNIQUE(stock_code, trade_date, adjust_type)`。

**理由**：单表方案必须把唯一键改成 `(stock_code, period, trade_date, adjust_type)`，而 SQLite 无法 `ALTER` 约束，只能重建 `kline_data` 并搬数据。三表方案对日线表只做 `ALTER TABLE kline_data RENAME TO kline_daily`（元数据操作，不搬行数据），周/月线是空表新建，风险最低。且单表方案下 `fundService` 等日线专用查询极易漏写 `AND period='d'`，三表从结构上消除了这种错配。

**代价**：schema 存在三份，未来加字段需同步三处；跨周期统计需 `UNION ALL`。以当前 3 处 SQL + 2 处只读的规模，代价可接受。

**替代方案**：单表 + `period` 列 → 需重建表，风险高；三表 + `kline_all` 视图 → 用户明确不做，且视图难以命中全部索引。

### D2：周期标识用 `'d' | 'w' | 'm'`，映射集中在单个常量

```ts
// electron/database.ts（或 shared 常量模块）
export const KLINE_TABLES = { d: 'kline_daily', w: 'kline_weekly', m: 'kline_monthly' } as const;
export type KlinePeriod = keyof typeof KLINE_TABLES;

export function tableOf(period: KlinePeriod): string {
  const table = KLINE_TABLES[period];
  if (!table) throw new Error(`INVALID_PERIOD: 不支持的K线周期 ${String(period)}`);
  return table;
}
```

所有拼 `FROM ${table}` 的 SQL 只能通过 `tableOf()` 获得表名，**IPC 入参必须经过该校验**。单字符 `'d'|'w'|'m'` 与 SDK 的 `daily|weekly|monthly` 之间用一张显式映射表转换，禁止隐式字符串拼接：

```ts
const SDK_PERIODS = { d: 'daily', w: 'weekly', m: 'monthly' } as const;
```

**理由**：三表方案的最大隐患是「表名来自外部字符串」，既可能注入，也可能因传错周期静默查空表返回 `[]` 而不报错，排查成本极高。白名单 + 抛错把错误显性化。

### D3：`KlineData` 不新增 `period` 字段，周期作为查询/下载参数

写入时由调用方指定目标表，读出后数据行本身不含周期信息（表名即周期）。前端在一次性请求内只有一个周期，无需在每条 K 线上冗余周期字段。

**理由**：避免每条记录冗余存储同一常量；`shared/patterns` 的 `PatternContext.candles: KlineData[]` 等既有结构无需改动。**代价**：导出的裸数据脱离表名后不自证周期——由展示层与导出逻辑在表头/元数据中补充，可接受。

### D4：迁移脚本 `scripts/migrate-split-kline-tables.ts`

步骤（全部幂等，可重复执行）：

1. `PRAGMA table_info(kline_data)` 存在且 `kline_daily` 不存在 → 备份数据库文件为 `stockanalyzer.db.bak-<ts>`。
2. `ALTER TABLE kline_data RENAME TO kline_daily`；`DROP INDEX IF EXISTS idx_kline_data_*`。
3. 创建 `kline_weekly`、`kline_monthly`（`IF NOT EXISTS`），三表统一建索引 `idx_kline_<周期>_code`、`..._date`、`..._code_date_adjust`。
4. 校验：`SELECT COUNT(*) FROM kline_daily` 与备份中 `kline_data` 行数一致，不一致则回滚（还原 `.bak`）并报错退出。
5. 已迁移状态（`kline_daily` 存在、`kline_data` 不存在）→ 只补建周/月表与索引，直接跳过。

`scripts/init-database.ts` 中所有写死 `kline_data` 的备份/恢复/字段探测逻辑改为指向 `kline_daily`，并在初始化时确保三表齐备。`sql/init.sql` 同步为三份同构 DDL（由同一段字段清单复制生成，加注释标注「三表结构必须保持一致」）。

### D5：自动下载按周期分层

`performAutoDownload()` 保持「每日 15:10 只下载当日日线」不变（这是持仓估值的刚需）。周线/月线采用**近端覆盖重下**：每次自动任务在日线完成后，额外下载「近 30 天周线」与「近 90 天月线」并 `INSERT OR REPLACE`，用少量冗余请求换取「周/月线最后一根随行情自动修正」，避免周五月末补跑的调度复杂度。

周/月线自动下载失败**不阻塞**日线结果、不计入日线成功判定，仅记日志。

### D6：前端周期切换复用复权切换的「切换 + 空数据回滚」模式

`KlineChartDialog.vue` 现有 `adjustType = ref<'' | 'qfq'>('qfq')` 与 `switchAdjustType()`（L119，含 L131-137 空数据回滚）。周期切换器平行实现为 `period = ref<KlinePeriod>('d')`，默认日线；切换时重新 `getChartData(stockCode, adjustType, period)`，若返回空数组则回滚到原周期并提示「暂无周线数据，请先下载」。

数据请求签名为 `(stockCode, adjustType, period)`，两个维度独立组合，共 6 种。

### D7：日期轴与标记的周期对齐

- 日期轴：`period === 'm'` 时标签取 `tradeDate.slice(0, 7)`（`YYYY-MM`），`d`/`w` 保持 `slice(5, 10)`（`MM-DD`）。周线日期为数据源给出的「该周最后一个交易日」。
- 交易标记：`drawTradeMarkers` 目前用 `k.tradeDate === record.tradeDate`。改为按周期归一化：日线直接比较；周线/月线先把交易日期映射到所属周/月的最后一根 K 线（实现为「在升序序列中取第一个 `k.tradeDate >= record.tradeDate` 的索引」），同一根 K 线上多条交易聚合渲染。
- 形态标记：`shared/patterns` 输入约定为升序日线序列，`patternScan` store 固定请求 `period='d'`，K线图在周/月视图下**不渲染**形态标记，避免跨周期误标。

### D8：持仓估值锁定日线表

`fundService.ts:598/929` 改为显式查询 `kline_daily`，并加注释「估值一律使用日线收盘价，不受图表周期影响」。该文件不引入 `period` 参数。

### D9：批量的周期为单选，默认日期沿用当日

**决策**：单只下载与批量下载的周期选择均为**单选**（互斥的日/周/月三选一），默认日线；日期范围默认值与现状一致，均为「当日」，周线/月线不设专属默认区间。

**理由**：周期单选使每次请求的「周期 × 复权」组合确定唯一，进度呈现与失败归因无需按周期分组聚合，UI 与结果结构都保持简单；沿用当日则让三种周期的下载交互完全一致，用户无需额外理解「为什么周线默认日期不同」。代价是首次下载周线/月线时当日往往返回 0 条，此时按既有「未获取到K线数据」规则判定为失败并提示，由用户自行选择更长的日期范围。

**影响**：`KlineBatchDownloadInput.periods: KlinePeriod[]` 简化为 `period?: KlinePeriod`；`KlineBatchProgressPayload` 与 `KlineBatchStockResult` 只携带单周期信息，`kline:updated` 的 `periods` 仍保留为数组（一次批量任务只含一个元素，兼容单只下载的既有形态）。

### D10：未完成周期用「当前周期覆盖」而不是过滤或日期归一化

**问题（实测确认）**：数据源对未完成周/月返回的 `trade_date` 是最新交易日，而不是周期最后交易日。腾讯接口实测：2026-11-04（周三）取月线，最后一根为 `["2026-11-04", 1410.000, 1471.87, 1480.60, 1395.020, 189114]`；周线最后三根为 `2026-10-23`、`2026-10-30`、`2026-11-04`。东财接口在当前环境不可达（`UND_ERR_SOCKET`，HTTP/HTTPS 全域名均被重置），但同为 `stock-sdk` 的 K 线 provider，行为一致。

由于唯一键是 `(stock_code, trade_date, adjust_type)`，同一周内每天下载会各插一行（04、05、06…），图表出现多根"像日线"的短蜡烛；每日自动刷新近端周/月线会持续放大这个污染。盘中下载还会把盘中快照当作收盘价入库。

**决策**：写库前清除当前周期内的旧记录，再执行 `INSERT OR REPLACE`：

```sql
DELETE FROM kline_weekly|kline_monthly
WHERE stock_code = ? AND adjust_type = ? AND trade_date >= <本周一 | 本月1号>
```

**理由（对比其他两个方案）**：

- **过滤未完成周期**：库里最干净，但当天/当周下载会返回 0 条并报「未获取到K线数据」；且周五 15:10 自动任务执行时本周仍被判为"当前周"而丢弃，要等到下周一才入库，延迟一周。
- **`trade_date` 归一化到周期末**：同一周期可反复覆盖，但需要交易日历才能算出真实最后交易日（遇周四休市即错），且图表会出现「11-30」这类非交易日日期。
- **当前周期覆盖**：无需日历、当天即可看到本周/本月至今的数据、同一周期天然唯一。代价是当前周期那条记录的日期会随最新交易日推进，内容在周期结束前始终是"截至最新"的快照——与日线"不下载就不更新"的既有语义一致。

**边界**：清理动作带有前置判断——仅当本批 `klines` 中存在 `trade_date >= 当前周期起始日` 的记录时才执行删除。否则下载纯历史区间（如 2020 年）时，无条件 `DELETE >= 本周一` 会把库里已有的本周数据误删且不写回（此问题由 `tests/unit/klinePeriodOverwrite.test.ts` 的「历史区间下载不会删掉当前周期数据」用例发现）。进入新周期的首次写入也不会删到上一周期，因为上周日期早于本周一。

**未覆盖的风险**：若用户在某周期内下载后长期不再下载，该周期记录会停留在当时的快照日期（与日线行为一致，靠自动任务修正）。

## Risks / Trade-offs

- **迁移脚本中途失败导致库不可用** → 先整库文件级备份再改名；`ALTER TABLE RENAME` 为单条元数据语句，失败概率低；脚本末尾核对行数，不符则还原备份。
- **已在运行中的旧版本写出 `kline_data`，升级后表不存在** → 迁移脚本同时提供「反向兼容视图」之外的兜底：若检测到运行中重新出现 `kline_data` 表，脚本打印警告并要求人工确认（本项目为单机 Electron，不存在多版本并行写库，风险可忽略）。
- **三表 schema 漂移**（改字段只改了一张表）→ `sql/init.sql` 三份 DDL 紧邻且带强制一致性注释；`scripts/init-database.ts` 增加启动时的列一致性断言（比较三表 `PRAGMA table_info` 列名集合）。
- **周线/月线日期与日线重合导致标记错位** → D7 采用区间归属映射，而不是相等比较。
- **`getChartData` 默认参数遗漏 `period` 导致查错表** → 主进程 handler 对 `period` 做运行时白名单校验并抛 `INVALID_PERIOD`；preload 与前端类型均为必填（不设默认值，避免隐式落到日线）。
- **数据源周/月线缺失（个别停牌/退市标的返回空）** → 前端空数据回滚提示「请先下载对应周期数据」，不做本地聚合兜底（Non-Goal，若后续确认数据源覆盖不足再单独立项）。
- **表格改名影响用户既有备份/外部脚本** → 无对外 API 暴露表名，仅 IPC 参数变化；风险局限于本机数据库文件。

## Migration Plan

1. 发布前：`sql/init.sql` 更新为三表 DDL。
2. 用户首次启动（或手动执行）`scripts/migrate-split-kline-tables.ts`：备份 → 改名 → 建表建索引 → 行数核对。
3. 回滚策略：停止应用，用 `.bak-<ts>` 覆盖 `~/.stockanalyzer/stockanalyzer.db` 即可回到单表状态（新版本代码无法在旧库上运行，属预期）。
4. 灰度验证：迁移后打开任一自选股的K线图，确认日线数据量与迁移前一致（脚本末尾打印日线行数供比对）。

## Open Questions

无未决问题。两处遗留决策已确认（见 D9）：

- 批量下载的周期选择为**单选**，一次批量任务只处理一个周期，默认日线。
- 周线/月线的默认日期范围**沿用当日**（与日线完全一致），不做周期特例。
