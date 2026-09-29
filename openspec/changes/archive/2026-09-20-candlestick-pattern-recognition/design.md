## Context

- StockAnalyzer 是基于 Electron 28 + Vue 3.4 + Pinia 3.0 + sql.js 的桌面股票分析工具,既有数据通路(`kline:get-chart-data` IPC → stock-sdk → 日 K 数据)已稳定支撑 K 线图表层(`useKlineChart` + 自绘 Canvas)。
- 既有 `/kline-download` 与 `/position` 等页面均已建立"列表 + 详情/图表"的联动范式,`SideNav` 已配置可扩展菜单项。
- 既有类型集中在 `shared/types/index.ts`,既有 store 模式为 Pinia Composition API + `computed` 衍生视图状态。
- 既有 `composables/useKlineChart.ts` 已实现 `drawTradeMarkers`,使用统一的绘制层(slot/层索引)机制,任何新增标记应遵循相同接入方式以避免图层冲突。

## Goals / Non-Goals

**Goals**

- 在 **不动现有 K 线数据通路与 IPC 契约** 的前提下,新增一套**纯函数形态检测算法库** 与 **独立的形态扫描页面**。
- 检测逻辑与 UI **完全解耦**:算法库可独立单测,页面只负责交互。
- 与现有 K 线图**深度联动**:列表行点击 → 内嵌 K 线图滚动定位到形态 K 线 + 高亮标记。
- 形态识别附带**趋势前提验证**(MA5/MA10 + 10 根动量)与**强度评分**(0~1),过滤"形状对位置错"的假信号。

**Non-Goals**

- 批量扫描全部自选股(本期为单股)。
- 周线 / 分钟线形态识别(既有 `kline_data` 仅日 K)。
- 形态历史回测与胜率统计。
- 检测结果持久化落库(实时计算,毫秒级,无需存储)。
- 修改既有 capability 的 REQUIREMENTS(本变更只复用既有通路)。

## Decisions

### 1. 算法库放 `shared/patterns/`,渲染进程直接调用(不在主进程注册服务)

- **理由**:单股日 K 通常数百根,32 种形态几何判定均为 O(n) 内的常数项,毫秒级可完成;无需主进程服务带来的 IPC 往返与序列化开销;算法库为**纯函数,无 fs/electron 依赖**,符合项目"渲染进程禁止直接使用 electron 模块"的硬规则;图表与检测共享同一份 K 线数据,联动天然一致。
- **替代方案**:
  - **(a)** 在主进程新增 `patternService` + IPC `pattern:scan` → 拒绝:增加 IPC 序列化开销,且单股数据量小收益不抵成本;
  - **(b)** 抽离到 Web Worker → 拒绝:毫秒级同步计算,Worker 通信开销反而大于计算本身,工程复杂度上升;
  - **(c)** 用现有 WebAssembly 形态识别库 → 拒绝:无必要,且引入新依赖与构建复杂度。

### 2. 不新增 IPC 契约、不落库

- **理由**:复用既有 `kline:get-chart-data` 即可拉到渲染进程,形态检测在内存完成;后续如需批量扫描或回测统计,再演进为主进程服务 + 结果表,改动面最小。
- **替代方案**:
  - **(a)** 新建 `pattern_hits` 表落库 → 拒绝:本期无回看/回测需求,落库即冗余;
  - **(b)** 缓存最近一次扫描结果到 localStorage → 拒绝:跨股票/复权维度组合多,缓存命中率低,维护成本高。

### 3. 检测逻辑与 UI 完全解耦:纯函数 + 注册表 + 每形态一文件

- **理由**:
  - 每个形态一个独立 `PatternDefinition`(几何 + 趋势前提 + 强度计算 + detector 闭包),导出为一个模块常量(非默认导出),注册到 `registry.ts`;
  - 入口函数 `detectPatterns(candles): PatternHit[]` 遍历注册表并按分量统一合并去重;
  - 单元测试可对每个形态独立构造正/反例,无需 mock UI;
  - 后续扩展形态只需新增 detector 文件 + 在对应子目录的 barrel 中 re-export,不改检测入口。
- **目录组织**(每形态一文件,按 candle 数分子目录):
  - `shared/patterns/_lib/` — 共享纯函数工具(`geometry.ts` / `trend.ts` / `strength.ts`),下划线前缀标识内部模块,不对外直接导出;
  - `shared/patterns/single/` — 9 个 1 根 K 线形态,每形态一个文件(`hammer.ts` / `doji.ts` / …);`single/index.ts` 用 `export *` 形成 barrel;
  - `shared/patterns/double/` — 10 个 2 根形态,同上;
  - `shared/patterns/triple/` — 13 个 3 根及以上形态(含 5 根 rising_three_methods / falling_three_methods / mat_hold),同上;
  - `shared/patterns/registry.ts` — `import * as single from './single'` + spread 三类 barrel,**不手写 32 个 import**;
  - `shared/patterns/index.ts` — 对外统一入口,导出 `detectPatterns`、`PatternDefinition`、`PatternHit` 等公共类型;渲染进程仅 import 此文件,不直接 import 子目录。
