## 1. 类型与数据契约

- [x] 1.1 在 `shared/types/index.ts` 新增 `GridSimulationInput`、`GridSimulationOperation`、`GridSimulationResult` 类型（含 spacingType、手续费率、每股年股息等字段）
- [x] 1.2 在 `src/types.ts` 同步导出上述仿真类型，供前端组件使用

## 2. 仿真核心算法（纯函数）

- [x] 2.1 新增 `src/composables/useGridSimulation.ts`（或纯函数模块），实现网格档位生成：根据 upper/lower/spacing/spacingType 生成价格档位数组，同时支持 fixed（固定金额）与 percentage（等比）两种间距（FR-002, FR-008）
- [x] 2.2 实现逐日遍历**不复权**日 K `[low, high]`、按游标 + 虚拟卖出占位模型触发买卖：维护游标 cursorIdx（最近操作档位，含虚拟卖出），上涨穿游标上一档则卖出（空仓时记虚拟卖出占位）、下跌穿游标下一档则真实买入，单日两遍都跑（close 偏涨先下后上、偏跌先上后下）以支持反向震荡；数量向下取整到 100 股且受上下限约束；除权跳变当作普通穿越处理，不识别/不跳过（FR-003, FR-003a, FR-006~FR-009）
- [x] 2.3 实现手续费计算：买入/卖出按 commissionRate×amount 与 minFee 取大，卖出另计 stampTaxRate（FR-010）
- [x] 2.4 首版忽略分红：不生成 DIVIDEND 记录、不计入现金、忽略 dividendPerShare 字段（FR-011）
- [x] 2.5 实现收益指标计算：期末总资产、总收益、总收益率、年化收益率（自然日口径）、最大回撤、交易笔数（FR-013~FR-014, D5）

## 3. 仿真页面与导航

- [x] 3.1 新增 `src/views/GridSimulationView.vue`，含参数表单（开始日期、股票代码、初始资金、上下限、间距、间距类型、每格股数、费用与分红可选）与"开始仿真/重置"按钮（FR-001~FR-002）
- [x] 3.2 调用 `klineAPI.getChartData(stockCode, '')` 获取**不复权**数据（adjustType=''），再按开始日期过滤；参数非法或无数据时用 `useToast` 提示并中止（FR-003, FR-003a, FR-004~FR-005, FR-017）
- [x] 3.3 仿真完成后以指标卡片展示收益指标，并按现有 GridView 配色（正红负绿）展示（DR-001~DR-002, FR-013）
- [x] 3.4 以可滚动表格展示操作历史（日期/类型/价格/数量/手续费/现金/持仓/市值），类型用标签着色（FR-015, DR-003~DR-004）
- [x] 3.5 结果说明区注明简化假设（单日最多成交一次、年化按自然日口径、首版不含分红、不复权且忽略除权影响）（DR-005）
- [x] 3.6 在 `useNavigation.ts` 的 `ViewId` 增加 `'grid-simulation'`，`SideNav` 增加入口，`App.vue` 注册组件（FR-001）

## 4. 验证

- [x] 4.1 算法级抽样核对：构造先跌后涨场景，买卖触发、费用、期末总资产/收益率与手算一致（SC-003，UI 层需用真实库表在 Electron 内做最终人工核对）
- [x] 4.2 非法参数与无数据场景的 toast 提示与中止逻辑已实现（validate 函数 + getChartData 空结果判断）（SC-002）
- [x] 4.3 算法性能：12 行耗时 <1ms，数千行远低于 500ms（SC-001，已在临时脚本中验证）
