## MODIFIED Requirements

### Requirement: FR-008
仿真 MUST 基于日 K 收盘价逐日运行，按网格档位生成买入/卖出操作历史。买入/卖出数量 MUST 向下取整到 100 股的整数倍（MIN_TRADE_UNIT = 100）。采用游标档位 + 虚拟卖出占位模型；维护游标 `cursorIdx`（最近一次操作档位，含虚拟卖出）。买卖 MUST 相对游标相邻档位判定：当日 `high` 涨穿 `levels[cursorIdx+1]` → 以该档位值「卖出」并游标上移一格（真实持仓 > 0 则实际卖出，已空仓则记 `virtual` 虚拟卖出仅占位、不影响现金/持仓）；当日 `low` 跌穿 `levels[cursorIdx-1]` → 以该档位值真实买入并游标下移一格。成交价 MUST 采用档位值（非收盘价），均不得超过网格上下限；`spacingType='percentage'` 时档位按等比（上一档 × (1 + spacing)）生成。上涨卖出的减仓比例 MUST 依据所选网格策略（`GridSimulationInput.gridStrategy`）决定：

- **网格策略1（默认 `'strategy1'`）**：一次性卖出当前批次的全部持仓（LIFO：卖出最近买入、价格最低的那一批）。
- **网格策略2（`'strategy2'`）**：每次上涨穿越时，对所有「已穿越待减」的批次（买入档位低于本次卖出档位且尚未卖光的批次）**各自分两段减仓**：首次穿越卖 `floorToLot(批次股数/2)`（向下取整到 100 股），之后再穿越则卖出该批次剩余全部股数；同一档位穿越会为多个批次分别生成 SELL 记录；某批次卖光后才从栈中弹出。
- **网格策略3（`'strategy3'`）**：卖出数量逻辑与策略1 一致（LIFO 整批卖出当前批次），但触发档位改为买入档位的「高 2 格」——在 `level[i]` 买入的批次，须待价格上穿 `level[i+2]` 时才整批卖出；仅上穿 `level[i+1]`（高 1 格）时不触发卖出。
- **网格策略4（`'strategy4'`）**：采用「持仓市值与现金平衡（半仓平衡）」算法，**完全不依赖网格**（无网格间距、无档位、无 LIFO 批次栈、无虚拟卖出占位）。评估节奏为**逐日（含首日）以当日收盘价**调用一次平衡再评估，单个交易日最多产生一笔操作：
  - 总资产 `totalAssets = 现金 + 持仓市值`（持仓市值 = 当前持仓股数 × 当日收盘价）；目标持仓金额 `targetValue = totalAssets / 2`。
  - 偏差 `deviation = (持仓市值 − 现金) / totalAssets`。
  - 当 `deviation < −5%`（持仓不足）时买入：`targetShares = floor(targetValue / 收盘价)`，`buyShares = floorToLot(targetShares − 当前持仓股数)`，受 `buyShares × 收盘价 + 手续费 <= 现金` 约束（现金不足时按可负担数量向下取整到 100 股）；买入后现金扣减、持仓增加。
  - 当 `deviation > +5%`（持仓过多）时卖出：`sellShares = floorToLot(当前持仓股数 − floor(targetValue / 收盘价))`，受 `sellShares <= 当前持仓股数` 约束；卖出后现金增加（扣手续费）、持仓减少。
  - `|deviation| <= 5%` 时不产生任何操作。成交价一律使用当日收盘价。策略4 MUST NOT 生成 `virtual=true` 的虚拟卖出记录；首日空仓时偏差为 −100%（持仓不足），故首日即建底仓。

#### Scenario: 策略4 持仓不足时按目标差额买入
- **WHEN** 仿真以 `gridStrategy='strategy4'` 运行，某日收盘价处现金=70000、持仓市值=30000（总资产 100000），则 `deviation = (30000−70000)/100000 = −40% < −5%`
- **THEN** 系统 MUST 以该收盘价买入 `floorToLot(floor(50000/收盘价) − 当前持仓股数)` 股（受现金约束），现金扣减、持仓增加

#### Scenario: 策略4 持仓过多时按目标差额卖出
- **WHEN** 仿真以 `gridStrategy='strategy4'` 运行，某日收盘价处现金=20000、持仓市值=80000（总资产 100000），则 `deviation = (80000−20000)/100000 = +60% > +5%`
- **THEN** 系统 MUST 以该收盘价卖出 `floorToLot(当前持仓股数 − floor(50000/收盘价))` 股（受持仓约束），现金增加、持仓减少
- **AND** 当现金=45000、持仓市值=55000（总资产 100000）时 `deviation = +5%`，未超过阈值，MUST NOT 卖出

#### Scenario: 策略4 偏差未超阈值时不操作
- **WHEN** 仿真以 `gridStrategy='strategy4'` 运行，某日收盘价处 `|deviation| <= 5%`
- **THEN** 系统 MUST NOT 在该日生成任何买入或卖出记录

#### Scenario: 策略4 单日最多一笔操作且不生成虚拟卖出
- **WHEN** 仿真以 `gridStrategy='strategy4'` 运行
- **THEN** 系统 MUST NOT 生成任何 `virtual=true` 记录；且任一日历日 MUST NOT 产生超过 1 笔操作（逐日收盘评估，不依赖网格穿越）

### Requirement: FR-018
系统 MUST 在网格仿真参数表单提供「网格策略」下拉框，让用户选择仿真所使用的卖出（或平衡）策略；选择结果 MUST 通过 `GridSimulationInput.gridStrategy` 传入 `runGridSimulation`。可用选项 MUST 至少包含：网格策略1（`'strategy1'`，整批清仓，触发偏移 1 格）、网格策略2（`'strategy2'`，分步减仓，触发偏移 1 格）、网格策略3（`'strategy3'`，隔两档卖出，触发偏移 2 格）、网格策略4（`'strategy4'`，半仓平衡，基于持仓市值与现金偏差动态买卖）。默认值为「网格策略1（整批清仓）」；未提供 `gridStrategy` 时 MUST 按「网格策略1」执行并保持向后兼容。结果区「简化假设说明」MUST 标明当前所选策略；当选中 strategy4 时 MUST 注明其采用「持仓市值与现金平衡（半仓平衡）」算法、阈值为 ±5%、不依赖固定批次机械买卖。表单 MUST 在选中 strategy4 时**隐藏网格专属参数**（网格上限/下限/间距/间距类型/每格股数），因其对半仓平衡无意义（策略4 仅按日收盘做再平衡）。

#### Scenario: 下拉框包含策略4 选项
- **WHEN** 用户打开网格仿真参数表单
- **THEN** 「网格策略」下拉框 MUST 包含「网格策略4（半仓平衡）」选项，`value='strategy4'`

#### Scenario: 选中策略4 时结果说明标注算法语义
- **WHEN** 用户选择「网格策略4（半仓平衡）」并完成仿真
- **THEN** 结果区「简化假设说明」MUST 标明当前为「网格策略4（半仓平衡）」，并注明其基于持仓市值与现金偏差（阈值 ±5%）动态买卖、不依赖固定批次机械买卖
