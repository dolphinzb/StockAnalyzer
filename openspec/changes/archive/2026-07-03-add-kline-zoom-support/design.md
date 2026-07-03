## Context

当前K线图使用Canvas 2D渲染,通过`useKlineChart` composable管理绘制逻辑。现有功能包括:
- 蜡烛图、成交量柱状图、坐标轴绘制
- 鼠标拖动查看不同时间段(通过`offsetX`偏移量控制)
- 交易标注(B/S/D)悬停tooltip

**技术约束**:
- Canvas固定尺寸,通过设备像素比(dpr)适配高清屏
- 蜡烛宽度固定为7px,间距3px(总计10px每根)
- 可见蜡烛数量由画布宽度和固定步长计算得出
- 数据从右向左展示,最新数据在右侧

**相关代码**:
- `src/composables/useKlineChart.ts` - K线渲染核心逻辑
- `src/components/KlineChartDialog.vue` - K线图弹窗组件

## Goals / Non-Goals

**Goals:**
1. 添加鼠标滚轮缩放功能,支持放大(查看更多细节)和缩小(查看更多时间段)
2. 保持与现有拖动功能的无缝协同
3. 缩放时保持图表中心点稳定(以鼠标位置为中心缩放)
4. 提供视觉反馈(缩放提示文字)
5. 确保性能流畅(60fps重绘)

**Non-Goals:**
1. 不支持触控板双指捏合手势(浏览器默认行为已足够)
2. 不添加缩放级别UI控件(如滑块或按钮)
3. 不保存缩放状态到localStorage(每次打开重置)
4. 不实现最小/最大缩放限制的持久化配置

## Decisions

### Decision 1: 缩放实现方式 - 动态调整可见蜡烛数量

**选择**: 通过`zoomLevel`状态变量控制可见蜡烛数量,而非改变Canvas物理尺寸或CSS transform。

**Rationale**:
- **方案A(采用)**: 维护`visibleCount`(默认为画布可容纳的蜡烛数),滚轮事件调整该值,重新计算蜡烛步长(`CANDLE_STEP = chartWidth / visibleCount`)
  - ✅ 优点: 保持Canvas尺寸不变,兼容现有绘制逻辑;中心点控制精确;性能最优
  - ❌ 缺点: 需要重构部分硬编码的`CANDLE_STEP`常量
  
- **方案B**: 使用CSS `transform: scale()`缩放整个Canvas
  - ✅ 优点: 实现简单
  - ❌ 缺点: 会导致模糊(尤其是文字);tooltip坐标计算复杂;与拖动冲突
  
- **方案C**: 改变Canvas物理尺寸(width/height属性)
  - ✅ 优点: 清晰度好
  - ❌ 缺点: 频繁resize性能差;需要重新计算所有坐标

**决策**: 采用方案A,引入`zoomLevel`(范围0.5-3.0,默认1.0),计算公式:
```typescript
const baseVisibleCount = Math.floor(chartWidth / CHART_CONFIG.CANDLE_STEP); // 基准可见数量
const actualVisibleCount = Math.floor(baseVisibleCount / zoomLevel); // 实际可见数量
const dynamicCandleStep = chartWidth / actualVisibleCount; // 动态步长
```

### Decision 2: 缩放中心点控制

**选择**: 以鼠标指针位置为缩放中心,保持该位置对应的K线索引不变。

**Rationale**:
- 用户体验最佳(类似地图缩放)
- 实现方式: 记录缩放前鼠标对应的K线索引`targetIndex`,缩放后调整`offsetX`使该索引仍位于鼠标位置
- 算法:
  ```typescript
  // 缩放前
  const mouseX = event.offsetX;
  const targetIndex = Math.floor(mouseX / oldCandleStep) + startIdx;
  
  // 应用缩放
  zoomLevel *= scaleFactor; // 向上滚动*1.2,向下滚动/1.2
  
  // 缩放后调整offsetX
  const newStartIdx = targetIndex - Math.floor(mouseX / newCandleStep);
  offsetX.value = klineData.length - visibleCount - newStartIdx;
  ```

### Decision 3: 缩放级别范围和步进

