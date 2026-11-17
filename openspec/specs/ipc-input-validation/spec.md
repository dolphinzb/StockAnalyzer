# ipc-input-validation Specification

## Purpose

本规格定义主进程 IPC 入口的运行时参数校验、统一错误结构、分页参数安全与配置加载兜底，避免渲染进程传入的畸形数据进入业务逻辑或 SQL。

## Requirements

### Requirement: IPC 入口执行运行时参数校验

系统 SHALL 在主进程 `ipcMain.handle` 层对来自渲染进程的入参执行运行时校验，覆盖必填项、数据类型、数值范围、枚举白名单与日期格式；系统 MUST NOT 把 TypeScript 类型声明当作运行时校验。校验失败时系统 MUST 返回结构化错误，MUST NOT 抛出未处理异常或继续执行业务逻辑。

#### Scenario: 数字参数收到字符串
- **WHEN** 某个期望数字的 IPC 参数收到非数字字符串
- **THEN** handler 返回结构化错误且不执行数据库写入或网络请求

#### Scenario: 枚举参数收到白名单外的值
- **WHEN** 交易类型或资金类型收到未定义的值
- **THEN** handler 返回结构化错误，错误信息指明该字段

#### Scenario: 参数合法
- **WHEN** 入参全部通过校验
- **THEN** handler 按原有语义执行并返回原有结果结构

### Requirement: 校验失败使用统一错误结构

系统 SHALL 让所有通道的校验失败返回同一结构（至少包含 `success: false`、错误码、通道名与失败字段名），并在日志中记录通道名与失败字段；日志 MUST NOT 记录原始参数值。

#### Scenario: 不同通道传入非法参数
- **WHEN** 分别向 `config:set` 与 `position:add-record` 传入非法参数
- **THEN** 两者返回相同结构的错误对象，日志中均可定位到通道与字段

#### Scenario: 批量下载参数为空
- **WHEN** `kline:download-batch` 收到 `undefined` 入参
- **THEN** 返回「参数缺失」的结构化错误，不出现 TypeError 被包装成模糊提示

### Requirement: 分页参数安全且 SQL 参数化

系统 SHALL 对 `page` 与 `pageSize` 校验为正整数并限制取值范围；`getTradeRecords()` MUST 以 `?` 占位符把分页值传入 `LIMIT/OFFSET`，系统 MUST NOT 把 IPC 参数拼接进 SQL 文本。超出范围的取值 MUST 被拒绝或被安全地限制到合法范围，MUST NOT 生成非法 SQL。

#### Scenario: pageSize 为负数或非数字
- **WHEN** `position:get-records` 收到 `pageSize = -1` 或字符串
- **THEN** handler 返回结构化错误或把值限制到合法范围，且数据库不抛出 SQL 语法错误

#### Scenario: pageSize 超过上限
- **WHEN** `position:get-records` 收到超大的 `pageSize`
- **THEN** 系统按上限值处理或拒绝，不产生超大结果集

#### Scenario: 正常分页
- **WHEN** `page = 2` 且 `pageSize = 20`
- **THEN** 返回第二页记录，SQL 使用占位符传入 `LIMIT` 与 `OFFSET`

### Requirement: 配置写入校验与加载兜底

`config:set` SHALL 按 `AppConfig` 的结构校验配置对象，非法或字段缺失的配置 MUST 被拒绝且 MUST NOT 落盘；`loadConfig()` SHALL 把库中读出的配置与 `DEFAULT_CONFIG` 合并，系统 MUST NOT 因库内坏值在行情轮询等后续流程中崩溃。

#### Scenario: 提交缺少必需字段的配置
- **WHEN** `config:set` 收到缺少必需字段或字段类型错误的对象
- **THEN** 返回校验错误，数据库中的原配置保持不变

#### Scenario: 库中配置 JSON 损坏或字段过旧
- **WHEN** 应用启动并读取到结构不完整的配置
- **THEN** 系统用默认值补齐缺失字段并正常启动

### Requirement: 校验覆盖指定的通道集合

系统 SHALL 对以下通道接入运行时校验：`config:set`、`position:get-records`、`position:add-record`、`position:update-record`、`position:delete-record`、`get-transfer-records`、`add-transfer-record`、`update-transfer-record`、`delete-transfer-record`、`watchlist:add`、`kline:get-trade-records`、`kline:download-batch`。已有的 K 线周期白名单、日志日期校验与自选股重排集合校验 MUST 继续生效。

#### Scenario: 逐个通道传入非法参数
- **WHEN** 上述每个通道分别收到类型错误的入参
- **THEN** 每个通道都返回结构化错误，且业务数据不发生变更

#### Scenario: 已有白名单仍生效
- **WHEN** `kline:download-batch` 收到非法的 `period`
- **THEN** 仍由周期白名单拒绝，行为与改造前一致
