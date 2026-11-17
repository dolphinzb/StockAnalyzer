## Why

上一轮盘点发现四个数据可信度缺陷：备份失败时 `performBackup()` 吞掉异常，IPC 恒返回成功，用户看到「备份成功」却没有备份；`sql.js` 是内存库，`position:add-record` 写入资金明细后没有落盘，磁盘文件（也是备份所复制的文件）可能缺这笔明细；`trade_record` 用冗余的 `holding_count/holding_price` 组成快照链，但编辑或删除中间一笔时不重算后续记录，持仓成本、盈亏与资金余额链从此错位；46 个 IPC handler 除 K 线周期白名单外没有运行时入参校验，分页参数还被直接拼进 SQL。这些问题平时不易察觉，却在异常路径下静默产生错误数据，因此在继续加功能前先修。

## What Changes

- **备份失败反馈**：`performBackup()` 不再吞异常，改为返回结构化结果（含失败原因与备份文件路径）或向上抛出；`backup:manual` 透传结果，设置页按结果显示成功/失败；15:30 自动备份失败时用户可见（系统通知或日志页错误记录），不再只写日志。
- **资金/持仓落盘一致性**：把 `position:add-record` 中的「写交易记录 + 同步资金明细」作为一个批次，末尾统一 `saveDatabase()`；备份执行前强制落盘一次，保证复制的是内存库最新状态；资金明细同步失败时回滚同一批次或登记可重试的补偿记录，不再仅打标 `fundSyncSuccess=false` 并提示手动补录。
- **编辑删除后重算**：`updateTradeRecord` / `deleteTradeRecord` 变更后，按「交易日期 + id」顺序从变更点重放 `calcHoldingPrice()`，重建该股票后续所有记录的 `holding_count/holding_price`；同时重建关联资金明细并重算 `transfer_records.account_balance` 余额链；`TradeEditor` 不再向主进程传递持仓快照字段，快照由服务端计算。
- **IPC 入参校验**：在主进程引入统一的 handler 校验包装（schema/assert），覆盖 `config:set`、`position:get-records/add-record/update-record/delete-record`、`get-transfer-records`、`add/update/delete-transfer-record`、`watchlist:add`、`kline:get-trade-records`、`kline:download-batch`；数字参数做类型与范围校验、日期做格式校验、枚举做白名单；`getTradeRecords` 的 `LIMIT/OFFSET` 改用 `?` 占位；非法入参返回结构化错误而非未处理异常或拼出非法 SQL。
- **回归测试**：为上述四条路径新增单元测试，并执行 `npm run typecheck` 与 `npm test`。

## Capabilities

### New Capabilities

- `backup-result-reporting`: 备份执行结果的结构化表达与用户可见性，涵盖手动/自动备份成功与失败、备份前落盘、结果透传到 UI。
- `trade-record-consistency`: 交易记录与资金明细的一致性，涵盖批次化落盘、同步失败补偿、编辑/删除后持仓快照链重放与资金余额链重算。
- `ipc-input-validation`: 主进程 IPC 入参的运行时校验与错误返回，涵盖类型、范围、枚举白名单、日期格式与 SQL 参数化。

### Modified Capabilities

<!-- 无：openspec/specs 下现有 16 个 capability 均未定义备份结果、交易记录一致性或 IPC 校验的需求；database-schema-migration 的「落盘原子性」与 etf-trade-fee 的费用规则本次不改动 -->

## Impact

- **主进程服务**：`electron/services/backupService.ts`（结果返回、备份前落盘）、`electron/services/fundService.ts`（余额链重算供交易侧复用）
- **主进程入口**：`electron/index.ts`（`backup:manual` 透传、批次落盘、统一校验包装、自动备份失败通知）
- **数据层**：`electron/database.ts`（`updateTradeRecord` / `deleteTradeRecord` / `addTradeRecord` 的重放逻辑、`getTradeRecords` 参数占位化）
- **渲染层**：`src/views/SettingsView.vue`（按结果显示）、`src/components/TradeEditor.vue`（移除持仓快照字段）、`src/views/PositionView.vue`（同步失败提示改为补偿状态）
- **共享类型**：`shared/types/index.ts`（备份结果、结构化 IPC 错误、补偿记录类型）
- **测试**：新增 `tests/unit/backupResult.test.ts`、`tests/unit/tradeFundPersistence.test.ts`、`tests/unit/holdingChainRecalc.test.ts`、`tests/unit/ipcValidation.test.ts`
- **用户数据**：不新增表、不改表结构、不需要迁移；既有 `~/.stockanalyzer/stockanalyzer.db` 数据在编辑/删除历史交易时会被就地重算（可能产生数值变化，需在发布说明中提示）
- **依赖**：不新增第三方依赖，校验用手写 assert 或复用现有白名单模式，避免引入 zod 等新库
