## Context

当前K线图使用Canvas 2D渲染，通过`useKlineChart` composable管理绘制逻辑。现有功能包括:

- 蜡烛图、成交量柱状图、坐标轴绘制（`drawChart` 统一编排）
- 鼠标拖动平移（`offsetX`）与滚轮缩放（`zoomLevel`，可见数量与`dynamicCandleStep`动态计算）
- 交易标注(B/S/D)与形态标注悬停tooltip（`checkTooltip` + `markerAreas`/`patternMarkerAreas` 命中区域缓存）

**技术约束**:
- 蜡烛布局: 可见窗口第一根蜡烛中心 X = `dynamicCandleStep / 2`，第 i 根中心 X = `i * dynamicCandleStep + dynamicCandleStep / 2`；`dynamicCandleStep = chartWidth / actualVisibleCount`，`chartWidth = canvas宽度 - PRICE_AXIS_WIDTH`
- 数据从右向左展示，最新数据在右侧；可见窗口起始数据索引 `startIdx = klineData.length - actualVisibleCount - clampedOffset`
- 现有 `TooltipInfo` 承载交易/形态标注tooltip，通过 `KlineChartDialog.vue` 的 `syncTooltip` 同步到模板渲染
- 数据来自 `window.klineAPI.getChartData`，`KlineData` 字段含 `tradeDate/open/close/high/low/volume/amount` 及已存储的 `changeAmount`（涨跌额）/`changePercent`（涨跌幅%）（价格与涨跌字段均可能为 `null`），`stockCode` 用于精度判定
- 价格精度工具已存在: `src/utils/formatPrice.ts` 的 `getPricePrecision(stockCode)`（`isFund` 前缀规则，基金3位/股票2位），本项目 `price-display-precision` 规格约束全应用价格显示精度
- 测试框架为 Vitest；质量门禁为 `npm run typecheck` 与 `npm run lint`

**相关代码**:
- `src/composables/useKlineChart.ts` - K线渲染核心逻辑（本次改动主战场）
- `src/components/KlineChartDialog.vue` - K线图弹窗组件（tooltip模板与样式）

## Goals / Non-Goals

**Goals:**
1. 鼠标悬停某根蜡烛（某一交易日）时弹出K线数据tooltip，内容含日期、开盘价、收盘价、最高价、最低价、涨跌额、涨跌幅
2. 涨跌额/涨跌幅直接读取K线数据已有字段（`changeAmount`/`changePercent`），字段为 null 时显示占位符
3. 价格与涨跌数值精度适配证券类型：基金3位小数，股票2位小数（复用 `getPricePrecision`）；价格轴标签精度与tooltip一致
4. 涨跌着色与K线涨跌色一致（涨红 #e53935 / 跌绿 #43a047 / 灰 #9e9e9e）
5. 悬停优先级明确且互斥: 形态标注 > 交易标注 > K线数据tooltip，任一时刻只显示一个tooltip
6. K线数据tooltip与标注tooltip采用统一锚定策略（蜡烛中心X + 鼠标Y），按鼠标处于图表上下半区自适应弹出方向，避免被容器裁剪与切换跳变
7. 拖动平移过程中不显示K线数据tooltip；鼠标离开Canvas即隐藏
8. 抽出共享的"可见窗口计算"逻辑，保证绘制与命中检测使用同一套布局参数，杜绝缩放/平移后错位

**Non-Goals:**
1. 不绘制十字准星(crosshair)光标线（仅tooltip，无视觉辅助线）
2. 不在tooltip中展示成交量/成交额（用户未要求，保持信息精简）
3. 不支持触屏/移动端悬停（桌面Electron场景）
4. 不修改数据库、IPC、`klineAPI` 接口（纯前端渲染层增强）
5. 不改造现有交易/形态标注tooltip的行为与样式

## Decisions

### Decision 1: 独立的 `KlineTooltipInfo` 状态，而非扩展 `TooltipInfo`

**选择**: 在 `useKlineChart.ts` 中新增独立的 `klineTooltipInfo` ref 与 `KlineTooltipInfo` 接口（`visible/x/y/placement/date/open/close/high/low/changeAmount/changePercent/trend`），不向现有 `TooltipInfo` 添加字段。

**Rationale**:
- **方案A（采用）**: 独立状态与独立模板块（`v-if="klineTooltipInfo.visible"`）
  - ✅ 关注点分离: 标注tooltip与K线数据tooltip字段结构、渲染模板、样式完全解耦
  - ✅ 互斥性显式: `checkTooltip` 中命中分支直接控制两个 ref 的显隐，不会出现双tooltip同显
  - ❌ 组件中需多一个 `syncKlineTooltip` 同步调用（与现有 `syncTooltip` 模式一致，成本低）
- **方案B**: 扩展 `TooltipInfo`，增加可选 `kline` 字段，模板按字段分流渲染
  - ✅ 单一状态源
  - ❌ 接口臃肿（交易字段与K线字段混杂），模板判断分支增多，历史字段默认值处理易出错