**选择**: 
- 范围: `0.3 - 5.0` (最小显示30%蜡烛宽度=更多时间段,最大显示500%=极少蜡烛但极详细)
- 步进: 每次滚轮事件乘以`1.15`或除以`1.15`
- 限制: 最小可见蜡烛数≥5根,最大可见蜡烛数≤全部数据

**Rationale**:
- 1.15倍率提供平滑的缩放体验(既不过快也不过慢)
- 0.3下限防止蜡烛过密无法辨识
- 5.0上限防止单根蜡烛占据过大空间
- 5根最小可见数确保用户始终能看到趋势

### Decision 4: 蜡烛宽度和间距的动态计算

**选择**: 保持蜡烛宽度与间距的比例(7:3),根据`dynamicCandleStep`等比例缩放。

**实现**:
```typescript
const dynamicCandleWidth = dynamicCandleStep * 0.7; // 70%宽度
const dynamicCandleGap = dynamicCandleStep * 0.3;   // 30%间距
```

**Rationale**:
- 保持视觉一致性(蜡烛不会因缩放变得过粗或过细)
- 避免蜡烛重叠(间距始终存在)
- 简化绘制逻辑(只需传入新的step值)

### Decision 5: 滚轮事件防抖和方向映射

**选择**: 
- 使用`passive: false`监听`wheel`事件,调用`event.preventDefault()`阻止页面滚动
- 不额外添加节流(debounce),因为Canvas重绘已通过`requestAnimationFrame`节流
- 方向映射: `event.deltaY < 0`(向上滚动) → 放大, `event.deltaY > 0`(向下滚动) → 缩小

**Rationale**:
- 符合用户直觉(向上=放大查看细节)
- `preventDefault`避免图表缩放时页面同时滚动
- `requestAnimationFrame`已保证60fps,无需额外节流

### Decision 6: UI提示文案

**选择**: 在K线图底部添加静态提示文字: "滚轮缩放 | 拖动平移"

**位置**: `KlineChartDialog.vue`中Canvas容器下方

**Rationale**:
- 新用户需要知道缩放功能存在
- 简洁明了,不占用过多空间
- 与现有"暂无K线数据"提示风格一致

## Risks / Trade-offs

### Risk 1: 缩放与拖动的交互冲突

**风险**: 用户在缩放后立即拖动,可能因为`offsetX`计算错误导致跳变。

**缓解**: 
- 确保缩放后正确更新`offsetX`边界检查(`Math.min/Math.max`)
- 在`onMouseDown`时记录当前`zoomLevel`,拖动过程中保持不变
- 充分测试缩放→拖动→缩放的连续操作

### Risk 2: 极端缩放下的性能问题

**风险**: 当`zoomLevel=0.3`时,可见蜡烛数量可能达到数百根,绘制性能下降。

**缓解**:
- 设置最小`zoomLevel=0.3`,限制最大可见蜡烛数
- Canvas 2D绘制数百个矩形+线条在现代设备上仍可保持60fps
- 如出现卡顿,可考虑LOD(Level of Detail):低缩放级别时跳过部分细节绘制

### Risk 3: 高分辨率屏幕上的蜡烛过细

**风险**: 在4K屏幕上,即使`zoomLevel=5.0`,蜡烛可能仍然较细。

**缓解**:
- 当前实现已使用`devicePixelRatio`适配,蜡烛宽度会根据dpr放大
- 如需进一步优化,可根据`chartWidth`动态调整最小蜡烛宽度

### Trade-off: 不实现键盘快捷键

**权衡**: 仅支持鼠标滚轮,不支持`+/-`键或`Ctrl+滚轮`。

**理由**: 
- 鼠标滚轮已覆盖90%使用场景
- 键盘快捷键增加复杂度,收益有限
- 可在未来根据用户反馈添加

## Migration Plan

**部署步骤**:
1. 修改`useKlineChart.ts`添加缩放逻辑(向后兼容,不影响现有API)
2. 在`KlineChartDialog.vue`中绑定`wheel`事件
3. 添加UI提示文字
4. 本地测试验证缩放、拖动、tooltip协同工作
5. 构建并打包Electron应用

**回滚策略**:
- 如出现严重bug,可快速注释掉`wheel`事件监听器,恢复为纯拖动模式
- 无需数据库迁移或API变更,回滚风险极低

## Open Questions

**无** - 设计方案已明确,可直接进入实现阶段。
