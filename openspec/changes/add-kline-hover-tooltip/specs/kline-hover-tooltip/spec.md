## ADDED Requirements

### Requirement: K线数据悬停提示
当鼠标悬停在K线图Canvas上某一交易日的蜡烛上时，系统SHALL弹出该交易日的K线数据tooltip，展示日期、开盘价、收盘价、最高价、最低价、涨跌额与涨跌幅；鼠标离开Canvas时SHALL隐藏该tooltip。

#### Scenario: 悬停蜡烛显示K线数据
- **WHEN** 用户将鼠标悬停在K线图Canvas上某一根蜡烛（某一交易日）上
- **THEN** 系统在悬停位置附近弹出K线数据tooltip，内容包含该交易日的日期（YYYY-MM-DD）、开盘价、收盘价、最高价、最低价、涨跌额与涨跌幅

#### Scenario: 鼠标离开隐藏tooltip
- **WHEN** 用户将鼠标移出K线图Canvas区域
- **THEN** 系统立即隐藏K线数据tooltip

#### Scenario: 悬停价格轴区域不显示
- **WHEN** 用户将鼠标悬停在Canvas右侧价格轴区域（X坐标大于等于图表宽度）
- **THEN** 系统不显示K线数据tooltip

### Requirement: 涨跌信息读取与展示
系统SHALL直接读取K线数据中已存储的涨跌额（`changeAmount`）与涨跌幅（`changePercent`）字段并在tooltip中展示，不做前端重复计算；当字段为null时，系统SHALL显示占位符而非误导性数值。

#### Scenario: 展示存储的涨跌字段
- **WHEN** 用户悬停的交易日K线数据中 `changeAmount` 与 `changePercent` 字段均有值
- **THEN** 系统在tooltip中直接展示该存储的涨跌额与涨跌幅数值，不做任何前端计算

#### Scenario: 涨跌字段缺失时显示占位符
- **WHEN** 用户悬停的交易日的 `changeAmount` 或 `changePercent` 为null
- **THEN** 系统在tooltip中将缺失的涨跌项显示为占位符"—"，不显示0或其他误导性数值