**决策**: 采用方案A。`KlineTooltipInfo.trend` 枚举 `'up' | 'down' | 'flat'` 驱动着色类名；`changeAmount`/`changePercent` 在数据字段为 `null` 时置 `null`，模板渲染占位符 `—`。

### Decision 2: 命中检测算法 —— 索引除法 + 共享可见窗口计算

**选择**: 从鼠标X坐标直接除法求可见窗口内索引，映射到 `klineData` 全局索引；并将 `drawChart` 中可见窗口的计算抽取为 `getVisibleWindow()`，绘制与命中检测共用。

**Rationale**:
- 命中公式: `mouseIndex = Math.floor(mouseX / dynamicCandleStep)`，命中条件 `0 <= mouseIndex < visibleCount && mouseX < chartWidth`（排除右侧价格轴区域）；数据索引 `dataIndex = startIdx + mouseIndex`
- 蜡烛中心在 `i * step + step/2`，除法取整天然覆盖 `[i*step, (i+1)*step)` 区间，即每根蜡烛及其间距都归属该蜡烛，与视觉宽度一致
- 抽取 `getVisibleWindow()`（返回 `{ chartWidth, startIdx, visibleCount, dynamicCandleStep }`，内部对 `offsetX` 做与 `drawChart` 相同的 clamp）:
  - ✅ 消除 `drawChart`/`checkTooltip`/`onMouseMove`拖动分支/`onWheel`/`scrollToIndex` 中重复的窗口计算代码（当前已有5处近似重复）
  - ✅ 保证缩放/平移后命中检测与渲染永不错位
  - ❌ 触碰现有绘制函数入参（改为从 `getVisibleWindow()` 取值），回归面略增，靠 typecheck + 手动验证覆盖
- 备选方案（遍历蜡烛X区间比较）: O(n) 且需缓存每根X坐标，无收益，否决

### Decision 3: 涨跌额/涨跌幅直接读取存储字段

**选择**: tooltip 的涨跌额与涨跌幅直接读取 `KlineData.changeAmount` 与 `KlineData.changePercent`（数据库 `kline` 表 `change_amount` / `change_percent` 列，下载时已由数据源写入），前端不做任何计算；字段为 `null` 时置 `null` 并渲染占位符 `—`。`trend` 由 `changeAmount` 的符号推导（`> 0` → `'up'`，`< 0` → `'down'`，`=== 0` → `'flat'`）。

**Rationale**:
- **方案A（采用）**: 读取已存储字段
  - ✅ 数据库已持久化涨跌额/涨跌幅，前端重复计算既冗余，又可能因复权处理差异与存储值不一致
  - ✅ 无需前收盘价查找逻辑，命中检测更简单、无首根K线特例
  - ✅ 与下载管线保持单一数据源，展示值即存储值
- **方案B**: 前端基于前一日收盘价动态计算
  - ✅ 理论上可自洽
  - ❌ 与数据库已有字段重复；前复权/不复权切换时需保证计算口径与存储口径一致，否则同一数据两种涨跌值，容易误导

**决策**: 采用方案A。`null` 字段（脏数据或首日无涨跌信息）显示 `—` 而非 `0`，避免误导。

### Decision 4: tooltip 统一定位策略 —— 锚定蜡烛X + 跟随鼠标Y + 双向自适应

**选择**: K线数据tooltip与交易/形态标注tooltip采用同一锚定策略：`x = 悬停蜡烛（或标注所在蜡烛）中心X`（经钳制），`y = 鼠标Y`；`placement` 按 `mouseY < 图表高度/2` → `'bottom'` 向下弹出，否则 `'top'` 向上弹出；CSS沿用 `transform: translate(-50%, ...)` 方案。

**Rationale**:
- X锚定蜡烛中心而非跟随鼠标: 悬停读数时视线稳定，不会因鼠标在蜡烛宽度内左右移动而抖动；与"某一日的数据"语义对应
- Y跟随鼠标: 相比固定锚定蜡烛最高/最低价，在蜡烛密集区不会遮挡相邻蜡烛；在成交量区域悬停时tooltip也在手边
- **统一策略消除冲突**（本决策的由来）:
  - 原标注tooltip锚定在标注字母位置（B在low+15、D在high-30、◆在high-60），垂直锚点是标注Y而非鼠标Y，方向按标注Y判断
  - 问题: 鼠标移入/移出标注10px命中圈时，tooltip在「标注锚点」与「鼠标锚点」两套策略间切换，位置跳变；且标注Y与鼠标Y可能位于图表半区两侧，导致弹出方向与鼠标实际位置不一致
  - 统一后: 两类tooltip与鼠标的位置关系完全一致（水平居中于悬停蜡烛、垂直在光标处、朝图表中心弹出），切换时锚点连续无跳变
