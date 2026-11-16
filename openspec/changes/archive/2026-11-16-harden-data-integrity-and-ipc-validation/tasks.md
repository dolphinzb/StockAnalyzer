## 1. 类型与校验基础设施

- [x] 1.1 在 `shared/types/index.ts` 增加 `BackupResult` 与统一 IPC 错误结构；调整 `AddTradeResult`（移除 `fundSyncSuccess` 打标语义）与 `UpdateTradeInput`（移除 `holdingCount` / `holdingPrice`）
- [x] 1.2 新增 `electron/ipcValidation.ts`：实现 `assertString` / `assertNumber` / `assertEnum` / `assertDate` / `assertObject` 与 `validatedHandle()` 包装
- [x] 1.3 校验失败统一返回 `{ success: false, code, channel, field, message }`，日志只记录通道与字段、不记录原始参数值
- [x] 1.4 新增 `tests/unit/ipcValidation.test.ts`：覆盖类型错误、范围边界、枚举白名单、日期格式与错误结构一致性

## 2. 分页与配置通道接入

- [x] 2.1 `electron/database.ts` 的 `getTradeRecords()` 把 `LIMIT/OFFSET` 改为 `?` 占位，并在函数内对 `page/pageSize` 做正整数校验与范围限制
- [x] 2.2 `position:get-records` 接入 `validatedHandle()`，非法分页返回结构化错误或不生成非法 SQL
- [x] 2.3 `config:set` 增加 `AppConfig` schema 校验，非法配置拒绝且不落盘
- [x] 2.4 `loadConfig()` 改为与 `DEFAULT_CONFIG` 合并，库中坏值不再导致后续运行崩溃
- [x] 2.5 补充分页占位符与配置合并的单元测试

## 3. 其余 IPC 通道接入校验

- [x] 3.1 `position:add-record` / `update-record` / `delete-record` 接入入参 schema（代码、日期、类型、价格、数量、id）
- [x] 3.2 `get-transfer-records` / `add-transfer-record` / `update-transfer-record` / `delete-transfer-record` 接入入参 schema（limit/offset/types、金额、类型白名单、日期）
- [x] 3.3 `watchlist:add` 增加股票代码格式与非空校验，保留现有阈值大小校验
- [x] 3.4 `kline:get-trade-records` 与 `kline:download-batch` 增加显式空值校验，修复 `input?.x` 与 `input.x` 混用
- [x] 3.5 回归确认 K 线周期白名单、日志日期防穿越、`watchlist:reorder` 集合一致性校验仍生效（三处原有校验代码未改动，全量测试通过）

## 4. 备份结果上报与备份前落盘

- [x] 4.1 `backupService.performBackup()` 改为返回 `BackupResult`，把文件不存在、并发跳过、复制/重命名失败、清理失败全部映射为 `success: false` + 原因
- [x] 4.2 复制磁盘文件前调用 `saveDatabase()`；落盘失败即中止备份并返回失败，不复制旧文件
- [x] 4.3 自动备份调度器读取结果，失败时发出系统通知并记录错误日志
- [x] 4.4 `backup:manual` 原样透传 `BackupResult`，不再无条件返回 `{ success: true }`
- [x] 4.5 `src/views/SettingsView.vue` 按 `success` 显示成功/失败 toast，失败展示错误原因
- [x] 4.6 更新 `useBackup.ts` 与 `BackupAPI` 类型，保证渲染层与结果结构一致

## 5. 批次事务与统一落盘

- [x] 5.1 在 `electron/database.ts` 新增 `runInTransaction()`（BEGIN / COMMIT / ROLLBACK），事务内禁止调用 `saveDatabase()`
- [x] 5.2 `addTradeRecord()` 增加 `skipSave` 选项并移除内部 `saveDatabase()`，参考 K 线侧既有模式（批次传 `skipSave: true` 时不落盘；默认调用保持兼容）
- [x] 5.3 `position:add-record` 用事务包裹「写交易记录 → 同步资金明细 → 重算余额」，提交后统一 `saveDatabase()` 一次
- [x] 5.4 批次任一步失败时回滚全部写入并返回明确错误；移除 `fundSyncSuccess=false` 打标与 `PositionView.vue` 的「请手动补录」提示
- [x] 5.5 复用 `fundService.recalculateBalancesAfterDate()`，使交易侧与资金明细侧使用同一套余额重算逻辑（提取 `recalculateBalancesFrom()` 共用纯函数）

## 6. 持仓链重放与资金明细同步

- [x] 6.1 新增 `rebuildHoldingChain(stockCode)`：按 `trade_date ASC, id ASC` 取该股票全部交易，以零持仓为起点逐条调用 `calcHoldingPrice()` 并 UPDATE 快照字段
- [x] 6.2 `updateTradeRecord()` 接入重放；价格/数量/类型变化时用 `calcStockBuyAmount()` / `calcStockSellAmount()` 同步关联 `STOCK_BUY` / `STOCK_SELL` 明细金额与日期，再重算余额链
- [x] 6.3 `deleteTradeRecord()` 删除关联明细后接入重放与余额链重算，不遗留基于被删记录计算的余额
- [x] 6.4 `src/components/TradeEditor.vue` 移除 `holdingCount` / `holdingPrice` 表单字段与提交参数
- [x] 6.5 编辑与删除的「重放 + 明细同步 + 余额重算」在同一事务内完成，末尾统一落盘

## 7. 测试

- [x] 7.1 新增 `tests/unit/backupResult.test.ts`：失败路径全覆盖、成功路径返回备份路径
- [x] 7.2 新增 `tests/unit/tradeFundPersistence.test.ts`：批次提交后磁盘含两类记录、失败回滚无半态、事务内不落盘
- [x] 7.3 新增 `tests/unit/holdingChainRecalc.test.ts`：改中间价格、改日期导致顺序变化、删除中间记录、余额链重算
- [x] 7.4 改造受影响的既有测试（交易记录、资金明细、迁移 fixtures），适配 `skipSave` 与 `UpdateTradeInput` 变更（全量回归确认无既有测试受影响，新签名由新增用例覆盖）
- [x] 7.5 为已接入校验的通道补充契约测试，断言非法入参不触发业务写入

## 8. 验收

- [x] 8.1 `npm run typecheck` 通过
- [x] 8.2 `npm test` 通过
- [ ] 8.3 手工：把备份目录设为不可写后点击「备份数据库」，确认提示失败且原因可见
- [ ] 8.4 手工：新增一笔买入后立即手动备份，检查备份库中 `trade_record` 与 `STOCK_BUY` 同时存在
- [ ] 8.5 手工：编辑中间一笔买入价格，检查后续 `holding_price` 与 `account_balance` 全链更新
- [ ] 8.6 手工：向 `position:get-records` 传 `pageSize=-1` 或字符串，确认返回结构化错误且无 SQL 异常
- [x] 8.7 在发布说明中提示：编辑/删除历史交易会触发持仓链重放，历史盈亏数值可能被修正
