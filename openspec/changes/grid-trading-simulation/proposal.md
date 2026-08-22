## Why

现有 `008-grid-trading` 能力仅提供"交易计算"和"开仓计算"两个静态公式，无法验证某一网格策略在真实历史行情下的实际表现。用户需要在建仓前，基于过往 K 线数据对网格策略进行回测仿真，自动生成买入/卖出/分红等操作历史，并直观看到总收益、年化收益等关键指标，从而评估策略优劣、辅助决策。

## What Changes

- 新增「网格交易仿真」页面，提供仿真参数表单：开始日期、股票代码、初始资金、网格上限、网格下限、网格间距（及每格股数/手数）。
- 新增网格仿真计算服务：读取本地 `kline_data` 历史日 K 数据，按网格上下限与间距（支持固定金额 fixed 与百分比 percentage 两种间距类型）生成网格档位，逐日遍历 K 线价格，自动触发买入/卖出信号。
- 自动生成一份结构化的仿真操作历史记录（日期、类型、价格、数量、持仓、现金、手续费等）。
- 计算并展示仿真结果：期末总资产、总收益、总收益率、年化收益率（按自然日口径）、最大回撤、交易次数等。**首版暂不实现分红**。
- 复用现有 `useToast` 消息体系与自定义组件样式，保持与 `GridView.vue` 一致的 UI 风格。
- 仿真为纯客户端只读计算，不写入任何交易/资金数据库表。

## Capabilities

### New Capabilities
- `grid-trading-simulation`: 网格交易历史回测仿真能力，包含仿真参数输入、网格信号生成、操作历史回放、收益指标计算与结果展示。

### Modified Capabilities
<!-- 本变更为新增能力，未修改现有 spec 的需求层级行为 -->

## Impact

- **新增代码**：
  - `electron/services/gridSimulationService.ts`：网格仿真核心算法（纯函数，复用 `kline_data` 查询）。
  - `src/views/GridSimulationView.vue`：仿真页面主组件。
  - `src/types.ts` / `shared/types/index.ts`：新增仿真输入、操作记录、结果等类型与 `GridSimulationAPI`。
  - `electron/index.ts`：新增 `grid-sim:run` IPC 通道（或直接复用 `kline:get-data` 在渲染进程计算）。
- **复用/依赖**：
  - `klineAPI.getKlineData`（或 `database.getKlineData`）读取历史日 K。
  - 现有分红模型参考 `tradeService` 中每股股息 × 持股数量逻辑（仿真采用简化分红模型，参数可选）。
  - 现有 `GridView.vue` 样式与 `useToast` 消息组件。
- **约束**：A 股最小交易单位 100 股；手续费按成交金额固定比例（如万分之 2.5）+ 最低 5 元估算，可配置；不引入新数据库表、不修改现有 `trade_record` / `transfer_record` 数据。
- **依赖**：无新增外部依赖，沿用 TypeScript / Vue 3 / Electron 28 / sql.js 技术栈。
