# Feature Specification: 网格交易仿真

**Feature Branch**: `grid-trading-simulation`
**Created**: 2026-08-21
**Status**: Draft
**Input**: User description: "实现网格交易仿真功能，选择开始日期，输入股票代码、初始资金、网格上下限、间距等信息，程序根据过往 K 线数据自动生成买入、卖出、分红等网格仿真操作历史记录，并计算总收益、年化收益等"

## Clarifications

### Session 2026-08-21

- Q: 仿真计算在哪里执行 → A: 纯前端计算，复用 `klineAPI.getKlineData` 读取历史日 K，不新增 IPC 通道（与 008-grid-trading 约定一致）
- Q: 分红数据来源 → A: `kline_data` 无分红字段，采用可配置简化模型（每股年股息 × 持仓股数），默认关闭
- Q: 是否写入数据库 → A: 否，纯只读回测，不影响 trade_record / transfer_record
- Q: 交易单位与费用 → A: 沿用 A 股 100 股整数倍；手续费万 2.5 最低 5 元，卖出印花税万 5，均可配置
- Q: UI 风格 → A: 复用 GridView.vue 的卡片/指标/标签样式与 useToast

---

## User Scenarios & Testing

### User Story 1 - 仿真参数输入 (Priority: P1)

作为用户，我需要输入网格仿真参数，以便基于历史行情回测策略。

**Why this priority**: 仿真的入口，必备

**Acceptance Scenarios**:

1. **Given** 用户打开网格交易仿真页面，**When** 页面加载完成，**Then** 应显示仿真参数表单，包含：开始日期、股票代码、初始资金、网格上限、网格下限、网格间距、间距类型（固定金额/百分比）、每格股数（或手数，可留空自动估算）
2. **Given** 用户已填写参数，**When** 点击"开始仿真"按钮，**Then** 系统应先调用 `klineAPI.getKlineData` 获取该股票开始日期之后的日 K 数据
3. **Given** 所选股票在开始日期之后无 K 线数据，**When** 用户点击"开始仿真"，**Then** 系统应使用 `useToast` 提示"该股票历史数据不足"并中止仿真
4. **Given** 用户输入非法参数（如上限≤下限、初始资金≤0、间距≤0），**When** 点击"开始仿真"，**Then** 系统应使用 `useToast` 提示具体错误且不执行仿真

### User Story 2 - 生成仿真操作历史 (Priority: P1)

作为用户，我需要查看网格仿真自动生成的操作历史，以便了解策略在历史上如何买卖。

**Why this priority**: 核心交付物之一

**Acceptance Scenarios**:

1. **Given** 仿真参数合法且存在足够历史 K 线，**When** 仿真运行完成，**Then** 系统应生成一份操作历史记录，每条包含：交易日期、操作类型（买入/卖出/分红）、成交价格、成交数量、手续费、操作后现金、操作后持仓、操作后持仓市值
2. **Given** 游标在非最低档且当日最低价 `low` 跌穿游标下一档 `levels[cursorIdx-1]` 且现金充足，**When** 仿真处理该日，**Then** 系统应以**该档位值** `levels[cursorIdx-1]` 生成一条真实买入记录，买入股数 = 用户手动填写的「每格股数」或按「初始资金 ÷ 档位数 ÷ 档位触发价」自动估算（均向下取整到 100 股）且不低于网格下限；游标下移一格
3. **Given** 游标在非最高档且当日最高价 `high` 涨穿游标上一档 `levels[cursorIdx+1]`，**When** 仿真处理该日，**Then** 系统应以**该档位值** `levels[cursorIdx+1]` 生成一条卖出记录；若当时真实持仓 > 0 则实际卖出（卖出全部持仓）并游标上移一格，若已空仓则生成一条 `virtual=true` 的虚拟卖出记录仅作占位（不影响现金/持仓、股数为 0）并游标上移一格
4. **Given** 单日价格跨越多个档位（参考当日 `[low, high]`），**When** 仿真处理该日，**Then** 系统 MUST 两遍都跑：先沿主导方向单向推到尽头、再沿反方向单向推到尽头（每遍单方向 while，不反复重入，故单日大振幅不死循环）；主导方向由收盘价相对当日区间中点决定（`close >= (low+high)/2` 偏涨→先下后上、偏跌→先上后下）；单日可连续穿越多档且可同时买入与卖出；成交价一律使用档位值；并在结果说明中注明盘中高低价参与判定、空仓时以虚拟卖出占位的简化假设
5. **Given** 首日收盘价处于网格区间内，**When** 仿真首日运行，**Then** 系统应以首个收盘价**向上最近档位值**建立底仓（例如 4.32 → 4.4 买入），游标指向该档；高于上限则不建仓（游标置 -1 等待下跌）、低于下限以最低档建仓
6. **Given** 网格买卖逻辑，**When** 系统决定下一笔操作，**Then** MUST 依据价格相对游标相邻档位的穿越方向（涨穿游标上一档则卖、跌穿游标下一档则买）决定买卖，MUST NOT 仅依据上次成交价格决定买卖方向；空仓沿原方向推进时以虚拟卖出占位维持游标
7. **Given** 用户选择百分比（percentage）间距类型，**When** 仿真运行，**Then** 系统 MUST 按等比档位（每档 = 上一档 × (1 + spacing)）生成网格并触发交易，与固定金额间距行为一致

