# Spec: 证券名录查询能力

**Capability**: securities-directory-query  
**Status**: Active  
**Last Updated**: 2026-11-27

## Purpose

本规格定义全市场证券名录的只读查询语义：分页、代码与名称关键字检索、交易所与在市状态筛选、返回字段边界，以及行情库未初始化时失败与空名录的区分。查询只读取 `market_data.db` 的 `securities` 表，不产生行情请求或数据写入。

## Requirements

### Requirement: 系统提供证券名录分页查询通道

系统 SHALL 提供 IPC 通道 `market:securities:list`，由主进程读取 `market_data.db` 的 `securities` 表完成过滤、计数与分页，单次只返回当前页数据。入参 SHALL 为 `{ keyword?, exchange?, status?, page?, pageSize? }`，返回体 SHALL 为 `{ items, total, page, pageSize }`。

- `page` 为从 1 开始的整数，缺省 1；`pageSize` 缺省 50，MUST 不超过 200。
- 排序 MUST 固定为 `code` 升序，保证同一筛选条件下多次查询顺序稳定。
- `total` MUST 使用与列表查询完全相同的过滤条件统计。
- `items[]` 每项 MUST 包含 `code`、`name`、`exchange`、`listDate`、`delistDate`、`isActive`、`codeSource`，MUST NOT 包含任何价格字段。

#### Scenario: 默认查询第一页在市证券
- **WHEN** 渲染进程调用 `market:securities:list` 且不传任何参数
- **THEN** 系统返回 `status = active` 条件下按 `code` 升序的第一页 50 条记录，`page = 1`、`pageSize = 50`，`total` 为在市证券总数

#### Scenario: 请求超出总页数
- **WHEN** 调用方请求 `page` 大于总页数且筛选条件下存在记录
- **THEN** 系统返回 `items = []` 且 `total` 仍为该筛选条件下的真实总数，不抛错

#### Scenario: 每页条数超过上限
- **WHEN** 调用方请求 `pageSize = 500`
- **THEN** 系统拒绝该请求并返回校验失败，不静默截断为 200

#### Scenario: 分页结果不重复不遗漏
- **WHEN** 同一筛选条件下连续请求 `page = 1` 与 `page = 2`，每页 50 条
- **THEN** 两页的 `code` 集合互不重叠，且并集按 `code` 升序连续

### Requirement: 关键字按代码与名称包含匹配

系统 SHALL 在 `keyword` 去除首尾空白后非空时，追加 `(code LIKE '%kw%' OR name LIKE '%kw%')` 条件。`keyword` 为空或仅含空白时 MUST NOT 追加该条件。

#### Scenario: 代码片段命中
- **WHEN** `keyword = "6005"`
- **THEN** 返回 `code` 包含 `6005` 的证券，如 `600519`

#### Scenario: 名称片段命中
- **WHEN** `keyword = "银行"`
- **THEN** 返回 `name` 包含「银行」的证券

#### Scenario: 纯空白关键字不过滤
- **WHEN** `keyword = "   "`
- **THEN** 系统按无关键字处理，返回当前交易所与状态筛选下的全部结果

#### Scenario: 关键字无匹配
- **WHEN** `keyword` 匹配不到任何证券
- **THEN** 系统返回 `items = []`、`total = 0`，不抛错

### Requirement: 交易所与在市状态筛选可组合

系统 SHALL 支持 `exchange` 取 `ALL`、`SH`、`SZ`、`BJ`，缺省 `ALL` 表示不限制；`status` 取 `active`、`all`，缺省 `active` 表示仅 `is_active = 1`，`all` 表示包含退市证券。多个筛选条件 MUST 以 AND 组合，并与关键字条件同时生效。

#### Scenario: 按深市筛选
- **WHEN** `exchange = "SZ"` 且 `status = "active"`
- **THEN** 返回的所有记录 `exchange` 均为 `SZ` 且 `isActive` 为 true

#### Scenario: 包含退市证券
- **WHEN** `status = "all"` 且证券池中存在 `is_active = 0` 的记录
- **THEN** 结果中包含该退市记录，且该记录 `delistDate` 或状态标识可区分于在市证券

#### Scenario: 筛选项组合无结果
- **WHEN** `exchange = "BJ"`、`status = "active"` 与不匹配的关键字同时生效
- **THEN** 系统返回空列表与 `total = 0`

### Requirement: 查询失败与空名录必须区分

行情库未初始化或查询抛错时，通道 MUST 以失败（rejected promise）返回，MUST NOT 吞错返回空列表。系统 SHALL 仅在查询成功且 `total = 0` 时表达「名录为空」。

#### Scenario: 行情库未初始化
- **WHEN** `getMarketDb()` 抛出「行情库未初始化」且渲染进程调用该通道
- **THEN** 调用方收到 rejected promise 并携带错误信息，不收到空列表结果

#### Scenario: 名录确实为空
- **WHEN** 行情库已初始化但 `securities` 表无任何记录
- **THEN** 通道成功返回 `items = []`、`total = 0`

#### Scenario: 入参校验失败
- **WHEN** 调用方传入非法的 `exchange` 或非整数的 `page`
- **THEN** 系统返回 `INVALID_INPUT` 校验错误结构，不执行数据库查询
