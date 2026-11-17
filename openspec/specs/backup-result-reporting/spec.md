# backup-result-reporting Specification

## Purpose

本规格定义数据库备份结果的结构化表达、IPC 与设置页的如实透传、备份前强制落盘以及自动备份失败的用户可见性，确保用户在备份未真正生成时不会收到成功提示。

## Requirements

### Requirement: 备份结果以结构化结果表达且不得吞掉失败

系统 SHALL 让 `performBackup()` 返回 `BackupResult`，其中包含 `success`、成功时的 `backupPath` 与失败时的 `error`。「数据库文件不存在」「已有备份正在执行」「备份前落盘失败」「复制或重命名失败」「清理旧备份失败」这些路径 MUST 全部映射为 `success: false` 与可展示的错误原因，系统 MUST NOT 在内部捕获异常后仍让调用方得到成功结果。

#### Scenario: 目标目录不可写导致复制失败
- **WHEN** 手动触发备份且复制或重命名操作抛出异常
- **THEN** 返回的 `success` 为 `false`，`error` 包含失败原因，且不产生 `.tmp` 残留文件

#### Scenario: 数据库文件不存在
- **WHEN** 备份时磁盘上的数据库文件不存在
- **THEN** 返回的 `success` 为 `false` 且 `error` 指明文件缺失，不返回成功

#### Scenario: 已有备份正在执行
- **WHEN** 上一次备份尚未结束时再次触发备份
- **THEN** 返回的 `success` 为 `false` 且 `error` 指明「已有备份在执行」，不返回成功

#### Scenario: 备份成功
- **WHEN** 落盘与复制均成功完成
- **THEN** 返回的 `success` 为 `true` 且 `backupPath` 指向本次生成的备份文件

### Requirement: IPC 与设置页如实透传备份结果

`backup:manual` handler SHALL 把 `performBackup()` 的结果原样返回，MUST NOT 在调用后无条件假定成功；设置页 SHALL 依据 `success` 分别展示成功或失败提示，失败提示 MUST 包含 `error` 中的原因。

#### Scenario: 手动备份失败
- **WHEN** 用户在设置页点击「备份数据库」且 `performBackup()` 返回失败
- **THEN** 页面显示失败提示与错误原因，不显示「备份成功」

#### Scenario: 手动备份成功
- **WHEN** `performBackup()` 返回成功
- **THEN** 页面显示成功提示

### Requirement: 备份前强制落盘以保证备份内容完整

系统 SHALL 在复制数据库文件之前执行一次 `saveDatabase()`；落盘失败时系统 MUST 中止本次备份并返回失败，MUST NOT 复制落盘前的旧文件。成功生成的备份文件 MUST 包含发起备份时内存库中全部已提交的写入。

#### Scenario: 新增交易后立即备份
- **WHEN** 用户新增一笔买入交易后立刻手动备份
- **THEN** 备份文件中的 `trade_record` 与对应的 `STOCK_BUY` 资金明细同时存在

#### Scenario: 备份前落盘失败
- **WHEN** 备份流程中 `saveDatabase()` 抛出异常
- **THEN** 本次备份返回失败、不生成新备份文件，磁盘上的原数据库保持上一个完整版本

### Requirement: 自动备份失败对用户可见

当 15:30 自动备份失败时，系统 SHALL 产生用户可见的系统通知并记录错误日志，MUST NOT 仅写入日志而不通知用户。

#### Scenario: 自动备份目录不可写
- **WHEN** 定时备份触发且目标目录不可写
- **THEN** 系统发出包含失败原因的通知，并在日志中记录该次失败

#### Scenario: 自动备份成功
- **WHEN** 定时备份成功完成
- **THEN** 系统不向用户发出失败通知
