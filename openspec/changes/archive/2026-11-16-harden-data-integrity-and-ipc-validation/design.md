## Context

运行时数据库是 `sql.js` 内存库：启动时把 `~/.stockanalyzer/stockanalyzer.db` 整库读入内存，写操作后由 `saveDatabase()` 全量 `db.export()` 写 `.tmp` 再 `rename` 覆盖磁盘；`before-quit` → `closeDatabase()` 会补一次落盘。没有连接池、没有 WAL、只有一个进程。

四条缺陷共享同一个根因：**磁盘文件与内存状态、以及两张表之间的边界没有被统一定义**。

1. `backupService.performBackup()` 内部 `catch` 只写日志不抛出，「数据库文件不存在」「并发跳过」两条路径甚至直接 `return`，而 `backup:manual` 在 `await performBackup()` 之后无条件返回 `{success:true}`；`SettingsView.vue` 因此恒弹「备份成功」。
2. `position:add-record` 先调 `dbAddTradeRecord()`（内部已 `saveDatabase()`），再调 `fundService.addTransferRecord()` 写入 `STOCK_BUY`/`STOCK_SELL`/`DIVIDEND_TAX`；后者只写内存且之后没有落盘。资金明细独立 IPC 路径（如 `add-transfer-record`）反而会在末尾 `saveDatabase()`。于是磁盘可能只含交易记录，而备份复制的正是这个磁盘文件。
3. `trade_record` 每条冗余保存 `holding_count/holding_price`，构成快照链：新增时取该股票最新一条记录，用 `calcHoldingPrice()` 递推。`updateTradeRecord()` 直接采用表单传入的 `holdingCount/holdingPrice`（`TradeEditor.vue` 允许填写），`deleteTradeRecord()` 只删交易与关联明细，两者都不重算后续记录；删除还不调用 `fundService.recalculateBalancesAfterDate()`，导致 `transfer_records.account_balance` 余额链断裂。
4. `preload/index.ts` 直接透传参数，TS 类型只在编译期有效；主进程除 K 线周期 `assertKlinePeriod()` 白名单、日志日期防穿越、`watchlist:reorder` 集合校验外没有统一运行时校验。`getTradeRecords()` 还把 `pageSize` 与 `(page-1)*pageSize` 模板插值进 `LIMIT/OFFSET`，是全库唯一未参数化的拼接点。

已确认的前提：不新增表、不改表结构、不引入第三方依赖；现有 `etf-trade-fee` 的费用算法与 `database-schema-migration` 的落盘原子性语义保持不变。

## Goals / Non-Goals

**Goals:**

- 备份的每一次失败都能被 UI / 通知看到，且备份文件包含发起备份时内存库中的全部已提交写入。
- 交易记录与资金明细以批次为单位提交与落盘，异常时不留下半态，不再要求用户手工补录。
- 编辑或删除任意历史交易后，该股票的持仓快照链与资金余额链自洽，快照字段只能由服务端计算。
- 主进程 IPC 入口对所有外部入参做运行时校验，分页参数使用占位符，非法入参返回结构化错误。
- 四条路径都有单元测试覆盖，`npm run typecheck` 与 `npm test` 通过。

**Non-Goals:**

- 不做备份恢复、数据导入导出、备份加密、异地备份（另行立项）。
- 不引入 zod / joi 等新依赖，不新增表、不写迁移文件、不做存量数据迁移。
- 不改动 `calcHoldingPrice()` 的费用与成本算法，不统一 `tradeService.ts` 与 `historicalTradeService.ts` 的费率口径。
- 不提供自动补偿的后台调度器；批次失败以「回滚 + 可重试」解决。
- 不主动修复存量库中已经算错的快照；只有用户编辑/删除该股票交易时才触发重放。
- 不重建 FIFO 股息税 `DIVIDEND_TAX` 明细（见 Open Questions）。

## Decisions

### 1. 备份结果用结构化返回值，而不是「抛异常」

`performBackup()` 改为返回 `BackupResult { success, backupPath?, error? }`，把「数据库文件不存在」「并发跳过」「落盘失败」「复制/重命名失败」「清理失败」全部映射为 `success:false` + 明确原因；不再在函数内吞异常。`backup:manual` 直接返回该结果。

