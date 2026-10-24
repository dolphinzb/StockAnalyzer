## 1. 共享可见窗口计算重构

- [x] 1.1 在 `useKlineChart.ts` 中新增 `getVisibleWindow()` 辅助函数，返回 `{ chartWidth, startIdx, visibleCount, dynamicCandleStep }`，内部对 `offsetX` 做与现有 `drawChart` 完全一致的 clamp（数值逻辑逐字等价，仅改变取值来源）
- [x] 1.2 将 `drawChart()` 中的可见窗口计算替换为 `getVisibleWindow()`，验证渲染结果与原逻辑一致
- [x] 1.3 将 `onMouseMove()` 拖动分支、`onWheel()`、`scrollToIndex()` 中重复的窗口计算统一替换为 `getVisibleWindow()`

## 2. K线数据悬停检测与状态

- [x] 2.1 在 `useKlineChart.ts` 中导出 `KlineTooltipInfo` 接口（`visible/x/y/placement/date/open/close/high/low/changeAmount/changePercent/trend`，`changeAmount`/`changePercent` 可为 null，`trend` 为 `'up' | 'down' | 'flat'`）
- [x] 2.2 新增 `klineTooltipInfo` ref（初始隐藏），并从 composable 返回值中导出
- [x] 2.3 实现蜡烛命中检测：`mouseIndex = Math.floor(mouseX / dynamicCandleStep)`，要求 `mouseX < chartWidth` 且 `0 <= mouseIndex < visibleCount`，映射数据索引 `dataIndex = startIdx + mouseIndex`
- [x] 2.4 实现涨跌读取：直接取命中蜡烛的 `kline.changeAmount` / `kline.changePercent`（数据库已存储，不做前端计算）；字段为 null 时置 null，`trend` 由 `changeAmount` 符号推导（>0 up / <0 down / ===0 flat，null 时按 flat 或不着色处理）
- [x] 2.5 实现价格完整性校验：命中蜡烛的 `open/close/high/low` 任一为 null 时不弹出K线 tooltip（按未命中处理）
- [x] 2.6 改造 `checkTooltip()`：按"形态标注 → 交易标注 → K线数据"顺序检测；命中标注时隐藏 `klineTooltipInfo`，命中蜡烛时隐藏 `tooltipInfo`，均未命中时两者全隐（保证任一时刻只显示一个tooltip）
- [x] 2.7 实现K线 tooltip定位：`x` 锚定蜡烛中心X并钳制在 `[90, chartWidth - 90]` 范围内，`y` 取鼠标Y；`placement` 按 `mouseY < 图表高度/2` 取 `'bottom'` 否则 `'top'`（与现有标注tooltip规则一致）
- [x] 2.8 确保拖动过程中（`isDragging`）不显示/不更新K线 tooltip
- [x] 2.9 在 `onMouseLeave()` 中隐藏 `klineTooltipInfo`；在 `setData()` 中重置 `klineTooltipInfo`；在 `destroy()` 中清理相关状态

## 3. 组件模板与样式

- [x] 3.1 在 `KlineChartDialog.vue` 中新增 `syncKlineTooltip()` 方法，并在 Canvas 的 `@mousemove` 处理中同步 `klineChart.klineTooltipInfo.value`
- [x] 3.2 在 `.chart-container` 中新增K线数据tooltip模板块（`v-if="klineTooltipInfo.visible"`），复用 `placement-top/bottom` 方向类，展示日期、开盘价、收盘价、最高价、最低价、涨跌额、涨跌幅；`changeAmount`/`changePercent` 为 null 时显示占位符"—"
- [x] 3.3 新增 `.kline-tooltip` 样式（深色半透明背景、白色文字、`pointer-events: none`、`transform: translate(-50%, ...)` 双向弹出定位，与 `.trade-tooltip` 视觉风格一致）
- [x] 3.4 按 `trend` 添加涨跌着色类：`trend-up` 红色 #e53935、`trend-down` 绿色 #43a047、`trend-flat` 灰色 #9e9e9e
- [x] 3.5 更新底部操作提示文案为"💡 悬停查看K线数据 | 滚轮缩放 | 拖动平移"

## 4. 质量门禁

- [x] 4.1 运行 `npm run typecheck` 验证 TypeScript 类型检查通过
- [x] 4.2 运行 `npm run lint` 验证 ESLint 检查通过，修复所有警告和错误（改动文件单独校验零问题；全量 lint 中的错误均为存量问题，位于 dist-electron 构建产物、既有测试文件等未改动文件，已用 git stash 对比确认与本次改动无关）
- [x] 4.3 运行 `npm test` 确认无回归失败（tests/unit/patterns 下 15 个失败为存量问题，已用 git stash 对比确认改动前后结果完全一致：15 failed / 118 passed）

## 5. 手动验证

- [ ] 5.1 悬停某根蜡烛：验证tooltip显示日期、开盘价、收盘价、最高价、最低价、涨跌额、涨跌幅，且与悬停蜡烛一致
- [ ] 5.2 验证涨跌字段为null时（脏数据/首日数据）tooltip中对应项显示"—"而非0
- [ ] 5.3 验证涨跌着色：上涨红色带"+"、下跌绿色带"-"、平盘灰色无符号
- [ ] 5.4 验证弹出方向：鼠标在图表上半区tooltip向下弹出，下半区向上弹出，均不被容器裁剪
- [ ] 5.5 悬停最左/最右蜡烛：验证tooltip水平不溢出容器
- [ ] 5.6 悬停B/S/D交易标注与▲/▼/◆形态标注：验证分别显示对应标注tooltip，K线数据tooltip不出现
- [ ] 5.7 按住拖动平移：验证拖动过程中无K线 tooltip，松手后恢复悬停检测
- [ ] 5.8 缩放至 zoomLevel=5.0 与 0.3 后悬停：验证命中准确、tooltip数据与视觉蜡烛一致
- [ ] 5.9 平移到历史数据区域后悬停：验证命中准确无错位
- [ ] 5.10 鼠标移出Canvas：验证tooltip立即隐藏
- [x] 5.11 在 `useKlineChart.ts` 顶部注释中添加"K线数据悬停tooltip"功能说明，并为关键函数补充中文注释

## 6. 用户反馈修正（价格精度与tooltip定位）

- [x] 6.1 K线数据tooltip与交易tooltip中的价格（开/收/高/低、tradePrice）、涨跌额、涨跌幅改用 `getPricePrecision(stockCode)` 动态精度（基金3位小数，股票2位小数），替换硬编码 `toFixed(2)`
- [x] 6.2 `useKlineChart.ts` 价格轴标签改用同一动态精度（取 `visibleKlines[0].stockCode` 判定），与tooltip精度一致
- [x] 6.3 统一两类tooltip锚定策略：交易/形态标注tooltip由「锚定标注字母位置」改为「水平锚定悬停蜡烛中心X（钳制）+ 垂直取鼠标Y + 方向按鼠标上下半区」，与K线数据tooltip一致，消除切换跳变；钳制逻辑抽取 `clampAnchorX()` 两类tooltip共用
- [x] 6.4 运行 `npm run typecheck` 与改动文件 ESLint 校验通过（typecheck 通过；改动文件 ESLint 零问题；全量测试与基线一致无回归：15 failed / 143 passed，失败均为存量形态测试）
- [ ] 6.5 手动验证：ETF（如510050）tooltip与价格轴均显示3位小数；股票仍为2位；鼠标移入/移出B/S/D与▲/▼/◆标注时tooltip锚点连续不跳变、弹出方向与鼠标位置一致