- **文件级约定**(每个 detector 文件):
  - 顶部:形态说明(`description`)、几何阈值常量就近声明(便于阈值调参);
  - 中部:detector 闭包实现(纯计算);
  - 底部:`export const <patternKey>: PatternDefinition = { ... }` 一个对象导出;
  - 文件名 = `code` 字段值(kebab-case),保证形态与文件 1:1 对应,可被 `Go to Symbol` 一键跳转。

### 4. 趋势验证:MA5/MA10 + 10 根动量

- **理由**:
  - 单 MA 容易被单根异常 K 线扭曲,双条件相互校验更稳;
  - 10 根动量窗口与既有网格交易策略(`gridSimulation`)的趋势判定思路一致(短均线 vs 中均线 + 近期涨跌),与项目术语对齐,降低认知负担;
  - 趋势不满足时**不产生命中**(宁可漏报不误报)。
- **替代方案**:
  - **(a)** 仅看 MA5/MA10 关系 → 拒绝:震荡市失效,误报率高;
  - **(b)** ADX / MACD → 拒绝:需要新增计算与额外数据,超出"形态识别"职责。

### 5. 强度评分:几何条件对阈值的贴近度线性映射 [0,1]

- **理由**:
  - 0/1 二态(命中/不命中)无法区分"教科书形态"与"勉强形态",对用户决策无帮助;
  - 线性映射对实现最简单、对单测最友好(可直接断言单调性);
  - 列表默认按强度降序,直观区分信号强弱。

### 6. 图表标记复用 `useKlineChart` 的"层(slot)"机制

- **理由**:`useKlineChart` 已为 `drawTradeMarkers` 实现层索引分配机制;新增 `drawPatternMarkers` 申请独立层,与交易标记 `^0`、后续可能的网格标记 `^1` 等互不冲突;不破坏既有标记的兼容性与表现。
- **标记视觉约定**:
  - 看涨形态 → K 线**下方**绘制向上箭头(绿色系);
  - 看跌形态 → K 线**上方**绘制向下箭头(红色系);
  - 转折预警(warning)→ 菱形标记(黄色系);
  - 标记悬停提示形态名(`canvas` 的 `mousemove` + `hitTest`)。

### 7. Pinia store 设计:状态 + filters + computed

- `currentStock` / `adjustType` / `klines`:用户输入与拉取结果;
- `allHits`:全量 `PatternHit[]`(无任何筛选);
- `filters`:日期窗口 / 方向 / 形态;
- `filteredHits`(computed):实时派生,避免数据/视图双源;
- 切换股票/复权类型 → 自动重新拉取并触发检测;"检测"按钮仅用于同条件下手动刷新。

### 8. 类型集中于 `shared/types/index.ts`

- `CandlestickPatternCode` 字符串字面量联合(`'hammer' | 'morning_star' | ...`),既可作 enum 又可作 i18n key;
- `PatternDirection` / `PatternHit` / `TrendInfo` / `PatternContext` 作为算法接口类型,**前后端共享**(虽然本期算法仅渲染进程用,但放 shared 便于未来主进程复用)。

### 9. 路由与导航:最小侵入

- 仅在 `SideNav.vue` 追加"形态检测"菜单项 + 路由配置新增 `/pattern-scan` 路由;既有路由不动。

## Risks / Trade-offs

- **[风险] 形态几何阈值经验性较强,误判/漏判取决于阈值设定** → **缓解**:阈值就近声明于每个 detector 文件顶部,`shared/patterns/_lib/strength.ts` 提供线性映射工具;形态附带 `description` 字段用于 UI 解释;算法库独立单测可针对每形态构造边界用例。
- **[风险] 趋势验证在强震荡市可能连续"漏报"** → **缓解**:本页是辅助工具而非交易决策,空态明确提示"近期未发现形态信号";用户可手动放宽趋势前提(本期不做,作为演进项)。
- **[风险] 列表行点击 → 内嵌 K 线图定位的滚动逻辑依赖 DOM/scroll API** → **缓解**:定位行为收敛于 `useKlineChart` 的 `scrollTo(index)` 方法(若既有无则新增),页面仅传 `endIndex`;不内联 DOM 操作。
- **[风险] 32 个 detector 文件分布在 3 个子目录,目录深度 + barrel 文件可能让人初次接触时困惑** → **缓解**:`shared/patterns/index.ts` 是唯一对外入口;`README`(或本 design 文档)作为地图;目录结构天然按 candle 数组织,语义清晰;新增 detector 不改既有文件。
- **[风险] 形态判定代码总量上升,需保持单一职责** → **缓解**:每个 detector 文件 30~80 行,职责单一;若某形态判定代码< 5 行,反而应并入相邻形态文件并由评审拦截,避免文件碎片化。
- **[权衡] "宁可漏报不误报" → 弱趋势下的真信号会被过滤** → **接受**:与项目风格一致(网格交易同样偏好稳态而非激进),UI 用空态 + "检测" 按钮提供手动重试入口。
- **[权衡] 不落库 → 切换页面后需重算** → **接受**:毫秒级同步计算 + 仅前端状态,Pinia store 即是当前激活态;如未来需要历史回看,再独立变更落库。