### User Story 3 - 收益指标计算与展示 (Priority: P1)

作为用户，我需要查看仿真收益指标，以便评估策略表现。

**Why this priority**: 核心交付物之一

**Acceptance Scenarios**:

1. **Given** 仿真完成，**When** 结果区渲染，**Then** 系统应展示指标卡片：期末总资产、总收益、总收益率、年化收益率（标注按自然日计算）、最大回撤、累计分红、交易笔数
2. **Given** 仿真完成，**When** 计算指标，**Then** 系统 MUST 按公式：期末总资产 = 期末现金 + 期末持仓股数 × 期末收盘价；总收益 = 期末总资产 − 初始资金；总收益率 = 总收益 / 初始资金 × 100%；年化收益率 = (1 + 总收益率)^(365 / 持有自然日数) − 1
3. **Given** 仿真完成，**When** 计算最大回撤，**Then** 系统 MUST 逐日跟踪总资产曲线，最大回撤 = max(峰值总资产 − 谷值总资产) / 峰值总资产 × 100%
4. **Given** 金额类指标，**When** 展示，**Then** 所有金额应保留 2 位小数；盈亏为正当显示红色（#F56C6C），为负当显示绿色（#67C23A），与现有 GridView 配色一致

### User Story 4 - 重置与重跑 (Priority: P2)

作为用户，我需要重置仿真，以便清除结果重新配置。

**Acceptance Scenarios**:

1. **Given** 用户已完成一次仿真，**When** 点击"重置"按钮，**Then** 所有参数表单保留、操作历史与结果指标应被清空隐藏
2. **Given** 用户修改参数后再次点击"开始仿真"，**When** 仿真完成，**Then** 结果区应刷新为新参数对应的操作历史与指标

## Requirements

### Functional Requirements

- **FR-001**: 系统 MUST 在导航中提供"网格交易仿真"入口，并注册 `GridSimulationView` 组件
- **FR-002**: 仿真参数表单 MUST 包含字段：开始日期、股票代码、初始资金、网格上限、网格下限、网格间距、间距类型（fixed/percentage）、每格股数（可留空，留空时由系统自动估算）
- **FR-003**: 用户点击"开始仿真"后，系统 MUST 调用 `klineAPI.getChartData(stockCode, '')` 获取**不复权**历史日 K 数据，并按开始日期过滤
- **FR-003a**: 除权导致的价格跳变（如分红后股价从 10 元到 9 元）首版 MUST 当作普通网格向下穿越处理，**MUST NOT** 识别或跳过除权跳变日；分红现金 MUST NOT 计入仿真
- **FR-004**: 当开始日期之后无 K 线数据时，系统 MUST 使用 `useToast` 提示"该股票历史数据不足"并中止
- **FR-005**: 当参数非法（上限≤下限、初始资金≤0、间距≤0、填写的每格股数≤0）时，系统 MUST 使用 `useToast` 提示且不执行仿真；每格股数留空视为合法（走自动估算）
- **FR-006**: 仿真 MUST 基于日 K 收盘价逐日运行，按网格档位生成买入/卖出操作历史
- **FR-007**: 买入/卖出数量 MUST 向下取整到 100 股的整数倍（MIN_TRADE_UNIT = 100）
- **FR-008**: 采用游标档位 + 虚拟卖出占位模型；维护游标 `cursorIdx`（最近一次操作档位，含虚拟卖出）。买卖 MUST 相对游标相邻档位判定：当日 `high` 涨穿 `levels[cursorIdx+1]` → 以该档位值「卖出」并游标上移一格（真实持仓 > 0 则实际卖出，已空仓则记 `virtual` 虚拟卖出仅占位、不影响现金/持仓）；当日 `low` 跌穿 `levels[cursorIdx-1]` → 以该档位值真实买入并游标下移一格。成交价 MUST 采用档位值（非收盘价），均不得超过网格上下限；`spacingType='percentage'` 时档位按等比（上一档 × (1 + spacing)）生成。上涨卖出的减仓比例 MUST 依据所选网格策略（`GridSimulationInput.gridStrategy`）决定：
  - **网格策略1（默认 `'strategy1'`）**：一次性卖出当前批次的全部持仓（LIFO：卖出最近买入、价格最低的那一批）。
  - **网格策略2（`'strategy2'`）**：每次上涨穿越时，对所有「已穿越待减」的批次（买入档位低于本次卖出档位且尚未卖光的批次）**各自分两段减仓**：首次穿越卖 `floorToLot(批次股数/2)`（向下取整到 100 股），之后再穿越则卖出该批次剩余全部股数；同一档位穿越会为多个批次分别生成 SELL 记录；某批次卖光后才从栈中弹出。
  - **网格策略3（`'strategy3'`）**：卖出数量逻辑与策略1 一致（LIFO 整批卖出当前批次），但触发档位改为买入档位的「高 2 格」——在 `level[i]` 买入的批次，须待价格上穿 `level[i+2]` 时才整批卖出；仅上穿 `level[i+1]`（高 1 格）时不触发卖出。
  - **网格策略4（`'strategy4'`）**：采用「持仓市值与现金平衡（半仓平衡）」算法，**完全不依赖网格**（无网格间距、无档位、无 LIFO 批次栈、无虚拟卖出占位）。评估节奏为**逐日（含首日）以当日收盘价**调用一次平衡再评估，单个交易日最多产生一笔操作：总资产 `totalAssets = 现金 + 持仓市值`，目标持仓金额 `targetValue = totalAssets / 2`，偏差 `deviation = (持仓市值 − 现金) / totalAssets`；当 `deviation < −5%`（持仓不足）时买入 `floorToLot(floor(targetValue / 收盘价) − 当前持仓股数)` 股（受 `buyShares × 收盘价 + 手续费 <= 现金` 约束，现金不足时按可负担数量向下取整到 100 股）；当 `deviation > +5%`（持仓过多）时卖出 `floorToLot(当前持仓股数 − floor(targetValue / 收盘价))` 股（受持仓约束）；`|deviation| <= 5%` 时不产生任何操作。成交价一律使用当日收盘价；策略4 MUST NOT 生成 `virtual=true` 的虚拟卖出记录，首日空仓时偏差为 −100%（持仓不足），故首日即建底仓。
