## 1. 设计令牌层（L1）

- [x] 1.1 新建 `src/styles/_tokens.scss`：字号 6 档（`--font-size-xs` 0.875rem → `--font-size-2xl` 1.75rem，即 14/16/18/20/24/28）、行高 3 档、字重 3 档
- [x] 1.2 定义间距 6 档 `--space-1`(0.25rem) → `--space-6`(2rem)、圆角 `--radius-sm`(4px)/`--radius-md`(6px)/`--radius-lg`(8px)/`--radius-pill`/`--radius-circle`
- [x] 1.3 定义语义色：`--color-primary`/`-dark`/`-subtle`、`--color-success`、`--color-warning`、`--color-danger`/`-dark`、`--color-info`(新增 #3b82f6，承载 23 处余额线/饼图用法)
- [x] 1.4 定义涨跌交易色：`--color-profit`、`--color-loss`、`--color-buy`、`--color-sell`、`--color-dividend`
- [x] 1.5 定义文字 4 阶（`--text-primary` #333 / `--text-secondary` #666 / `--text-tertiary` #9ca3af / `--text-disabled` #d1d5db）、边框 3 阶（`--border-color` #e0e0e0 / `-light` #f3f4f6 / `-strong` #d1d5db）
- [x] 1.6 补齐被引用但未定义的 12 个变量中的 **10 个**（`--secondary-bg` 由 1.10 别名覆盖、`--color-error` 由 1.11 改名处理）：`--bg-primary`(#ffffff)、`--bg-tertiary`(#f3f4f6)、`--bg-hover`、`--bg-highlight`(#e6f4ff)、`--bg-header`(指向 `--title-bar-bg`)、`--card-bg`(#ffffff)、`--input-bg`(#ffffff)、`--disabled-bg`(#f5f5f5)、`--text-primary`(#333333)、`--text-tertiary`(#9ca3af)
- [x] 1.7 定义语义浅底 4 色（`--bg-success-subtle`/`--bg-warning-subtle`/`--bg-danger-subtle`/`--bg-info-subtle`）、遮罩 `--overlay`、焦点环 `--focus-ring`、滚动条 2 个令牌
- [x] 1.8 定义阴影 3 档与层级 3 档（`--z-dropdown`/`--z-modal`/`--z-toast`）
- [x] 1.9 定义图表专用含 alpha 令牌：`--chart-volume-up`、`--chart-volume-down`、`--chart-tooltip-bg`、`--chart-tooltip-text`
- [x] 1.10 添加标注「临时，迁移完成后删除」的兼容别名区，覆盖 9 组旧名：`--bg-color`→`--bg-primary`、`--primary-color`、`--success-color`、`--warning-color`、`--error-color`、`--hover-bg`、`--active-bg`、`--secondary-bg`、`--text-color`
- [x] 1.11 将 `TradeEditor.vue:355,357` 的 `var(--color-error, #e53935)` 直接改名 `--color-danger` 并去掉回退值（不设别名，避免第四种红残留）
- [x] 1.12 改写 `src/styles/main.scss`：`html { font-size: 16px }`、`body { font-size: var(--font-size-sm) }`、引入 `_tokens.scss`，迁移 scrollbar 样式至使用新令牌
- [x] 1.13 启动应用确认无样式塌陷，核对字号基准切换后的整体尺寸变化在预期内（略放大）

## 2. 基础控件样式（L2）

- [x] 2.1 新建 `src/styles/_base.scss`：`.btn` 基础形态（内边距、圆角、字号、过渡）+ 尺寸 `.btn-sm`(32px)/`.btn-md`(36px)，取消 lg
- [x] 2.2 实现 5 种形态：`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.btn-ghost-danger`、`.btn-danger`，每种补齐 hover/active/disabled/loading 状态
- [x] 2.3 实现图标按钮修饰 `.btn-icon`（正方形、无内边距、仅图标），可与上述形态组合
- [x] 2.4 实现 `.input`/`.select`/`.textarea`：高 32px、`border 1px var(--border-color)`、`--radius-sm`、focus 时边框主色 + `box-shadow 0 0 0 3px var(--focus-ring)`
- [x] 2.5 实现 `.form-item`、`.form-label`（label 用 `--font-size-xs` + `--text-secondary`）
- [x] 2.6 实现 `.card`、`.card-header`、`.page`、`.page-header`、`.page-title`（24px + 600）、`.empty-state`、`.tag`
- [x] 2.7 在 `main.scss` 全局引入 `_base.scss`，确认基础类可在任意页面直接使用
- [x] 2.8 核对 `_base.scss` 中的类名与现有 scoped 规则无同名冲突

## 3. AppIcon 图标组件

- [x] 3.1 新建 `src/components/ui/AppIcon.vue`：props `name`（联合类型）与 `size?: 16 | 20`（收紧为字面量联合，不允许任意 number），根节点 `aria-hidden="true"`
- [x] 3.2 图标数据结构为**图元数组**（支持 `path`/`circle`/`line`/`polyline` 混合），用 `v-for` + `component :is` 渲染，不使用单条 `d` 字符串
- [x] 3.3 实现多图元图标：`search`（圆+斜线）、`trash`（盖+桶+竖线）、`download`（箭头+托盘）、`warning`（三角+感叹号）、`info`、`error`（圆+符号）
- [x] 3.4 实现单图元图标：`refresh`、`check`、`close`、`plus`、`edit`、`chevron-down`、`chevron-right`、`help`、`file`、`arrow-up`（共 16 个）
- [x] 3.5 统一 `SideNav` 9 个导航图标的尺寸与线宽（保持 `iconPath` 数据驱动方式不变）
- [x] 3.6 统一 `TitleBar` 3 个窗口控制按钮的尺寸与线宽（保持内联 SVG 不变）

## 4. 图表颜色同源

- [x] 4.1 新建 `src/utils/designTokens.ts`：`token(name, fallback?)` 懒加载读取 `:root` 计算值，成功后缓存，空串或异常时返回 fallback，模块顶层不执行任何读取
- [x] 4.2 改造 `src/composables/useKlineChart.ts`（12 行 hex）15 个颜色常量为令牌读取，含 `COLOR_VOLUME_UP/DOWN` 走含 alpha 令牌
- [x] 4.3 改造 `src/composables/useProfitChart.ts`（24 行 hex）：`colorPositive`/`colorNegative`、`lineColorBalance`/`lineColorHoldings`/`lineColorTotal`、以及 7 处文字/网格色
- [x] 4.4 改造 `src/components/ProfitChart.vue`（9 行 hex）：删除第 98-99 与 129-130 两处重复定义，统一为令牌读取
- [x] 4.5 改造 `src/components/FundStatistics.vue` 图表色（第 299、349-351 行的 `#3b82f6`/`#f97316`/`#10b981`）
- [x] 4.6 在 `src/utils/holdings.ts` 的 `HOLDINGS_COLORS` 处加注释说明「分类调色板，不受令牌约束」，确认不修改取值以保持 `tests/unit/holdingsBreakdown.test.ts:83-85` 通过
- [x] 4.7 核对涨跌色收敛结果：K 线阳线 `#e53935`→`--color-profit`、阴线 `#43a047`→`--color-loss`、分红 `#3b82f6`→`--color-dividend`（蓝变琥珀，已登记的可见变化）

## 5. 弹窗与通知能力补齐

- [x] 5.1 为 `Modal.vue` 增加 `width?: string` 与 `maxWidth?: string` props，默认值维持 `90%`/`600px`
- [x] 5.2 为 `useToast.ts` 与 `ToastNotification.vue` 增加 `warning` 等级（复用 `--color-warning` 与 `--bg-warning-subtle`）
- [x] 5.3 将 `ToastNotification.vue:20-28` 的 4 个填充式图标替换为 `AppIcon` 的 `info`/`warning`/`error`/`check`
- [x] 5.4 将 `Modal.vue:8` 的 `×` 关闭图标替换为 `AppIcon` 的 `close`

## 6. 页面迁移（每页独立提交，含旧变量名同步替换）

- [x] 6.1 迁移 `LogPage.vue`：页面骨架类、`.btn-open-dir`→`.btn.btn-secondary`、`?` 帮助图标、色值与旧变量名替换
- [x] 6.2 迁移 `HistoricalTradesView.vue`：标题统一为 `.page-title`，刷新按钮改用基础类，修复 `--bg-tertiary` 未定义导致的背景失效
- [x] 6.3 迁移 `FundManagementView.vue`：`12px 24px` 内边距改为间距令牌，`.btn-cancel`/`.btn-delete-confirm` 改用基础类，移除硬编码色值
- [x] 6.4 迁移 `PositionView.vue`：标题与 `.btn-add` 改用基础类，删除手写 toast（模板 + 样式）改用 `useToast`
- [x] 6.5 迁移 `WatchlistView.vue`：`.btn-add`/`.btn-secondary` 改用基础类，空状态改用 `.empty-state`，色值与旧变量名替换
- [x] 6.6 迁移 `SettingsView.vue`：页面根内边距由 `1.5rem` 对齐为统一值，`.btn-primary`/`.btn-secondary` 与表单控件改用基础类
- [x] 6.7 迁移 `GridView.vue`：删除重复的 `.card-header`/`.btn-primary`/`.btn-secondary` 定义，`--card-bg`/`--input-bg`/`--secondary-bg` 等改为新名
- [x] 6.8 迁移 `GridSimulationView.vue`：同上，`?` 帮助图标换 `AppIcon` 的 `help`，`--text-tertiary` 兜底值去掉
- [x] 6.9 迁移 `PatternScanView.vue`：全 px 间距体系整体重映射为间距令牌，标题 `1.25rem` 按角色对齐 `--font-size-xl`，筛选与结果列表控件改用基础类
- [x] 6.10 逐页核对七项：标题字号、按钮形态、输入框焦点态、空状态、列表行、弹窗、Toast
- [x] 6.11 逐页执行页面级断言（见 9.1），全 9 页清零后方可进入组件迁移

## 7. 组件迁移（按硬编码密度分批，每批独立提交）

- [x] 7.1 `FundStatistics.vue`（41 行 hex）：`--font-size-2xl` 用于总资产主数字，`.btn-retry`→`.btn.btn-secondary`，全部色值换令牌
- [x] 7.2 `ProfitStatistics.vue`（32 行）：`.btn-shortcut`→`.btn.btn-ghost.btn-sm`、`.btn-calculate`→`.btn.btn-primary`、`.btn-reset`→`.btn.btn-secondary`，色值换令牌
- [x] 7.3 `KlineChartDialog.vue`（23 行）与 `KlineDownloadDialog.vue`（11 行）：`.btn-cancel`/`.btn-confirm` 改用基础类，字号统一，色值换令牌
- [x] 7.4 `KlineBatchDownloadDialog.vue`（21 行）：`✓`/`✗` 的 JS 字符串拼接改为「状态字段 + 模板渲染 `AppIcon`」，按钮改用基础类
- [x] 7.5 `TransferRecordItem.vue`（16 行）与 `TransferRecordList.vue`：`✏️`→`AppIcon edit`，`.btn-add`/`.btn-add-first`/`.btn-clear-filter` 改用基础类
- [x] 7.6 `StockItem.vue`（11 行）：`.btn-kline`/`.btn-edit`/`.btn-delete` 改用基础类，拖拽高亮改用 `--bg-highlight`
- [x] 7.7 `StockList.vue`、`PositionItem.vue`（`▼`）、`HistoricalTradeItem.vue`（`▼`/`▶`）、`TradeRecordItem.vue`（`✎`/`✕`）、`PositionList.vue`（`--bg-header`）迁移
- [x] 7.8 `LogViewer.vue`：`⟳`/`⚠`/`📄` 三个符号换 `AppIcon` 的 `refresh`/`warning`/`file`
- [x] 7.9 `StockEditor.vue` 与 `TradeEditor.vue`：`.btn-close`/`.btn-cancel`/`.btn-submit` 改用基础类，旧变量名替换
- [x] 7.10 `TransferEditor.vue`：`.btn-cancel`/`.btn-submit` 改用基础类，色值与旧变量名替换
- [x] 7.11 `RefreshButton.vue`（`⟳`）、`IndexStatusBar.vue`（涨跌箭头）、`DateRangePicker.vue`、`HistoricalTradeDetail.vue`、`ProfitChart.vue` 迁移
- [x] 7.12 逐批核对七项并执行组件级断言（见 9.2）

## 8. 消除重复实现

- [x] 8.1 `StockEditor.vue` 改用公共 `Modal.vue`（传 `width="400px"`），删除自写遮罩层与容器样式
- [x] 8.2 `TradeEditor.vue` 改用公共 `Modal.vue`（传 `width="400px"`），删除自写遮罩层与容器样式
- [x] 8.3 核对 6 个弹窗（新增股票、交易录入、转账录入、K 线下载、批量下载、资金管理）的圆角、阴影、遮罩、标题栏完全一致，宽度符合各自内容需求
- [x] 8.4 确认 `PositionView` 已改用 `useToast`，全项目无第二套提示实现

## 9. 断言与验证

- [x] 9.1 页面级断言（对每个视图文件）：无 `#[0-9a-fA-F]{3,8}\b` 命中、无 `font-size:\s*[\d.]+(px|rem)` 命中、无 `^\s*\.btn-` 重定义、无图标性符号（`[▼▶✓✗✕×⚠⟳✎📄✏️]`）
- [x] 9.2 组件级断言（对每个组件文件）：同上四项
- [x] 9.3 全项目级断言：旧变量名（`--bg-color`/`--primary-color`/`--success-color`/`--warning-color`/`--error-color`/`--hover-bg`/`--active-bg`/`--secondary-bg`/`--text-color`/`--color-error`）命中数为 0
- [x] 9.4 全项目级断言：`font-size` 数值硬编码命中数为 0；字号档位只剩 14/16/18/20/24/28
- [x] 9.5 全项目级断言：圆角取值只剩令牌定义的 4/6/8px、`999px`、`50%`，无 2/3/10/22px 散值
- [x] 9.6 图标符号断言需排除合法场景：`useKlineChart.ts` 内 Canvas 形态标注的 `▲▼◆`、`SideNav.vue:69` 的注释；`?` 不在全局断言内（三元表达式会大量误命中），仅以 6.1/6.8 的显式任务覆盖
- [x] 9.7 运行 `npm run typecheck` 确认无类型错误
- [x] 9.8 迁移前先跑一次 `tests/` 记录基线，收尾时对比；重点关注 `holdingsBreakdown.test.ts` 与 `profitStatistics.test.ts`
- [x] 9.9 全流程走查 9 个页面与 6 个弹窗，确认视觉统一且无布局错位

## 10. 收尾清理

- [x] 10.1 删除 `_tokens.scss` 中的兼容别名区，复跑 9.3 确认旧名 0 命中
- [x] 10.2 确认 `_stock-grid.scss`、`_position-grid.scss` 无需为令牌化变更（实测 0 处 hex、0 处 `var()`，与令牌体系无耦合）。注：后续字号整体上调一档时，这两个文件的列宽被实际修改（见 design D2.1），属于字号适配而非令牌化改动，不否定本条的原始结论
- [x] 10.3 确认 `main.scss` 仅保留 reset、滚动条、全局排版基线，不含业务组件样式
