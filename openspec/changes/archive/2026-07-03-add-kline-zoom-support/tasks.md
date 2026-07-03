## 1. 核心缩放逻辑实现

- [x] 1.1 在 `useKlineChart.ts` 中添加 `zoomLevel` 响应式状态(默认值1.0,范围0.3-5.0)
- [x] 1.2 在 `useKlineChart.ts` 中修改 `drawChart()` 函数,根据 `zoomLevel` 动态计算 `visibleCount` 和 `candleStep`
- [x] 1.3 在 `useKlineChart.ts` 中重构蜡烛绘制相关函数(`drawCandles`, `drawVolume`, `drawTradeMarkers`),使用动态步长替代硬编码的 `CHART_CONFIG.CANDLE_STEP`
- [x] 1.4 在 `useKlineChart.ts` 中实现 `onWheel()` 事件处理函数,支持向上滚动放大(`zoomLevel *= 1.15`)和向下滚动缩小(`zoomLevel /= 1.15`)
- [x] 1.5 在 `onWheel()` 中实现以鼠标位置为中心的缩放算法:记录缩放前鼠标对应的K线索引,缩放后调整 `offsetX` 保持该索引位置不变
- [x] 1.6 在 `onWheel()` 中添加边界检查:确保 `zoomLevel` 在 [0.3, 5.0] 范围内,可见K线数≥5根
- [x] 1.7 在 `onWheel()` 中调用 `event.preventDefault()` 阻止页面滚动

## 2. 事件绑定和资源清理

- [x] 2.1 在 `useKlineChart.ts` 的返回值中添加 `onWheel` 方法导出
- [x] 2.2 在 `KlineChartDialog.vue` 中获取 Canvas 元素引用后,绑定 `wheel` 事件监听器(使用 `{ passive: false }` 选项)
- [x] 2.3 在 `KlineChartDialog.vue` 的组件卸载或弹窗关闭时,移除 `wheel` 事件监听器避免内存泄漏
- [x] 2.4 在 `useKlineChart.ts` 的 `destroy()` 函数中重置 `zoomLevel` 为 1.0

## 3. UI提示文字添加

- [x] 3.1 在 `KlineChartDialog.vue` 的 Canvas 容器下方添加提示文字 `<div class="chart-hint">滚轮缩放 | 拖动平移</div>`
- [x] 3.2 在 `KlineChartDialog.vue` 中使用 `v-if` 控制提示文字仅在 `!isEmpty` 时显示
- [x] 3.3 在 `KlineChartDialog.vue` 的 `<style>` 中添加 `.chart-hint` 样式(字体颜色 #9ca3af,字号 12px,居中对齐)

## 4. 状态重置逻辑

- [x] 4.1 在 `useKlineChart.ts` 的 `setData()` 函数中添加 `zoomLevel = 1.0` 重置逻辑
- [x] 4.2 在 `KlineChartDialog.vue` 的 `handleClose()` 函数中调用 `klineChart.destroy()` 确保状态清理

## 5. 测试和验证

- [x] 5.1 本地启动开发环境(`npm run dev`),打开自选股K线图弹窗
- [x] 5.2 测试向上滚动放大:验证蜡烛变宽,可见数量减少,鼠标位置K线保持稳定
- [x] 5.3 测试向下滚动缩小:验证蜡烛变窄,可见数量增加,至少显示5根K线
- [x] 5.4 测试缩放边界:持续放大到 `zoomLevel=5.0` 验证不再放大,持续缩小到 `zoomLevel=0.3` 验证不再缩小
- [x] 5.5 测试缩放后拖动:放大或缩小后按住鼠标拖动,验证流畅无跳变
- [x] 5.6 测试拖动后缩放:先拖动查看历史数据,再滚动缩放,验证以鼠标位置为中心
- [x] 5.7 测试连续操作:执行"缩放→拖动→缩放→拖动"序列,验证状态一致
- [x] 5.8 测试性能:缩小到 `zoomLevel=0.3` 绘制数百根K线,验证无明显卡顿(≥30fps)
- [x] 5.9 测试UI提示:验证"滚轮缩放 | 拖动平移"文字正确显示,空数据时不显示
- [x] 5.10 测试状态重置:关闭弹窗后重新打开,验证 `zoomLevel` 恢复为 1.0

## 6. 代码质量和文档

- [x] 6.1 运行 `npm run typecheck` 验证 TypeScript 类型检查通过
- [x] 6.2 运行 `npm run lint` 验证 ESLint 检查通过,修复所有警告和错误
- [x] 6.3 在 `useKlineChart.ts` 顶部注释中添加"鼠标滚轮缩放"功能说明
- [x] 6.4 在关键函数(`onWheel`,动态步长计算)添加中文注释说明算法逻辑