- **FR-008a**: 首日 MUST 以首个收盘价向上最近档位值建立底仓（如 4.32 → 4.4 买入），游标指向该档；高于上限不建仓（游标置 -1 等待下跌）、低于下限以最低档建仓
- **FR-008b**: 当日 `[low, high]` MUST 参与档位穿越判定，单日 MUST 两遍都跑以支持反向震荡（先主方向单向推到尽头、再反方向单向推到尽头，每遍单方向 while 不反复重入）；主导方向由收盘价相对当日区间中点决定：`close >= (low+high)/2` 偏涨→先下后上，`close < (low+high)/2` 偏跌→先上后下；游标终点落在与收盘同向一侧；故单日可连续穿越多档且可同时买入与卖出
- **FR-009**: 系统 MUST NOT 仅凭上次成交价格决定下一笔买卖方向，下一笔 MUST 由价格相对游标相邻档位的穿越方向决定；空仓沿原方向推进时 MUST 以虚拟卖出占位维持游标，使后续反向穿越能触发真实买入
- **FR-010**: 系统 MUST 按可配置手续费率（默认万 2.5、最低 5 元）计算每笔买入/卖出手续费，卖出另计印花税（默认万 5）
- **FR-011**: 首版分红暂不实现，仿真 MUST NOT 生成 `DIVIDEND` 记录；类型中 `dividendPerShare` 字段预留但算法忽略
- **FR-012**: 仿真 MUST 为纯只读回测，不得写入 `trade_record` / `transfer_record` 或任何数据库表
- **FR-013**: 系统 MUST 计算并展示：期末总资产、总收益、总收益率、年化收益率、最大回撤、交易笔数（首版不含分红指标）
- **FR-014**: 收益指标 MUST 按 design.md D5 公式计算；年化收益率 MUST 采用自然日口径（持有天数 = 期末日期 − 开始日期的日历天数），并在 UI 标注"按自然日计算"
- **FR-015**: 操作历史 MUST 以表格展示，列包含：交易日期、操作类型、成交价格、成交数量、手续费、操作后现金、操作后持仓、操作后持仓市值
- **FR-016**: 用户 MUST 能够重置仿真，清空操作历史与结果指标（参数表单可保留）
- **FR-017**: 仿真过程中出现异常时，系统 MUST 使用 `useToast` 显示错误提示
- **FR-018**: 系统 MUST 在网格仿真参数表单提供「网格策略」下拉框，让用户选择仿真所使用的卖出（或平衡）策略；选择结果 MUST 通过 `GridSimulationInput.gridStrategy` 传入 `runGridSimulation`。可用选项 MUST 至少包含：网格策略1（`'strategy1'`，整批清仓，触发偏移 1 格）、网格策略2（`'strategy2'`，分步减仓，触发偏移 1 格）、网格策略3（`'strategy3'`，隔两档卖出，触发偏移 2 格）、网格策略4（`'strategy4'`，半仓平衡，基于持仓市值与现金偏差动态买卖）。默认值为「网格策略1（整批清仓）」；未提供 `gridStrategy` 时 MUST 按「网格策略1」执行并保持向后兼容。结果区「简化假设说明」MUST 标明当前所选策略；当选中 strategy4 时 MUST 注明其采用「持仓市值与现金平衡（半仓平衡）」算法、阈值为 ±5%、不依赖固定批次机械买卖。表单 MUST 在选中 strategy4 时**隐藏网格专属参数**（网格上限/下限/间距/间距类型/每格股数），因其对半仓平衡无意义（策略4 仅按日收盘做再平衡）。

