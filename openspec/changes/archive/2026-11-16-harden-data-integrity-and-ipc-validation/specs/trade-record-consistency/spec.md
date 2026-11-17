## ADDED Requirements

### Requirement: 交易记录与资金明细以同一批次提交并落盘

系统 SHALL 把「新增交易记录 → 同步资金明细 → 重算资金余额链」作为一个批次，在批次成功提交后 MUST 调用一次 `saveDatabase()`；批次内 MUST NOT 提前落盘。磁盘数据库文件 MUST 包含该批次的全部写入，MUST NOT 出现只有 `trade_record` 而缺少对应 `transfer_records` 的状态。

#### Scenario: 新增一笔买入
- **WHEN** 用户新增一笔买入交易且资金明细同步成功
- **THEN** 磁盘数据库中同时存在该 `trade_record` 与关联的 `STOCK_BUY` 明细，且仅发生一次全库落盘

#### Scenario: 批次提交前读取磁盘
- **WHEN** 批次尚未提交时读取磁盘数据库文件
- **THEN** 文件中不包含该批次的任何中间态写入

### Requirement: 批次失败时整体回滚且不要求手工补录

系统 SHALL 用事务包裹新增交易的批次；任一步失败时系统 MUST 回滚全部写入、向上返回明确错误，MUST NOT 保留「交易记录已保存但资金明细缺失」的半态，MUST NOT 以 `fundSyncSuccess=false` 加「请手动补录」提示作为失败处理方式。

#### Scenario: 资金明细插入失败
- **WHEN** 新增交易过程中资金明细写入抛出异常
- **THEN** 事务回滚，`trade_record` 与 `transfer_records` 均无该批次记录，界面提示保存失败且可重试

#### Scenario: 批次成功
- **WHEN** 批次全部步骤成功
- **THEN** 返回成功结果，不出现资金同步失败的告警

### Requirement: 编辑交易记录后重放持仓快照链

系统 SHALL 在交易记录编辑后，按 `trade_date ASC, id ASC` 顺序以零持仓为起点逐条重放 `calcHoldingPrice()`，重建该股票全部交易记录的 `holding_count` 与 `holding_price`；渲染层 MUST NOT 向主进程传递这两个快照字段，快照 MUST 只由服务端计算。

#### Scenario: 修改中间一笔买入价格
- **WHEN** 用户修改某股票历史中一笔买入的价格
- **THEN** 该笔及其之后所有记录的 `holding_price` 按新价格递推重算，修改点之前的记录保持不变

#### Scenario: 修改交易日期导致顺序变化
- **WHEN** 用户把某笔交易的日期改到更早的位置
- **THEN** 系统按新的时间顺序重放全链，不沿用旧顺序下算出的快照

#### Scenario: 表单不再提交快照字段
- **WHEN** 编辑器提交的表单中不含 `holdingCount` / `holdingPrice`
- **THEN** 服务端仍产生正确的持仓快照，且 `UpdateTradeInput` 不再接受这两个字段

### Requirement: 删除交易记录后重放持仓链与资金余额链

系统 SHALL 在删除交易记录及其关联资金明细后，重放该股票的持仓快照链，并 MUST 重算 `transfer_records.account_balance` 余额链；系统 MUST NOT 留下基于被删除记录计算出的持仓数量、成本价或账户余额。

#### Scenario: 删除中间一笔交易
- **WHEN** 用户删除某股票历史中的一笔交易且该笔有关联资金明细
- **THEN** 后续记录的 `holding_count/holding_price` 按剩余交易重算，所有后续资金明细的 `account_balance` 重新递推

#### Scenario: 删除最后一笔交易
- **WHEN** 用户删除该股票当前周期的最后一笔交易
- **THEN** 持仓快照回到该笔之前的状态，资金余额链不含被删明细的影响

### Requirement: 编辑金额相关字段时同步资金明细

当交易的价格、数量或类型被编辑时，系统 SHALL 用现有费用计算函数同步更新关联 `STOCK_BUY` / `STOCK_SELL` 明细的金额与日期，并 MUST 重算资金余额链；系统 MUST NOT 因编辑而新建重复的关联明细，MUST NOT 留下金额与交易不一致的明细。

#### Scenario: 修改买入数量
- **WHEN** 用户把某笔买入的数量从 100 改为 200
- **THEN** 关联 `STOCK_BUY` 明细金额按新数量重算，后续 `account_balance` 全部重算，明细条数不变

#### Scenario: 交易没有关联资金明细
- **WHEN** 被编辑的交易不存在 `trade_record_id` 关联的资金明细
- **THEN** 系统只重放持仓快照链，不新建明细记录