*备选*：让异常继续上抛，由 IPC 的 `try/catch` 生成失败结果。问题是「文件不存在」和「并发跳过」现在是 `return` 而非 `throw`，仍会被当成成功；要补哨兵异常，可读性更差。结构化结果还能携带备份文件路径，供 toast 与日志复用。

### 2. 备份复制前强制 `saveDatabase()`

在 `performBackup()` 复制磁盘文件之前调用一次 `saveDatabase()`；落盘失败即中止备份并返回失败，不复制旧文件。这样备份内容包含发起备份时内存库的全部已提交写入，解决「备份落后于内存」的窗口。

*备选*：直接从内存 `db.export()` 写备份文件。数据最新，但要重复实现原子写、与现有备份路径/命名/清理逻辑分叉。选择复用既有 `saveDatabase()`，代价是每次备份多一次全库序列化（触发点只有 15:30 与手动两处，可接受）。

### 3. 批次边界由 IPC handler 定义，落盘只在提交后一次

参考 K 线侧已有的 `skipSave` 模式：`database.addTradeRecord()` 增加 `skipSave` 选项，去掉内部 `saveDatabase()`；`position:add-record` 用 `runInTransaction()` 包裹「写交易记录 → 写资金明细 → 重算余额」，事务提交后统一 `saveDatabase()` 一次；事务内 MUST NOT 落盘，避免把未提交的中间态写进磁盘。

*备选*：给 `FundService` 注入 `saveDatabase` 回调，让每个 service 自己落盘。会造成一次业务操作多次全库序列化，且「谁定义批次边界」散落在多个模块；不采用。

`runInTransaction()` 放在 `electron/database.ts`，用 sql.js 的 `BEGIN` / `COMMIT` / `ROLLBACK`，失败时回滚并向上抛出。这是本 change 引入的唯一新的跨模块模式。

### 4. 同步失败改为事务回滚，取消 `fundSyncSuccess` 打标

现有 catch 把 `fundSyncSuccess=false` 返回给 UI 提示「请手动补录」，但交易记录已落盘、资金明细缺失，形成不可自愈的半态。改为：批次内任一步失败 → `ROLLBACK` → 返回明确错误（「保存失败，未产生任何变更，请重试」）。`AddTradeResult.fundSyncSuccess` 字段随之移除或恒为 `true`。

*备选*：登记补偿任务、下次启动重试。需要新增表/文件或内存态台账，超出本 change 范围；回滚更简单且无残留。

### 5. 持仓链重放采用「该股票全量重放」

新增 `rebuildHoldingChain(stockCode)`：按 `trade_date ASC, id ASC` 取出该股票全部交易记录，以 `{holdingCount: 0, holdingPrice: 0}` 为起点逐条调用 `calcHoldingPrice()` 并 UPDATE 快照字段。编辑与删除都调用它，同时移除 `TradeEditor` 传入的 `holdingCount/holdingPrice`（`UpdateTradeInput` 不再接受这两个字段）。

选择全量重放而非「只重放变更点之后」的原因：改交易日期会改变记录顺序、删除会改变周期起点（历史交易靠 `holding_count=0` 识别开仓-清仓周期），局部重放需要额外判定边界且容易漏；全量重放逻辑单一、可用一组固定夹具验证。

*代价*：用户曾手工填写的快照值、以及已清仓历史周期的数值可能被修正；这正是修复目标，但需要在发布说明里提示。

### 6. 资金侧只重算余额链 + 同步金额，不重建明细

- 删除交易：按现有行为删除 `trade_record_id` 关联的明细，但删除后 MUST 调用 `fundService.recalculateBalancesAfterDate()` 重建 `account_balance` 链。
- 编辑价格/数量/类型：用 `calcStockBuyAmount()` / `calcStockSellAmount()` 同步更新关联 `STOCK_BUY`/`STOCK_SELL` 明细的金额与日期，再重算余额链；MUST NOT 新建明细。
- `DIVIDEND` / `DIVIDEND_TAX` 明细不自动重建（见 Open Questions）。