### Display Requirements

- **DR-001**: 金额类指标保留 2 位小数
- **DR-002**: 盈亏为正显示红色（#F56C6C），为负显示绿色（#67C23A）
- **DR-003**: 操作类型标签：买入红色、卖出绿色、分红蓝色/中性
- **DR-004**: 指标使用卡片展示，操作历史使用可滚动表格
- **DR-005**: 结果说明区应注明简化假设（单日最多成交一次、年化按自然日口径、首版不含分红、不复权且忽略除权影响）

### Data Display

- **DD-001**: 手数 = 股数 / 100
- **DD-002**: 年化收益率以百分比展示并标注口径
- **DD-003**: 最大回撤以百分比展示

## Key Entities

### 仿真输入 (GridSimulationInput)

| 属性 | 类型 | 说明 |
|------|------|------|
| startDate | string | 开始日期 (YYYY-MM-DD) |
| stockCode | string | 股票代码（纯数字） |
| initialCapital | number | 初始资金（元） |
| upperLimit | number | 网格上限价格 |
| lowerLimit | number | 网格下限价格 |
| spacing | number | 网格间距（fixed 为金额，percentage 为比例） |
| spacingType | 'fixed' \| 'percentage' | 间距类型 |
| sharesPerGrid | number \| null | 每格交易股数（向下取整到 100）；为 null 时按「初始资金 ÷ 档位数 ÷ 触发价」自动估算 |
| commissionRate | number | 手续费率（默认 0.00025） |
| minFee | number | 最低手续费（默认 5） |
| stampTaxRate | number | 印花税（默认 0.0005，仅卖出） |
| dividendPerShare | number | 每股年股息（首版预留字段，默认 0，算法忽略） |

### 仿真操作记录 (GridSimulationOperation)

| 属性 | 类型 | 说明 |
|------|------|------|
| date | string | 交易日期 (YYYY-MM-DD) |
| type | 'BUY' \| 'SELL' \| 'DIVIDEND' | 操作类型 |
| price | number | 成交价格 |
| shares | number | 成交数量（股） |
| fee | number | 手续费（含印花税） |
| cashAfter | number | 操作后现金 |
| holdingAfter | number | 操作后持仓股数 |
| holdingValueAfter | number | 操作后持仓市值 |
| virtual | boolean (optional) | 是否虚拟操作。空仓时本应"卖出"却无货可卖，记一笔 virtual=true 的 SELL 仅作占位（cash/holding/fee 不变、shares=0），用于维持游标使后续反向穿越触发真实买入 |

### 仿真结果 (GridSimulationResult)

| 属性 | 类型 | 说明 |
|------|------|------|
| operations | GridSimulationOperation[] | 操作历史 |
| finalCash | number | 期末现金 |
| finalHolding | number | 期末持仓股数 |
| finalPrice | number | 期末收盘价 |
| finalTotalAssets | number | 期末总资产 |
| totalProfit | number | 总收益 |
| totalProfitRate | number | 总收益率(%) |
| annualizedReturn | number | 年化收益率(%) |
| maxDrawdown | number | 最大回撤(%) |
| tradeCount | number | 交易笔数 |

## Display Conventions

- 盈亏颜色：正红负绿，与 GridView 一致
- 操作类型标签：买入红、卖出绿、分红中性蓝
- 年化口径：自然日，UI 标注

## Success Criteria

### Measurable Outcomes

- **SC-001**: 单只股票完整历史（数千行 K 线）仿真耗时 < 500ms
- **SC-002**: 用户输入非法参数时，500ms 内给出 toast 提示且不崩溃
- **SC-003**: 仿真结果与手算抽样在 ±1 元内一致（核心指标）

## Assumptions

- 历史行情来自本地 `kline_data`，按 trade_date 升序
- A 股最小交易单位 100 股
- 分红为可选简化模型，默认关闭，不扣税
- 单日游标可连续穿越多档（上涨/下跌逐格推进）
- 空仓沿原方向推进时以虚拟卖出占位，股数为 0、不影响现金与持仓
- 年化按自然日计算
