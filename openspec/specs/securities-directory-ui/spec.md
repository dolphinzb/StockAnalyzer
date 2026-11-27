# Spec: 股票列表页面

**Capability**: securities-directory-ui  
**Status**: Active  
**Last Updated**: 2026-11-27

## Purpose

本规格定义「股票列表」页面（`SecuritiesDirectoryView.vue`）的入口位置、名录字段展示、搜索与筛选交互、分页、三种差异化空态、从名录加入自选的路径，以及该页面不发起实时行情请求的边界。页面只使用本地 `securities` 名录，不触发行情库同步。

## Requirements

### Requirement: 系统提供独立的股票列表页面入口

系统 SHALL 在侧边栏提供「股票列表」入口，使用 `ViewId = 'securities-directory'` 与独立页面组件 `SecuritiesDirectoryView.vue`，菜单项位置 MUST 位于「行情库」之前（当前顺序即「形态检测」之后、「行情库」之前）。页面 MUST NOT 依附于「行情库」页作为其子标签。

#### Scenario: 用户进入股票列表页
- **WHEN** 用户点击侧边栏「股票列表」
- **THEN** 系统切换到 `securities-directory` 页面并请求第一页在市证券名录

#### Scenario: 页面不触发行情库同步
- **WHEN** 用户打开股票列表页
- **THEN** 系统只查询名录，不调用 `market:sync:start`、`market:sync:incremental`，也不启动同步状态轮询

### Requirement: 页面展示名录字段与状态

页面 SHALL 以表格展示当前页证券的 `code`、`name`、`exchange`、`listDate`、`delistDate`、状态，其中 `exchange` MUST 显示为「沪 / 深 / 北」，状态 MUST 区分为「在市」与「已退市」。`listDate`、`delistDate` 为空时 MUST 显示占位符而不是编造日期。

#### Scenario: 在市证券行
- **WHEN** 记录 `isActive = true`
- **THEN** 该行状态显示为「在市」，退市日期显示占位符

#### Scenario: 退市证券行
- **WHEN** 记录 `isActive = false`
- **THEN** 该行状态显示为「已退市」，并展示 `delistDate`（若有）

#### Scenario: 日期缺失
- **WHEN** 记录的 `listDate` 为 null
- **THEN** 上市日期列显示 `—`，不显示推算日期

### Requirement: 页面提供搜索、筛选与分页交互

页面 SHALL 提供带标签的关键字搜索框、交易所筛选（全部/沪/深/北）、状态筛选（在市/含退市）与分页器，并在工具行展示当前筛选条件下的结果总数。

- 搜索输入 MUST 防抖 300ms 后才发起请求。
- 任一分页条件以外（关键字、交易所、状态）的筛选变更 MUST 将页码重置为 1。
- 分页器 MUST 允许上一页、下一页与直接跳转页码，并在首页禁用「上一页」、末页禁用「下一页」。
- 每页条数选择器 MUST 位于底部分页器区域，不在顶部筛选工具行。
- 并发请求 MUST 只采纳最后一次请求的响应，过期响应 MUST 被丢弃，不得覆盖较新结果。

#### Scenario: 输入关键字检索
- **WHEN** 用户在搜索框输入「浦发」并停止输入 300ms
- **THEN** 页面发起一次查询，页码重置为 1，表格更新为名称包含「浦发」的记录，搜索框内容保持不变

#### Scenario: 切换交易所筛选
- **WHEN** 用户把交易所从「全部」切换为「深」
- **THEN** 页面立即以 `exchange = SZ` 查询第一页，并保持当前关键字与状态筛选

#### Scenario: 快速连续输入
- **WHEN** 用户连续输入多个字符，先发请求后返回晚于后发请求
- **THEN** 页面保留最后一次请求的结果，不被较早的响应覆盖

#### Scenario: 翻页
- **WHEN** 用户点击「下一页」
- **THEN** 页面以 `page + 1` 请求同一筛选条件下的数据，表格与结果总数同步更新

#### Scenario: 筛选变更重置页码
- **WHEN** 用户位于第 5 页时修改状态筛选为「含退市」
- **THEN** 页面以 `page = 1` 重新查询

### Requirement: 页面区分空态、筛选无结果与查询失败

页面 SHALL 对以下三种情况给出不同呈现，MUST NOT 用同一空表格混淆：

1. 查询成功但 `total = 0` 且无任何筛选条件 → 「行情库尚未同步」，提供前往「行情库」页的引导。
2. 查询成功但 `total = 0` 且存在筛选条件 → 「无匹配证券」，提供清空筛选的操作。
3. 查询失败 → 展示错误信息与「重试」操作，不清空已有结果之外的误导性文案。

#### Scenario: 未同步行情库
- **WHEN** 页面首次查询返回 `total = 0` 且当前无关键字与筛选
- **THEN** 页面显示「行情库尚未同步」空态，并提供跳转到「行情库」页的按钮

#### Scenario: 筛选无结果
- **WHEN** 页面查询返回 `total = 0` 且当前存在关键字或非默认筛选
- **THEN** 页面显示「无匹配证券」并允许一键清空筛选条件

#### Scenario: 查询失败
- **WHEN** `market:securities:list` 以 rejected promise 返回（如行情库未初始化）
- **THEN** 页面显示错误文本与「重试」按钮，不显示「暂无证券」样式的空态

### Requirement: 名录行可加入自选股

页面 SHALL 为每行提供「加入自选」操作。点击后 MUST 复用 `StockEditor` 弹窗并预填该行证券的代码与名称，买入/卖出阈值 MUST 由用户填写，系统 MUST NOT 写入臆造的默认阈值。当该代码已在自选股中时，该行操作 MUST 显示为「已在自选」并禁用。

#### Scenario: 从名录加入自选
- **WHEN** 用户点击某行「加入自选」
- **THEN** 系统打开新增自选股弹窗，代码与名称已为该行数据，阈值输入框为空，等待用户填写

#### Scenario: 取消加入
- **WHEN** 用户在预填弹窗中点击取消
- **THEN** 自选股列表不新增记录

#### Scenario: 提交加入
- **WHEN** 用户在预填弹窗中填入满足「卖出阈值 > 买入阈值 > 0」的数值并保存
- **THEN** 系统通过既有自选股新增通道写入记录，该行操作切换为「已在自选」

#### Scenario: 已在自选
- **WHEN** 某行的证券代码已存在自选股列表
- **THEN** 该行操作显示「已在自选」且不可点击

### Requirement: 页面不发起实时行情请求

页面 SHALL 只使用本地名录查询结果渲染，MUST NOT 在加载、翻页或筛选时调用实时行情接口，MUST NOT 展示价格或涨跌幅列。

#### Scenario: 打开页面
- **WHEN** 用户打开股票列表页
- **THEN** 系统仅调用 `market:securities:list`，不调用 `prices:*`、`position:fetch-prices` 或行情源网络接口
