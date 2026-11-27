## ADDED Requirements

### Requirement: 系统支持手动刷新证券池

系统 SHALL 提供 `market:sync:refresh-universe` 控制入口，用于重新执行 `active_codes` 与 `delisted_codes` 市场级任务并更新本地 `securities`。系统 MUST NOT 在该操作中执行 `calendar` 任务，MUST NOT 重置已成功的日线任务或删除已写入的行情数据。市场级任务全部成功后，系统 SHALL 为本地名录中缺少 `raw_daily` 任务的证券幂等补建日线任务，并调度执行这些任务，使新上市证券获得完整历史。

#### Scenario: 刷新全量回填后新上市的证券
- **WHEN** 全量回填已完成，交易所名录新增 `430047` 且本地 `securities` 尚无该记录，用户调用 `market:sync:refresh-universe`
- **THEN** 系统重新执行 `active_codes` 与 `delisted_codes` 并写入 `430047`，为其生成 `raw_daily` 任务并下载全历史，已有证券的任务状态与数据保持不变

#### Scenario: 重复刷新不产生重复任务
- **WHEN** 用户连续两次调用 `market:sync:refresh-universe`，且两次名录没有新增证券
- **THEN** 系统不生成重复的日线任务，已存在的 `raw_daily` 任务保持原有状态

#### Scenario: 刷新不重跑交易日历
- **WHEN** 用户调用 `market:sync:refresh-universe`
- **THEN** 系统不执行 `calendar` 任务，`trading_calendar` 表保持不变

#### Scenario: 市场级任务失败时中止
- **WHEN** `active_codes` 或 `delisted_codes` 任务失败
- **THEN** 系统不补建新证券日线任务，控制状态置为 `failed`，并展示最近错误

#### Scenario: 刷新完成后增量恢复可用
- **WHEN** 刷新证券池完成，新增证券的日线任务已成功且其它证券已追平最新交易日
- **THEN** 用户调用 `market:sync:incremental` 可正常执行，不再因证券数多于任务数而拒绝

## MODIFIED Requirements

### Requirement: 全量回填与增量更新互斥

系统 SHALL 在同一时间只允许一种同步模式运行。全量回填运行中或存在未完成的全量任务时，系统 MUST 拒绝增量更新；增量更新运行中时，系统 MUST 拒绝全量回填；刷新证券池运行中时，系统 MUST 拒绝全量回填与增量更新；全量回填或增量更新运行中时，系统 MUST 拒绝刷新证券池。系统 SHALL 通过 `meta.sync_mode` 区分 `full / incremental / universe` 三种模式。

#### Scenario: 全量运行中拒绝增量
- **WHEN** `sync_control_state = running` 且 `sync_mode = full`，用户点击“增量更新”
- **THEN** 系统拒绝请求并提示全量回填尚未完成

#### Scenario: 增量运行中拒绝全量
- **WHEN** `sync_control_state = running` 且 `sync_mode = incremental`，用户点击“全量回填”
- **THEN** 系统拒绝请求并提示增量更新正在进行

#### Scenario: 刷新运行中拒绝全量与增量
- **WHEN** `sync_control_state = running` 且 `sync_mode = universe`，用户点击“全量回填”或“增量更新”
- **THEN** 系统拒绝请求并提示刷新证券池尚未完成

#### Scenario: 全量或增量运行中拒绝刷新
- **WHEN** `sync_control_state = running` 且 `sync_mode = full` 或 `incremental`，用户点击“刷新证券池”
- **THEN** 系统拒绝请求并提示当前同步尚未完成
