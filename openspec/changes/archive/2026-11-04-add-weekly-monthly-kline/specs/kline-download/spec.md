## ADDED Requirements

### Requirement: 单只下载支持K线周期选择

单只K线下载 SHALL 支持选择周期（日线 / 周线 / 月线），并将周期透传至 `stock-sdk` 的 `getHistoryKline()`。下载弹窗中周期 MUST 为单选且默认选中日线。下载结果 SHALL 写入所选周期对应的数据表，MUST NOT 写入其他周期的表。

#### Scenario: 默认只下载日线
- **WHEN** 用户打开单只下载弹窗且未修改周期选择后确认
- **THEN** 系统以 `period: 'daily'` 调用数据源，数据写入 `kline_daily`

#### Scenario: 下载周线
- **WHEN** 用户选择「周线」并确认下载
- **THEN** 系统以 `period: 'weekly'` 调用数据源，数据写入 `kline_weekly`，`kline_daily` 不新增记录

#### Scenario: 下载月线前复权
- **WHEN** 用户选择「月线」与「前复权」并确认下载
- **THEN** 系统以 `period: 'monthly'`、`adjust: 'qfq'` 调用数据源，`kline_monthly` 中该股票 `adjust_type='qfq'` 的记录被写入或覆盖

#### Scenario: 周期参数非法
- **WHEN** 下载请求携带不在 `d|w|m` 内的周期值
- **THEN** 系统拒绝下载并返回 `INVALID_PERIOD` 错误，不写入任何数据

### Requirement: 批量下载的周期为单选

批量下载弹窗 SHALL 提供周期单选控件（日线 / 周线 / 月线），默认选中日线。三个周期选项 MUST 互斥，任一时刻恰有一个处于选中状态，因此不存在「未选择周期」的提交状态。批量任务 SHALL 对每只股票按「所选周期 × 所选复权类型」串行处理，逐只进度与结果 SHALL 体现本次任务的周期与各复权类型写入条数。

#### Scenario: 默认批量只含日线
- **WHEN** 用户打开批量下载弹窗
- **THEN** 周期单选控件处于「日线」选中状态，提交后每只股票只处理日线的所选复权类型

#### Scenario: 切换为周线后批量下载
- **WHEN** 用户在批量下载弹窗选择「周线」并提交 3 只股票
- **THEN** 每只股票依次下载周线数据写入 `kline_weekly`，逐只结果显示周线条数，`kline_daily` 不新增记录

#### Scenario: 周期选项互斥
- **WHEN** 用户当前选中「日线」，点击「月线」
- **THEN** 「月线」被选中且「日线」取消选中，任意时刻只有一个周期被选中

#### Scenario: 未获取到周线数据判定
- **WHEN** 批量任务周期为周线，某只股票接口调用成功但返回 0 条K线
- **THEN** 该股票判定为失败，失败原因为「未获取到K线数据」，不计入成功只数

### Requirement: 下载日期范围默认沿用当日

单只下载与批量下载的日期范围默认值 SHALL 与现状保持一致：开始日期与结束日期均为当日，且该默认值 MUST NOT 因所选周期而变化。日期校验规则（开始日期不得晚于结束日期、结束日期不得晚于当前日期）SHALL 对所有周期一致生效。当所选周期在默认日期范围内没有数据时，系统 SHALL 按「未获取到K线数据」处理，MUST NOT 自动扩大日期范围或回退到其他周期。

#### Scenario: 切换周期不改变默认日期
- **WHEN** 用户打开下载弹窗后将周期从「日线」切换为「月线」
- **THEN** 开始日期与结束日期仍为当日，不被自动调整为其他日期

#### Scenario: 周线当日无数据判定失败
- **WHEN** 用户以默认日期范围（当日）下载某股票的周线数据，数据源返回 0 条
- **THEN** 系统提示「未获取到K线数据」，不写入任何周线记录，也不自动改用日线数据

#### Scenario: 结束日期校验对所有周期生效
- **WHEN** 用户选择月线并将结束日期设置为晚于当日
- **THEN** 系统阻止下载并提示「结束日期不能晚于当前日期」

### Requirement: IPC 契约透传周期

