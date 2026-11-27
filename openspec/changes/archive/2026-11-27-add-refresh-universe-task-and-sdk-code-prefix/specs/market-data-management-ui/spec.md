## ADDED Requirements

### Requirement: 页面提供刷新证券池控制

系统 SHALL 在行情库页面提供“刷新证券池”按钮，并调用 `market:sync:refresh-universe`。该按钮仅在没有任何同步任务运行时可用；运行期间 MUST 同时禁用“开始/继续全量回填”“增量更新”与“刷新证券池”。页面 MUST 将 `mode = universe` 显示为“刷新证券池”，并复用现有状态轮询展示进度与错误。

#### Scenario: 点击刷新证券池
- **WHEN** 用户点击“刷新证券池”
- **THEN** 页面调用 `market:sync:refresh-universe`，并在成功后刷新同步状态

#### Scenario: 刷新期间禁用其它控制
- **WHEN** 同步状态为 `running` 且 `mode = universe`
- **THEN** 页面禁用“开始/继续全量回填”“增量更新”和“刷新证券池”按钮

#### Scenario: 展示刷新证券池模式
- **WHEN** 页面加载的同步状态中 `mode = universe`
- **THEN** 模式标签显示“刷新证券池”，而不是“全量回填”或“增量更新”

#### Scenario: 刷新命令失败
- **WHEN** 用户点击“刷新证券池”且 IPC 返回 `success = false`
- **THEN** 页面展示错误信息并保留当前状态，不静默吞掉失败