- X钳制: `clampAnchorX(x, chartWidth)` 将锚点限制在 `[90, chartWidth - 90]`（tooltip最大内容行约180px）。防止悬停最右/最左蜡烛时tooltip被 `overflow:hidden` 容器裁剪；两类tooltip共用同一钳制函数
  - 备选（渲染后测量真实宽度钳制）: 精确但需 `nextTick` + ResizeObserver，复杂度与收益不成正比，否决
- 拖动中（`isDragging`）不更新/不显示K线 tooltip，避免平移时tooltip闪烁

### Decision 5: 优先级与互斥 —— 形态 > 交易 > K线数据

**选择**: `checkTooltip` 按序检测: ① 形态标注区域 → ② 交易标注区域 → ③ 蜡烛索引命中。命中①或②时隐藏K线 tooltip；命中③时隐藏标注tooltip；都未命中两者全隐。

**Rationale**:
- 与现有优先级（形态标注先于交易标注）保持一致，仅在其后追加K线数据兜底
- B/S/D字母标注尺寸小（半径10px），用户悬停意图通常是查看标注详情；悬停空白蜡烛区域时才查看K线数据，符合直觉
- 显式互斥避免信息冲突与双tooltip视觉重叠

### Decision 6: 数值格式化与精度适配

**选择**: 价格（开/收/高/低）、涨跌额、涨跌幅的小数位数由证券代码动态决定——复用 `src/utils/formatPrice.ts` 的 `getPricePrecision(stockCode)`（`isFund` 前缀规则：基金3位小数，股票2位小数）；K线图价格轴标签使用同一精度。日期原样 `YYYY-MM-DD`；涨跌额/涨跌幅带符号（`+`/`-`），平盘无符号。

**Rationale**:
- **方案A（采用）**: 复用项目既有 `getPricePrecision` 工具
  - ✅ 与全应用价格显示规则一致（已有 `price-display-precision` 规格约束：股票2位、基金3位），场内基金（ETF/LOF）价格精确到厘
  - ✅ 单一数据源，新增证券类型规则时只需改 `securities.ts`
  - ❌ 无实质缺点
- **方案B**: tooltip固定2位小数
  - ✅ 实现最简单
  - ❌ ETF 等基金价格3位小数被截断为2位，丢失精度（用户实测反馈：ETF 的 3.456 显示为 3.46 不够用）

**决策**: 采用方案A。精度来源: K线数据tooltip用 `props.stockCode`，价格轴用 `visibleKlines[0].stockCode`（同一弹窗内为同一股票）。`null` 涨跌字段显示 `—` 而非 `0`，避免误导。

## Risks / Trade-offs

### Risk 1: 重构 `getVisibleWindow()` 引发渲染回归

**风险**: 抽取共享窗口计算需改动 `drawChart` 及多个事件处理的取数方式，可能引入偏移/缩放回归。

**缓解**:
- 重构保持数值逻辑逐字等价（相同clamp与公式），仅改变取值来源
- `npm run typecheck` + `npm run lint` 门禁
- 手动回归: 默认视图/缩放至0.3与5.0/拖动到最早与最新数据，验证tooltip数据与悬停蜡烛一致、无错位

### Risk 2: 蜡烛极密时误判悬停目标

**风险**: `zoomLevel=0.3` 时蜡烛宽约2px，用户难以精确悬停单根，tooltip可能频繁切换。

**缓解**:
- 除法命中已按整列归属（含间距），单列即一根蜡烛，无"间隙无归属"问题
- 该场景下用户通常缩小范围查看，属可接受折损；不引入额外放大逻辑（Non-goal）

### Risk 3: 价格与涨跌字段为 `null` 的脏数据

**风险**: `KlineData.open/close/high/low/changeAmount/changePercent` 允许 `null`，tooltip可能渲染 `null` 或 `NaN`。

**缓解**:
- 价格字段（`open/close/high/low`）任一为 `null` 时不弹出K线 tooltip，保证提示信息可信（绘制层的 `?? 0` 宽容策略不适用于数据读数场景）
- 涨跌字段为 `null` 时渲染占位符 `—`，`trend` 推导对 `null` 安全（按 `'flat'` 或不着色处理）

### Trade-off: 不实现十字准星

**权衡**: 仅tooltip无准星线，悬停位置感略弱。

**理由**: 需求聚焦数据读数；准星涉及全量重绘与性能考量，留作后续独立change。

## Migration Plan

**部署步骤**:
1. `useKlineChart.ts`: 新增 `KlineTooltipInfo` 类型与 `klineTooltipInfo` 状态；抽取 `getVisibleWindow()`；改造 `checkTooltip` 追加K线命中分支与优先级互斥
2. `KlineChartDialog.vue`: 新增K线数据tooltip模板块与样式；`mousemove` 中同步 `klineTooltipInfo`；更新底部提示文案
3. 运行 `npm run typecheck`、`npm run lint` 与 `npm test`
4. 开发环境手动验证各场景（见 tasks.md 测试章节）

**回滚策略**:
- 变更集中在渲染层两个文件，无数据/接口依赖；回滚即还原两个文件，风险极低

## Open Questions

**无** —— 关键决策已明确，可直接进入实现阶段。