### Requirement: 涨跌着色
系统SHALL按涨跌方向对tooltip中的涨跌额与涨跌幅着色，颜色与K线涨跌色保持一致：涨为红色(#e53935)，跌为绿色(#43a047)，平为灰色(#9e9e9e)。

#### Scenario: 上涨显示红色
- **WHEN** 悬停交易日的涨跌额（`changeAmount`）大于0
- **THEN** tooltip中涨跌额与涨跌幅以红色(#e53935)显示，且数值带"+"符号前缀

#### Scenario: 下跌显示绿色
- **WHEN** 悬停交易日的涨跌额（`changeAmount`）小于0
- **THEN** tooltip中涨跌额与涨跌幅以绿色(#43a047)显示，且数值带"-"符号前缀

#### Scenario: 平盘显示灰色
- **WHEN** 悬停交易日的涨跌额（`changeAmount`）等于0
- **THEN** tooltip中涨跌额与涨跌幅以灰色(#9e9e9e)显示，数值为0.00与0.00%（无符号前缀）

### Requirement: K线数据tooltip定位与弹出方向
系统SHALL将K线数据tooltip水平锚定在悬停蜡烛的中心X坐标（并做边界钳制防止水平溢出），垂直位置取鼠标Y坐标；当鼠标位于图表上下半区时，系统SHALL自动选择向下或向上弹出，避免tooltip被图表容器边缘裁剪。

#### Scenario: 鼠标在上半区向下弹出
- **WHEN** 用户悬停的鼠标Y坐标小于图表高度的一半
- **THEN** K线数据tooltip在鼠标位置下方弹出显示

#### Scenario: 鼠标在下半区向上弹出
- **WHEN** 用户悬停的鼠标Y坐标大于等于图表高度的一半
- **THEN** K线数据tooltip在鼠标位置上方弹出显示

#### Scenario: 边缘蜡烛水平钳制
- **WHEN** 用户悬停最左侧或最右侧的蜡烛
- **THEN** 系统将tooltip锚点X坐标钳制在图表有效宽度范围内，tooltip完整可见，不被容器左右边缘裁剪

### Requirement: tooltip定位与鼠标位置关系统一
系统SHALL对K线数据tooltip与交易/形态标注tooltip采用统一的锚定策略：水平锚定悬停蜡烛（或标注所在蜡烛）的中心X坐标并做边界钳制，垂直位置取鼠标Y坐标，弹出方向按鼠标Y处于图表上下半区确定。两类tooltip的锚定策略SHALL一致，避免悬停切换时tooltip位置跳变或方向判断不一致。

#### Scenario: tooltip垂直位置跟随鼠标
- **WHEN** 用户悬停某根蜡烛或其上的交易标注（B/S/D）、形态标注（▲/▼/◆）
- **THEN** tooltip的垂直锚点为鼠标Y坐标，水平锚点为悬停蜡烛的中心X坐标（钳制在图表有效宽度内）

#### Scenario: 两类tooltip锚定策略一致
- **WHEN** 鼠标从标注命中区域移入同一蜡烛的其他区域（或反向移动）
- **THEN** tooltip在标注内容与K线数据内容之间切换时锚定位置连续，不出现位置跳变

#### Scenario: 弹出方向由鼠标位置统一决定
- **WHEN** 鼠标Y坐标位于图表上半区
- **THEN** K线数据tooltip与标注tooltip均向下弹出；鼠标位于下半区时均向上弹出

### Requirement: 悬停优先级与互斥
系统SHALL按"形态标注 > 交易标注 > K线数据"的优先级处理悬停命中，且任一时刻只显示一个tooltip，避免信息冲突与视觉重叠。

#### Scenario: 悬停形态标注时显示形态tooltip
- **WHEN** 用户鼠标同时落在形态标注（▲/▼/◆）与其所在蜡烛的命中范围内
- **THEN** 系统显示形态标注tooltip，隐藏K线数据tooltip

#### Scenario: 悬停交易标注时显示交易tooltip
- **WHEN** 用户鼠标同时落在交易标注（B/S/D）与其所在蜡烛的命中范围内
- **THEN** 系统显示交易标注tooltip，隐藏K线数据tooltip

#### Scenario: 悬停空白蜡烛区域显示K线数据tooltip
- **WHEN** 用户鼠标落在蜡烛上但未命中任何形态标注或交易标注
- **THEN** 系统显示K线数据tooltip，隐藏标注tooltip

### Requirement: 拖动时不显示K线数据tooltip
系统SHALL在用户拖动平移图表的过程中不显示K线数据tooltip，避免平移过程中tooltip频繁闪烁。

#### Scenario: 拖动平移期间抑制tooltip
- **WHEN** 用户按住鼠标左键拖动平移K线图
- **THEN** 系统不显示或更新K线数据tooltip，松手后恢复悬停检测

### Requirement: 命中检测与渲染一致性
系统SHALL使用与绘制逻辑相同的可见窗口参数（缩放级别、偏移量、动态蜡烛步长）进行悬停命中检测，保证缩放或平移后tooltip数据始终与悬停位置对应的蜡烛一致。

#### Scenario: 缩放后命中准确
- **WHEN** 用户缩放（zoomLevel在0.3至5.0范围内）后悬停某根蜡烛
- **THEN** 系统按当前缩放后的动态蜡烛步长计算命中索引，tooltip展示的K线数据与视觉上悬停的蜡烛一致

#### Scenario: 平移后命中准确
- **WHEN** 用户拖动平移到历史数据区域后悬停某根蜡烛
- **THEN** 系统按当前偏移量计算可见窗口，tooltip展示的K线数据与视觉上悬停的蜡烛一致

### Requirement: 价格数据完整性校验
当悬停交易日的开盘价、收盘价、最高价或最低价任一为null时，系统SHALL不弹出K线数据tooltip，避免展示不完整或非法的行情数据。

#### Scenario: 价格字段缺失时不弹tooltip
- **WHEN** 用户悬停的蜡烛存在价格字段为null的情况
- **THEN** 系统不显示K线数据tooltip（按未命中处理）

### Requirement: 数值格式化与精度适配
系统SHALL以符合证券类型的精度格式化tooltip中的数值：日期保持YYYY-MM-DD格式；开盘价、收盘价、最高价、最低价、涨跌额的小数位数由证券代码决定（基金3位小数，股票2位小数）；涨跌幅百分比SHALL使用与价格相同的精度；涨跌额与涨跌幅带方向符号；K线图价格轴标签SHALL使用与tooltip相同的精度。

#### Scenario: 股票价格保留两位小数
- **WHEN** 系统渲染股票（如"600519"）的K线数据tooltip
- **THEN** 开盘价、收盘价、最高价、最低价、涨跌额均以2位小数显示（如12.30）

#### Scenario: 基金价格保留三位小数
- **WHEN** 系统渲染基金（如"510050"）的K线数据tooltip
- **THEN** 开盘价、收盘价、最高价、最低价、涨跌额均以3位小数显示（如3.456）

#### Scenario: 涨跌数值带符号与百分号
- **WHEN** 系统渲染涨跌额与涨跌幅
- **THEN** 涨跌额显示为如"+0.15"/"-0.15"的带符号数值（精度随证券类型），涨跌幅显示为如"+1.23%"/"-1.23%"的带符号百分数（精度随证券类型）

#### Scenario: 价格轴标签精度与tooltip一致
- **WHEN** 系统绘制K线图价格轴标签
- **THEN** 价格轴标签使用与tooltip相同的精度（基金3位小数，股票2位小数）