*备选*：按新交易重新跑一遍 `position:add-record` 的同步逻辑并替换全部关联明细。会重复计算 FIFO 股息税、可能生成重复记录，风险高于收益。

### 7. IPC 校验用手写 assert + 统一包装，不引新依赖

新增 `electron/ipcValidation.ts`：`assertString/assertNumber/assertEnum/assertDate/assertObject` + `validatedHandle(channel, schema, handler)` 包装 `ipcMain.handle`。校验失败抛 `ValidationError`，由包装层转成 `{ success:false, code:'INVALID_INPUT', field, message }`，并写日志（通道名 + 失败字段，不记录值）。

*备选*：引入 zod。语义更强，但要加依赖、处理打包与 CJS/ESM、并让 46 个 handler 的返回契约全部改造；手写 assert 更贴合现有 `assertKlinePeriod()` 白名单风格，且可逐个通道灰度接入。

分页做双层防护：入口校验 `page/pageSize` 为正整数并 clamp（如 `1 <= pageSize <= 100`），`getTradeRecords()` 内部也统一用 `?` 占位传入 `LIMIT/OFFSET`。`config:set` 按 `AppConfig` schema 校验；`loadConfig()` 与 `DEFAULT_CONFIG` 合并，避免库内坏值在行情轮询时才炸。

## Risks / Trade-offs

- **[存量快照被覆盖]** 全量重放会修正历史周期与用户手填的 `holdingPrice`，用户可能看到盈亏数字变化 → 缓解：发布说明明确提示；重放前不改表结构，可回退版本；提供单测固定期望值便于核对。
- **[事务中途崩溃丢整批]** 批次内不落盘，异常退出会丢这一批 → 缓解：批次粒度是单笔交易；备份前与退出前强制落盘；相比现在的「丢资金明细但留交易记录」，状态是完整的。
- **[备份前多一次全库序列化]** 大库时备份耗时上升 → 缓解：触发点仅两处；后续若改为增量 SQLite 再优化。
- **[校验上线后前端旧调用被拒]** 若现有 UI 传了不合规参数会立即报错 → 缓解：schema 按当前前端实际取值设定，逐通道接入并补契约测试，不一次性全量切换。
- **[事务与既有 saveDatabase 调用点混用]** 事务内若仍触发落盘会写出中间态 → 缓解：`runInTransaction()` 内禁止调用 `saveDatabase()`，代码审查 + 单测断言。
- **[股息税明细不同步]** 编辑/删除卖出记录后 `DIVIDEND_TAX` 金额可能不再匹配 → 缓解：明确列为已知限制，在 Open Questions 中决定后续是否单独立项。

## Migration Plan

无表结构变更、无迁移文件、无数据格式变更，发布不需要升级 `user_version`。

实施顺序：校验工具与类型 → 数据层（`skipSave` / `runInTransaction` / 占位符 / 重放函数） → IPC handler 接入 → 备份服务 → UI → 测试与验收。每一步保持可编译，避免一次性大改。

回滚策略：本 change 不写新表、不改磁盘格式，出现问题时可按文件 `git revert`；若重放结果不符合预期，用现有 `stockanalyzer.db.bak-<时间戳>` 或每日备份覆盖恢复即可，新版本读到旧库不会触发任何自动重算。

验收方式：`npm run typecheck`、`npm test`；手工用例包括：把备份目录设为不可写后点「备份数据库」应提示失败；新增一笔买入后立即手动备份，检查备份库里 `trade_record` 与 `STOCK_BUY` 同时存在；改中间一笔买入价格后，检查后续 `holding_price` 与 `account_balance` 全链更新；给 `position:get-records` 传 `pageSize=-1`/字符串应返回结构化错误且日志无 SQL 异常。

## Open Questions

- 是否需要提供一个一次性的「重建全部股票持仓链」入口，用于纠正存量库中已经算错的快照？（当前决定：不提供）
- 编辑卖出记录时是否要自动重建 FIFO 股息税 `DIVIDEND_TAX` 明细？（当前决定：不重建，列为已知限制）
- 自动备份失败的用户可见方式采用系统通知还是日志页红标？（当前决定：系统通知 + 错误日志）