K线相关 IPC 通道 SHALL 携带周期参数：`kline:download` 与 `kline:download-batch` 的入参 SHALL 包含 `period: KlinePeriod`（单值，缺省视为日线）；`kline:get-chart-data` SHALL 包含必填 `period` 参数；`kline:updated` 事件 payload SHALL 包含 `periods: KlinePeriod[]`（一次事件对应当前任务的周期，单元素）。周期 MUST 在主进程入口做白名单校验后再进入数据层。

#### Scenario: 获取图表数据携带周期
- **WHEN** 渲染进程调用 `kline:get-chart-data`，参数为 `(stockCode, 'qfq', 'w')`
- **THEN** 主进程返回 `kline_weekly` 中该股票前复权数据，按 `trade_date` 升序

#### Scenario: 缺少周期参数
- **WHEN** 渲染进程调用 `kline:get-chart-data` 时 `period` 为 `undefined`
- **THEN** 主进程返回 `INVALID_PERIOD` 错误，不返回日线数据作为默认兜底

#### Scenario: 更新事件携带周期
- **WHEN** 一次手动下载更新了某股票的周线数据
- **THEN** `kline:updated` 事件 payload 中 `periods` 为 `['w']`

### Requirement: 未完成周期的覆盖写入

数据源对未完成周/月返回的 `trade_date` 是最新交易日（例如月中下载月线得到 `2026-11-04`，次日得到 `2026-11-05`），该值会随日期推进。系统 SHALL 在写入周线/月线前清除当前周期（周线取本周一、月线取本月 1 号）内的既有记录，保证同一股票、同一复权类型在同一周/月内最多保留一条记录。系统 MUST NOT 修改当前周期之前的历史记录，MUST NOT 对 `trade_date` 做周期末归一化（不得改写为周五或月末）。

#### Scenario: 同一周内多次下载只保留一行
- **WHEN** 周三下载某股票周线得到 `trade_date = 2026-11-04`，周四再次下载得到 `2026-11-05`
- **THEN** `kline_weekly` 中该股票该复权类型只有 1 条本周记录，其 `trade_date` 为 `2026-11-05`，不存在 `2026-11-04` 的残留行

#### Scenario: 进入新周期时不覆盖上一周期
- **WHEN** 上周已存在 `trade_date = 2026-11-06` 的完整周线，下周一自动任务写入 `2026-11-09`
- **THEN** `kline_weekly` 同时存在这两条记录，上周那根不被删除

#### Scenario: 下载历史区间不影响当前周期数据
- **WHEN** 用户下载 2020-01-01 ~ 2020-12-31 的周线数据
- **THEN** `kline_weekly` 中本周已有的记录保持不变，删除操作不命中任何行

#### Scenario: 月线同样按当前月覆盖
- **WHEN** 11 月 4 日下载月线后又于 11 月 20 日再次下载
- **THEN** `kline_monthly` 中 11 月只有 1 条记录，`trade_date` 为 11 月 20 日对应的最新交易日

#### Scenario: 日线不受该规则影响
- **WHEN** 同一天内多次下载某股票日线
- **THEN** `kline_daily` 中该交易日始终只有 1 条记录，且不触发当前周期清理

### Requirement: 自动下载按周期分层处理

每日定时自动下载 SHALL 继续以日线为主：固定下载当日日线数据。此外 SHALL 在日线完成后覆盖重下近端周线（近 30 天）与近端月线（近 90 天），以修正当周/当月尚未形成的最后一根K线。周线或月线下载失败 MUST NOT 影响日线下载结果的成功判定，仅记录日志。

#### Scenario: 定时任务更新日线并修正周月线
- **WHEN** 交易日 15:10 自动下载触发
- **THEN** 系统先完成当日日线下载，再下载近 30 天周线与近 90 天月线并覆盖写入

#### Scenario: 周线下载失败不影响日线判定
- **WHEN** 自动任务中日线下载成功但周线请求抛错
- **THEN** 该股票的日线结果仍记为成功，系统记录周线失败日志并继续处理下一只股票

#### Scenario: 非交易日不触发
- **WHEN** 当日非交易日
- **THEN** 系统不执行任何周期的自动下载
