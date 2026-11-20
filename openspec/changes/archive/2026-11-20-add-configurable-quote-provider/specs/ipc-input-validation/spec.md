## MODIFIED Requirements

### Requirement: 配置写入校验与加载兜底

`config:set` SHALL 按 `AppConfig` 的结构校验配置对象，非法或字段缺失的配置 MUST 被拒绝且 MUST NOT 落盘；校验通过后，主进程 MUST 按 `api.provider` 派生标准端点并覆写 `api.url`，渲染进程提交的自定义地址 MUST NOT 落盘。因该值不再由用户提供，`api.url` MUST 允许为空字符串（仅作结构兼容，值不参与落盘）。`loadConfig()` SHALL 把库中读出的配置与 `DEFAULT_CONFIG` 合并，并按 `api.provider` 归一化 `api.url`，系统 MUST NOT 因库内坏值在行情轮询等后续流程中崩溃。

校验层 SHALL 只做结构与枚举校验，端点派生 MUST 由配置保存/加载的归一化函数承担，校验层 MUST NOT 引入端点常量或依赖运行时环境。`provider` 三值枚举校验仅作用于 `config:set` 写入入口；库中已存在的非法 provider 由 `loadConfig` 归一化回退 `sina`，两者分属写入与读取，不构成冲突。

#### Scenario: 提交缺少必需字段的配置

- **WHEN** `config:set` 收到缺少必需字段或字段类型错误的对象
- **THEN** 返回校验错误，数据库中的原配置保持不变

#### Scenario: 库中配置 JSON 损坏或字段过旧

- **WHEN** 应用启动并读取到结构不完整的配置
- **THEN** 系统用默认值补齐缺失字段并正常启动

#### Scenario: 自定义地址被 provider 覆盖

- **WHEN** `config:set` 收到结构合法但 `api.url` 与 `api.provider` 不匹配的配置对象
- **THEN** 配置正常保存，但落盘的 `api.url` 等于该 provider 的标准端点

#### Scenario: 提交空 url 仍可保存

- **WHEN** `config:set` 收到 `api.url` 为空字符串、`api.provider` 合法的配置对象
- **THEN** 配置保存成功，落盘值为该 provider 的标准端点

#### Scenario: 非法 provider 被拒绝

- **WHEN** `config:set` 收到 `api.provider` 为 `sina` / `eastmoney` / `tencent` 之外的值
- **THEN** 返回校验错误，原配置不变

#### Scenario: 读取到过期的东方财富端点

- **WHEN** `loadConfig()` 读到 `api.provider` 为 `eastmoney` 且 `api.url` 为旧单只接口地址
- **THEN** 返回的配置中 `api.url` 已被归一化为东方财富批量端点
