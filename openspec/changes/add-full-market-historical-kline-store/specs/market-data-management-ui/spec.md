## ADDED Requirements

### Requirement: 系统提供独立的行情库管理页面

系统 SHALL 在侧边栏提供“行情库”入口，使用 `ViewId = 'market-data'` 和独立页面组件 `MarketDataView.vue`。页面 MUST NOT 复用设置页作为唯一入口。

#### Scenario: 用户进入行情库页面
- **WHEN** 用户点击侧边栏“行情库”
- **THEN** 系统切换到 `market-data` 页面并加载同步状态

#### Scenario: 首次打开页面
- **WHEN** 用户首次打开行情库页面且从未启动回填
- **THEN** 页面显示“未开始”状态，不自动生成任务、不发起下载

#### Scenario: 不自动执行增量
- **WHEN** 应用启动或到达收盘时间
- **THEN** 页面不自动触发增量更新，等待用户点击“增量更新”

### Requirement: 页面展示同步状态

系统 SHALL 通过 `market:sync:status` 展示 `MarketSyncStatus`，至少包含状态、运行模式、总数、待处理、运行中、成功、失败、最早缺失日期、最新交易日、待补任务数、当前任务、当前证券、最近错误和更新时间。

#### Scenario: 展示运行中状态
- **WHEN** 同步控制状态为 `running`
- **THEN** 页面显示运行中状态、进度统计、当前证券和当前任务

#### Scenario: 展示失败状态
- **WHEN** 存在 `failed` 任务
- **THEN** 页面显示失败数量、最近错误，并提供“重试失败”按钮

#### Scenario: 展示失败任务列表
- **WHEN** 页面加载到失败任务
- **THEN** 失败任务表展示股票代码、任务类型、重试次数、最近错误和下次重试时间

### Requirement: 页面提供全量回填控制

系统 SHALL 提供“开始/继续”“重试失败”“刷新状态”操作，并将操作映射到对应 IPC。按钮 MUST 根据当前状态禁用，避免重复启动或无效控制。

#### Scenario: 开始首次回填
- **WHEN** 页面状态为 `idle` 且用户点击“开始全量回填”
- **THEN** 页面调用 `market:sync:start`，按钮进入运行中禁用状态

#### Scenario: 继续中断后的回填
- **WHEN** 页面存在 `pending` 任务且状态为 `idle`，用户点击“继续”
- **THEN** 页面调用 `market:sync:start`，系统恢复任务调度

#### Scenario: 重试失败任务
- **WHEN** 存在失败任务且用户点击“重试失败”
- **THEN** 页面调用 `market:sync:retry-failed`，系统只重置失败任务并启动调度

#### Scenario: 部分股票失败时不影响已完成股票
- **WHEN** 股票 A 已全部成功、股票 B 部分任务失败，用户点击“重试失败”
- **THEN** 页面只重试股票 B 的失败任务，股票 A 的状态和数据保持不变

#### Scenario: 全部成功时禁用重试
- **WHEN** 不存在 `failed` 任务
- **THEN** “重试失败”按钮禁用

#### Scenario: 运行中禁用启动和重试
- **WHEN** 状态为 `running`
- **THEN** “开始/继续”和“重试失败”按钮禁用

### Requirement: 页面提供增量更新控制

系统 SHALL 在同一页面提供“增量更新”操作，并调用 `market:sync:incremental`。该操作仅在全量回填完成且没有未完成的全量任务时可用。页面 MUST 展示 `earliestMissingDate / latestTradeDate / incrementalTaskCount`。全量回填运行中 MUST 禁用增量更新；增量更新运行中 MUST 禁用全量回填。

#### Scenario: 全量完成后显示增量区间
- **WHEN** 全量回填完成且存在缺失交易日
- **THEN** 页面显示“最早缺失日期”“最新交易日”“待补任务数”，并启用“增量更新”按钮

#### Scenario: 点击增量更新
- **WHEN** 用户点击“增量更新”
- **THEN** 页面调用 `market:sync:incremental`，从最早缺失日期对应的各证券断点开始补跑

#### Scenario: 已是最新
- **WHEN** 所有在市证券的必要任务都追平最新交易日
- **THEN** 页面显示“已是最新”并禁用“增量更新”按钮

#### Scenario: 未完成全量回填时禁用增量
- **WHEN** 尚未完成全量回填或存在未完成的全量任务
- **THEN** “增量更新”按钮禁用，并提示先完成全量回填

#### Scenario: 全量与增量互斥
- **WHEN** 全量回填运行中或增量更新运行中
- **THEN** 页面禁用另一种模式的启动按钮

### Requirement: 页面轮询同步状态并及时停止

系统 SHALL 在页面挂载时立即查询一次 `market:sync:status`，并在页面可见期间每 1 秒轮询；页面卸载时必须清除轮询定时器。

#### Scenario: 页面挂载
- **WHEN** 行情库页面挂载
- **THEN** 系统立即发起一次状态查询，并启动 1 秒轮询

#### Scenario: 页面卸载
- **WHEN** 用户离开行情库页面
- **THEN** 系统清除轮询定时器，不再发起状态查询

#### Scenario: 控制命令失败
- **WHEN** 任一控制 IPC 返回 `success = false`
- **THEN** 页面展示错误信息并保留当前状态，不静默吞掉失败
