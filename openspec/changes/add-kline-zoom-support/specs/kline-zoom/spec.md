## ADDED Requirements

### Requirement: 鼠标滚轮缩放K线图
系统SHALL支持通过鼠标滚轮对K线图进行缩放操作,允许用户快速调整显示的K线数量和时间范围。

#### Scenario: 向上滚动放大查看细节
- **WHEN** 用户在K线图Canvas上向上滚动鼠标滚轮(deltaY < 0)
- **THEN** 系统放大K线图,减少可见K线数量,每根蜡烛宽度增加,显示更详细的价格波动

#### Scenario: 向下滚动缩小查看更多时间段
- **WHEN** 用户在K线图Canvas上向下滚动鼠标滚轮(deltaY > 0)
- **THEN** 系统缩小K线图,增加可见K线数量,每根蜡烛宽度减小,显示更长时间段的趋势

#### Scenario: 阻止页面滚动
- **WHEN** 用户在K线图Canvas上滚动鼠标滚轮
- **THEN** 系统调用`event.preventDefault()`阻止浏览器默认页面滚动行为,仅执行图表缩放

### Requirement: 缩放级别范围和限制
系统SHALL维护一个缩放级别状态(`zoomLevel`),并施加合理的上下限以防止极端缩放导致的可用性问题。

#### Scenario: 初始缩放级别为1.0
- **WHEN** K线图首次加载或弹窗打开
- **THEN** `zoomLevel`初始化为1.0,显示默认的K线数量(画布可容纳的基准数量)

#### Scenario: 最小缩放级别限制
- **WHEN** 用户持续向下滚动缩小,`zoomLevel`达到0.3
- **THEN** 系统拒绝进一步缩小,保持`zoomLevel=0.3`,确保至少显示5根K线

#### Scenario: 最大缩放级别限制
- **WHEN** 用户持续向上滚动放大,`zoomLevel`达到5.0
- **THEN** 系统拒绝进一步放大,保持`zoomLevel=5.0`,防止单根蜡烛占据过大空间

#### Scenario: 缩放步进为1.15倍率
- **WHEN** 用户执行一次滚轮操作
- **THEN** 向上滚动时`zoomLevel *= 1.15`,向下滚动时`zoomLevel /= 1.15`,提供平滑的缩放体验

### Requirement: 以鼠标位置为中心缩放
系统SHALL在缩放时保持鼠标指针位置对应的K线索引不变,实现类似地图缩放的中心点稳定效果。

#### Scenario: 放大时保持鼠标位置K线不动
- **WHEN** 用户将鼠标悬停在某根K线上并向上滚动放大
- **THEN** 该K线保持在鼠标指针下方,其他K线向两侧扩展

#### Scenario: 缩小时保持鼠标位置K线不动
- **WHEN** 用户将鼠标悬停在某根K线上并向下滚动缩小
- **THEN** 该K线保持在鼠标指针下方,其他K线向两侧收缩

#### Scenario: 边界情况处理
- **WHEN** 用户在图表最右侧(最新数据)向上滚动放大
- **THEN** 系统调整`offsetX`确保不会超出数据范围,最新数据仍显示在右侧边缘

### Requirement: 动态蜡烛宽度和间距计算
系统SHALL根据当前缩放级别动态计算蜡烛宽度和间距,保持7:3的视觉比例。

#### Scenario: 放大时蜡烛变宽
- **WHEN** `zoomLevel`从1.0增加到2.0
- **THEN** 蜡烛步长(`candleStep`)减半,蜡烛宽度变为原来的约2倍,间距也相应增加

#### Scenario: 缩小时蜡烛变窄
- **WHEN** `zoomLevel`从1.0减少到0.5
- **THEN** 蜡烛步长(`candleStep`)翻倍,蜡烛宽度变为原来的一半,间距也相应减小

#### Scenario: 保持7:3宽高比
- **WHEN** 任何缩放级别下绘制蜡烛图
- **THEN** 蜡烛实体宽度始终占步长的70%,间距占30%,避免蜡烛重叠或过细

### Requirement: 缩放与拖动协同工作
系统SHALL确保缩放功能和现有的拖动功能无缝协同,用户可以在任意缩放级别下自由拖动查看不同时间段。

#### Scenario: 缩放后拖动正常
- **WHEN** 用户先放大到`zoomLevel=2.0`,然后按住鼠标左键拖动
- **THEN** 拖动流畅,`offsetX`正确更新,不会出现跳变或卡顿

#### Scenario: 拖动后缩放正常
- **WHEN** 用户先拖动查看历史数据,然后滚动滚轮缩放
- **THEN** 缩放以当前鼠标位置为中心,不会突然跳回最新数据

#### Scenario: 连续缩放和拖动操作
- **WHEN** 用户执行"缩放→拖动→缩放→拖动"的连续操作序列
- **THEN** 每次操作都基于当前状态正确执行,图表状态保持一致

### Requirement: 性能优化和流畅度
系统SHALL确保缩放操作的渲染性能达到60fps,避免出现卡顿或延迟。

#### Scenario: requestAnimationFrame节流重绘
- **WHEN** 用户快速连续滚动滚轮触发多次缩放
- **THEN** 系统通过`requestRedraw()`函数使用`requestAnimationFrame`节流,确保每帧只重绘一次

#### Scenario: 大量K线时的性能
- **WHEN** `zoomLevel=0.3`时需要绘制数百根K线
- **THEN** Canvas 2D渲染仍保持流畅(≥30fps),无明显卡顿

### Requirement: UI提示文字
系统SHALL在K线图底部显示操作提示文字,告知用户可用的交互方式。

#### Scenario: 显示缩放和拖动提示
- **WHEN** K线图弹窗打开且存在K线数据
- **THEN** 在Canvas容器底部显示文字"滚轮缩放 | 拖动平移",字体颜色为#9ca3af,字号12px

#### Scenario: 空数据时不显示提示
- **WHEN** K线图无数据(显示"暂无K线数据"提示)
- **THEN** 不显示"滚轮缩放 | 拖动平移"提示文字,避免信息过载

### Requirement: 缩放状态重置
系统SHALL在K线图弹窗关闭或切换股票时重置缩放状态,确保下次打开时恢复默认视图。

#### Scenario: 关闭弹窗重置缩放
- **WHEN** 用户关闭K线图弹窗
- **THEN** `zoomLevel`重置为1.0,`offsetX`重置为0

#### Scenario: 切换股票重置缩放
- **WHEN** 用户在弹窗中切换到另一只股票(通过某种方式,如未来添加的股票选择器)
- **THEN** `zoomLevel`重置为1.0,显示新股票的默认视图
