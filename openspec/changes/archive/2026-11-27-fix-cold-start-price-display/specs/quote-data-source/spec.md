## MODIFIED Requirements

### Requirement: 批量请求语义

每次价格刷新 SHALL 把「全部自选股代码（无论是否开启监控）」与「三项指数代码 `sh000001`、`sh000688`、`sz399001`」合并为一批，并以**单次 HTTP 请求**获取全部行情，MUST NOT 为每只标的分开发起请求，MUST NOT 依据 `monitor_enabled` 裁剪股票代码。

#### Scenario: 股票与指数合并为一次请求
- **WHEN** 自选股列表中有 5 只股票（其中 2 只未开启监控）且三项指数均参与刷新
- **THEN** 本轮对数据源仅发出 1 次 HTTP 请求，请求中同时包含 5 个股票代码与 3 个指数代码

#### Scenario: 未开启监控的股票也参与取价
- **WHEN** 自选股列表中存在 `monitor_enabled = 0` 的股票
- **THEN** 该股票代码仍包含在本轮批量请求中，其价格照常下发到渲染进程

#### Scenario: 自选股列表为空
- **WHEN** 自选股列表为空
- **THEN** 仍以三项指数代码发起 1 次请求，指数状态栏数据正常更新

## ADDED Requirements

### Requirement: 取价范围与告警范围分离

系统 SHALL 以全部自选股作为取价范围，SHALL 仅以 `monitor_enabled = 1` 的自选股作为价格告警的判定范围。价格是否展示 MUST NOT 由 `monitor_enabled` 决定。

#### Scenario: 未开启监控的股票不触发告警
- **WHEN** 某只 `monitor_enabled = 0` 的股票价格跌破 `buy_threshold` 或突破 `sell_threshold`
- **THEN** 该股票价格正常更新到列表，但不产生 BUY/SELL 告警，不发送 `alert:trigger`，不弹系统通知

#### Scenario: 开启监控的股票照常告警
- **WHEN** 某只 `monitor_enabled = 1` 的股票价格越过阈值且不在 5 分钟去抖窗口内
- **THEN** 按既有规则产生告警并发送到渲染进程

#### Scenario: 新加入的自选股可见价格
- **WHEN** 用户新增一只自选股（`addStock` 默认写入 `monitor_enabled = 0`）且下一次刷新成功
- **THEN** 该股票在列表中显示价格，无需先开启监控开关

### Requirement: 冷启动立即刷新

应用启动后 SHALL 立即发起一次全量行情刷新，MUST NOT 等待 `polling.interval` 到期，且该次刷新 MUST NOT 受交易时段限制。后续定时轮询 SHALL 保持既有交易时段限制不变。

#### Scenario: 交易时段内启动
- **WHEN** 应用在交易日 10:00 启动并完成窗口创建
- **THEN** 不等待轮询间隔，立即发出一次批量行情请求，列表价格在首轮结果返回后即可显示

#### Scenario: 非交易时段启动
- **WHEN** 应用在 21:00 或周末启动
- **THEN** 该次启动刷新照常发出请求，不因 `isWithinTradingHours` 判断为假而跳过

#### Scenario: 定时轮询行为不变
- **WHEN** 应用启动后的定时轮询到点，且当前时间不在交易时段内
- **THEN** 该轮定时刷新仍按既有规则跳过，不发起请求

### Requirement: 刷新结果直达渲染进程

渲染进程发起的刷新请求 SHALL 通过 IPC 返回值直接获得本轮价格结果，MUST NOT 依赖 `prices:update` 事件先于本次调用完成注册。

#### Scenario: 首帧不丢包
- **WHEN** 渲染进程在事件监听注册完成后立即调用一次刷新
- **THEN** 该调用返回的价格数组包含本轮全部有效价格，渲染进程据此更新列表，即使此时没有任何 `prices:update` 事件到达

#### Scenario: 后台轮询仍使用事件推送
- **WHEN** 定时器触发一轮刷新
- **THEN** 主进程仍通过 `prices:update` 向渲染进程推送价格，不要求渲染进程主动轮询

### Requirement: 行情请求超时

单次行情 HTTP 请求 SHALL 设置超时上限（默认 5 秒）。超时 SHALL 按整批失败处理，并立即进入日 K 回退流程，MUST NOT 无限期挂起启动刷新或阻塞后续轮询。

#### Scenario: 上游无响应
- **WHEN** 行情请求在 5 秒内未返回
- **THEN** 本轮全部代码标记为失败，日志记录超时原因，随后按日 K 回退规则产出可展示价格

#### Scenario: 超时不中断调度
- **WHEN** 一轮刷新因超时失败
- **THEN** 下一轮定时刷新仍按原间隔触发，调度器状态不受影响
