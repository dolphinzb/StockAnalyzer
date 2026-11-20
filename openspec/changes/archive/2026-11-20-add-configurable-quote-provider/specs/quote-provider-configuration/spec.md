## ADDED Requirements

### Requirement: 数据源选择控件

设置页 SHALL 提供「API 提供商」下拉选择，列出新浪财经、东方财富、腾讯三项，当前选中项与配置 `api.provider` 保持一致。

#### Scenario: 展示三个可选数据源

- **WHEN** 用户进入设置页
- **THEN** 提供商下拉包含「新浪财经API」「东方财富API」「腾讯API」三个选项，且默认选中当前配置中的 provider

#### Scenario: 选择后立即回填端点

- **WHEN** 用户把提供商从「新浪财经API」改为「东方财富API」
- **THEN** 下方地址字段立即显示东方财富的批量端点，无需保存即可看到变化

### Requirement: 端点地址只读

设置页的「API 地址」字段 SHALL 以只读方式展示当前 provider 对应的标准端点，用户 MUST NOT 编辑该值；地址的最终取值 MUST 由主进程按 provider 派生，MUST NOT 信任渲染进程提交的自定义地址。

#### Scenario: 地址不可编辑

- **WHEN** 用户尝试在「API 地址」输入框中键入内容
- **THEN** 输入框内容不变，仍显示当前 provider 的端点

#### Scenario: 提交被篡改的地址

- **WHEN** 渲染进程调用 `config:set` 并传入与 provider 不匹配的自定义 `api.url`
- **THEN** 主进程落盘的 `api.url` 仍为该 provider 的标准端点，自定义值不生效

#### Scenario: 只读字段提供可读性说明

- **WHEN** 用户查看「API 地址」字段
- **THEN** 字段旁展示提示文案，说明地址由所选数据源决定、不可修改

### Requirement: provider 变更的生效时机

provider 变更 SHALL 在保存后于下一次轮询生效，MUST NOT 要求用户重启应用；已展示的股票价格与指数数据 MUST NOT 因切换 provider 被清空或重置为占位符。

#### Scenario: 保存后下一轮生效

- **WHEN** 用户在交易时段把 provider 从 `sina` 改为 `eastmoney` 并保存
- **THEN** 下一次轮询使用东方财富批量端点，且请求成功后价格与指数按新数据源更新

#### Scenario: 切换不引起界面闪烁

- **WHEN** provider 变更保存成功
- **THEN** 自选股列表与指数状态栏保留切换前最后一批数据，直到新数据返回，不出现清空或占位符

### Requirement: 历史配置归一化

系统 SHALL 在加载配置时按 provider 归一化 `api.url`：当库中地址与该 provider 的标准端点不一致时，以标准端点为准；非法或缺失的 provider MUST 回退为 `sina`。归一化 MUST NOT 导致启动失败。

#### Scenario: 存量东方财富单只端点被纠正

- **WHEN** 库中配置为 `provider: "eastmoney"` 且 `url` 为旧的单只接口 `https://push2.eastmoney.com/api/qt/stock/get`
- **THEN** 加载后内存中的 `api.url` 为批量端点，设置页展示批量端点，用户无需手动修改

#### Scenario: 配置缺失 api 段

- **WHEN** 库中配置对象不包含 `api` 字段
- **THEN** 系统使用默认 provider `sina` 与其标准端点，应用正常启动

#### Scenario: 重置为默认配置

- **WHEN** 用户点击「重置」并保存
- **THEN** provider 回到 `sina`，地址字段显示新浪端点，后续轮询使用新浪接口
