## Why

StockAnalyzer 已具备 K 线数据下载(015-kline-download)与 Canvas 自绘 K 线图能力,但用户只能凭肉眼识别日本蜡烛图经典形态,效率低且易遗漏。本变更通过对单只股票历史 K 线自动识别 30+ 种经典形态,在独立页面集中展示近期信号并与现有 K 线图联动标记形态位置,把"找形态"自动化、可视化、可联动,降低漏报与误报。

## What Changes

- **新增** `shared/patterns/` 形态检测算法库(纯函数,渲染进程调用):支持单根 9 种、两根 10 种、三根及以上 13 种,共 32 种经典蜡烛图形态;每个形态定义独立、可单测、可扩展。
- **新增** `PatternScanView` 页面:股票选择器(自选股范围,未下载 K 线的股票禁用并引导下载)、复权切换(默认前复权 qfq)、日期窗口筛选(默认近 30 日)、形态/方向筛选、强度排序、结果列表与内嵌 K 线图。
- **新增** `patternScan` Pinia store:管理当前股票、复权类型、K 线数据、全量命中、筛选条件与计算属性 `filteredHits`。
- **扩展** `useKlineChart` 组合式函数:新增 `drawPatternMarkers(hits)` 绘制方法,看涨形态在 K 线下方绘制向上箭头、看跌形态在上方绘制向下箭头、转折预警为菱形标记,与现有 `drawTradeMarkers` 共用绘制层、互不冲突。
- **新增** 侧边栏"形态检测"菜单项与路由 `/pattern-scan`。
- **新增** 形态检测相关类型(`PatternHit`、`TrendInfo`、`PatternContext`、`PatternDirection`、`CandlestickPatternCode`)集中定义于 `shared/types/index.ts`,供前后端共享。
- **新增** 算法库单元测试:32 种形态的正例/反例、趋势验证、强度评分单调性。

> 本变更不修改任何现有 capability 的 REQUIREMENTS,仅在 UI 侧新增入口、复用既有 K 线数据通路(`kline:get-chart-data` IPC);后续若需批量扫描自落股 / 形态落库 / 多周期 / 与网格策略联动,作为独立演进方向处理。

## Capabilities

### New Capabilities

- `candlestick-pattern-recognition`:覆盖 32 种经典日本蜡烛图形态的自动检测、强度评分、趋势前提校验;支持按日期窗口、形态、方向多维筛选,在独立页面集中展示近期命中信号并与现有 K 线图深度联动(列表行点击 → 图上标记 + 滚动定位)。

### Modified Capabilities

(无现有 capability 的 REQUIREMENTS 变更。`useKlineChart` 与 `kline:get-chart-data` IPC 均为"被复用"而非"被修改";`SideNav` 仅新增菜单项,不改变既有导航项的契约。)

## Impact

- **新增目录**:`shared/patterns/`、`tests/unit/patterns/`。
- **新增文件**:`src/views/PatternScanView.vue`、`src/stores/patternScan.ts`。
- **扩展文件**:`shared/types/index.ts`(追加形态相关类型)、`src/composables/useKlineChart.ts`(新增 `drawPatternMarkers` 方法)、`src/components/SideNav.vue`(新增菜单项)、路由配置文件(新增 `/pattern-scan`)。
- **依赖**:无新增第三方依赖,完全基于既有 stock-sdk 拉取的日 K 数据与 Vue/Pinia/Canvas 既有能力。
- **运行时**:检测为纯同步内存计算(数百根日 K × 32 种形态,毫秒级),无网络/磁盘副作用,不引入性能或稳定性风险。
- **非目标**(本期不做):批量扫描自落股、周/分钟线、形态落库与历史回看、胜率统计;这些将作为独立演进方向。