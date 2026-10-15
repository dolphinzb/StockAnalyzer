## Why

当前自选股K线图弹窗仅支持鼠标拖动平移、滚轮缩放以及交易标注(B/S/D)与形态标注的悬停tooltip，但鼠标悬停在某根蜡烛（某一交易日）上时无法直接查看该日的K线数据。用户如需了解某一日的开盘价、收盘价、最高价、最低价、涨跌幅和涨跌额，只能靠肉眼在价格轴上估算，精度差且效率低。添加K线数据悬停提示功能，让鼠标悬停即可读取该交易日完整行情数据，提升数据分析效率与体验。

## What Changes

- 在K线图Canvas上新增鼠标悬停检测：悬停在某根蜡烛（某一交易日）上时，弹出K线数据tooltip
- tooltip 展示该交易日的：日期、开盘价、收盘价、最高价、最低价、涨跌额、涨跌幅
- 涨跌额与涨跌幅直接读取K线数据中已有的 `changeAmount` / `changePercent` 字段（数据库已存储），无需前端计算；字段为 null 时显示占位符"—"
- 价格涨跌着色：涨为红色(#e53935)、跌为绿色(#43a047)、平为灰色，与K线涨跌色保持一致
- tooltip 位置跟随鼠标或锚定悬停蜡烛，自动选择向上/向下弹出方向，避免被图表容器边缘裁剪
- 悬停优先级：形态标注 > 交易标注 > K线数据tooltip（标注tooltip优先，避免信息冲突）
- 鼠标离开Canvas时隐藏tooltip；拖动平移时不显示K线数据tooltip
- 更新图表底部操作提示文案，告知悬停可查看K线数据

## Capabilities

### New Capabilities
- `kline-hover-tooltip`: K线数据悬停提示能力，包括蜡烛命中检测、K线数据tooltip内容组织（日期/开高低收/涨跌额/涨跌幅）、tooltip定位与弹出方向自适应、与现有标注tooltip的优先级协同

### Modified Capabilities
<!-- 无现有规格变更：现有 kline-zoom 规格仅约束缩放行为，不涉及悬停tooltip -->

## Impact

**受影响的文件**:
- `src/composables/useKlineChart.ts` - 新增悬停命中检测（蜡烛索引计算）、`KlineTooltipInfo` 类型与 tooltip 状态、涨跌幅计算、`checkTooltip` 优先级调整
- `src/components/KlineChartDialog.vue` - 新增K线数据tooltip的模板与样式，更新底部操作提示文案

**API影响**: 无(纯前端交互增强，复用已有 `klineAPI.getChartData` 返回的K线数据)

**依赖影响**: 无(使用现有 `KlineData` 类型与Canvas鼠标事件)

**用户体验影响**:
- 正面: 悬停即可读取某一交易日完整K线数据，无需肉眼估算
- 风险: 需确保与交易标注/形态标注tooltip的悬停优先级不冲突；蜡烛较密（缩放较小时）时仍能准确命中目标交易日
