## Why

当前 36 个 Vue 单文件组件各自内联样式，样式体系只停留在 22 个 CSS 变量（`src/styles/main.scss` 共 64 行）这一层，没有可复用的基础样式层，导致同一种视觉元素在多个文件中被重复实现且逐渐失真。

以下数字的统计口径统一为「**含该特征的行数**」（同一行出现多个值只计一行），统计范围 `src/**`：

| 维度 | 实测 | 分布 |
|---|---|---|
| 待收敛的硬编码色值 | **344 行**（`.vue` 295 行 + `.ts` 49 行） | 另有 `main.scss` 20 行属令牌定义本身，不计入 |
| 唯一色值 | **92 个**（含 `.ts`；仅 `.vue`＋`.scss` 为 84 个） | 分属 Ant 系、Element 系、Tailwind 灰三套色系 |
| 硬编码 `rgba()` | 39 处 | 主题色透明度、遮罩、阴影 |
| `font-size` 数值硬编码 | **197 处，覆盖全部 36 个 `.vue` 文件** | `px` 126 处 + `rem` 71 处，混用 |
| 字号档位 | 11 / 12 / 13 / 14 / 15 / 18 / 20 px | `rem` 侧还额外产生 10.5 / 12.25 / 15.75 / 17.5 等非整数值 |
| 圆角取值 | 7 种：2 / 3 / 4 / 6 / 8 / 10 px、22px、50% | — |
| `.btn-*` 类名 | **18 个不同的类名分散在 20 个文件中各自定义** | 高频项：`.btn-cancel`(6 文件)、`.btn-secondary`(4)、`.btn-delete`(4)、`.btn-confirm`(2)、`.btn-submit`(3) |
| 被引用但从未定义的变量 | **12 个** | `--bg-primary`、`--bg-tertiary`、`--bg-header`、`--bg-hover`、`--bg-highlight`、`--card-bg`、`--input-bg`、`--disabled-bg`、`--secondary-bg`、`--text-primary`、`--text-tertiary`、`--color-error` |
| 同义重复变量 | 6 组 | `--primary-color`／`--color-primary`、`--success-color`／`--color-success`、`--error-color`／`--color-danger`、`--hover-bg`／`--bg-hover`、`--secondary-bg`／`--bg-secondary`、`--text-color`／`--text-primary` |
| 页面一级标题 | 两种做法 | 3 个页面 `1.5rem` 无 `font-weight`；2 个页面 `1.25rem` + `600` |
| 页面根内边距 | 三种取值 | 多数 `1rem`；`SettingsView` `1.5rem`；`FundManagementView` `12px 24px` |
| 图标实现 | 三套并存 | 内联 `<svg>` 15 处、裸符号字符（`▼ ▶ ✓ ✗ ⚠ ⟳ ✎ ✕ × ?`）、emoji（`✏️ 📄`） |
| 弹窗 | 5 用公共 `Modal` / 2 自写遮罩 | `StockEditor`、`TradeEditor` 自实现 |
| 通知 | 1 处自写 | `PositionView` 手写 toast，硬编码 `#fff3e0` 等 |
| 图表涨跌色 | **三套红、四套绿** | 列表 `#ff4d4f`／`#52c41a`，K 线 `#e53935`／`#43a047`，利润图 `#ef4444`／`#10b981`，买卖标记 `#ef4444`／`#22c55e` |

两个最需要现在解决的结构性问题：

1. **变量层已经失效**。12 个变量被引用但从未定义，这些样式当前静默回退；其中 `--bg-tertiary` 导致 `HistoricalTradesView` 的刷新按钮背景完全不生效，`--color-error`（`TradeEditor.vue:355,357`）回退到 `#e53935`——恰好是本次要消灭的第三种红。
2. **`main.scss` 以 `html { font-size: 14px }` 为基准**，使 `0.875rem` 实际渲染为 12.25px、`0.75rem` 为 10.5px，与代码中并存的 `12px`／`13px` 写法永远无法对齐。这是字号混乱的根因。

每新增一个页面都在复制粘贴旧样式，样式代码量已明显超过业务逻辑（`PatternScanView.vue` 共 869 行，其中样式 400+ 行）。继续放任的代价是视觉漂移不可逆、改一条视觉规则需要改动 5–10 个文件。

## What Changes

- **L1 设计令牌层**：重建 `src/styles/main.scss` 为单一令牌来源。`html` 基准改为 `16px`、`body` 正文字号定为 `16px`，使 rem 换算落在整像素；补齐字号、间距、圆角、中性文字阶、边框阶、表面、语义浅底、遮罩、焦点环、阴影、层级、图表共 12 类令牌；删除全部同义重复变量；让 12 个失效引用全部生效（10 个直接定义取值、`--secondary-bg` 走别名、`--color-error` 的 2 处引用改名 `--color-danger`）。
- **字号阶梯收敛为 14 / 16 / 18 / 20 / 24 / 28 六档**，不保留 `11px`、`12px`、`13px`、`15px` 等中间档位。（实施期间按使用反馈在首版 `12/14/16/18/20/24` 基础上整体上移一档，`body` 由 14px 变为 16px。）
- **L2 基础组件层**：新增全局基础样式（按钮 **5 形态 × 2 尺寸 × 1 图标修饰**、输入框、表单行、卡片、页面标题栏、空状态、标签），并为存量的 18 个 `.btn-*` 类名给出目标映射；新建 `AppIcon` 图标组件（**零依赖，手写 16 个内联 SVG**，多图元结构，统一 16/20 两种尺寸与 `stroke-width: 2`）；为 `Modal` 增加宽度参数；为 `useToast` 增加 `warning` 等级。
- **L3 迁移**：**9 个视图页面 + 全部 26 个组件**统一迁移到公共基础类（当前字号硬编码覆盖全部 36 个 `.vue`，组件层同样必须处理），删除各文件内重复的按钮/标题/空状态样式；344 行硬编码色值收敛为令牌引用。
- **图表颜色同源**：`useKlineChart.ts`、`useProfitChart.ts`、`ProfitChart.vue`、`FundStatistics.vue` 的 Canvas 绘制色改为从令牌读取，涨跌红绿全项目唯一。
- **BREAKING**（仅限视觉层，不影响功能与数据）：见下方「可见变化登记」，实施前需知悉这些是有意的视觉改变。

### 可见变化登记

| 变化 | 原因 | 影响范围 |
|---|---|---|
| 字号基准 14px → 16px，所有未做重映射的 rem 值会放大 14% | 让 rem 落在整像素 | 全项目，迁移中按「原像素 → 档位」重映射后消失 |
| **全站字号整体上移一档**：最小档 12→14px、正文 14→16px、页面标题 20→24px | 按使用反馈提升可读性 | 全项目；`xs` 53 处、`sm` 82 处受影响 |
| 控件高度与列表列宽随之放大（按钮 32→36px、输入框 32→36px、部分列表列宽增加） | 字号变大后避免文字裁切与按钮内文字贴边 | 全站按钮/表单，自选股/持仓/转账/交易明细列表 |
| 页面一级标题统一为 24px + `600` | 统一标题层级 | 原 21px 页面放大、原 17.5px 页面放大 |
| **K 线分红标注由蓝 `#3b82f6` 变为琥珀 `#faad14`** | 分红色采用令牌值，与买卖红绿区分 | K 线图分红标记 |
| K 线阳线 `#e53935` → `#ff4d4f`，阴线 `#43a047` → `#52c41a` | 与列表涨跌色统一 | K 线图 |
| 利润图正负柱 `#ef4444`／`#10b981` → `#ff4d4f`／`#52c41a` | 同上 | 利润图 |
| 买卖标记 `#ef4444`／`#22c55e` → `#ff4d4f`／`#52c41a` | 同上 | K 线图标注 |
| Element 系色值（`#67c23a`、`#f56c6c`、`#909399`、`#f0f9eb`、`#f4f4f5`、`#e6a23c`）收敛到 Ant 语义色与中性灰 | 消除第三套色系 | Toast、批量下载弹窗等 |
| 填充式图标（16×16 `fill`）改为线性 `stroke` 图标 | 图标规格统一 | `ToastNotification`、批量下载弹窗 |
| 编辑弹窗宽度由 400px 变为按 `Modal` 宽度参数指定 | 弹窗容器统一 | `StockEditor`、`TradeEditor` |

## Capabilities

### New Capabilities

- `ui-style-system`：定义全局设计令牌、基础组件与图标组件的唯一来源与使用约束，包括令牌分层与命名、字号/间距/圆角/色板阶梯、按钮与表单控件形态变体、图标规格与引入方式、图表颜色同源要求，以及「禁止在页面内重复定义基础控件样式、禁止硬编码颜色」的强制约束。

### Modified Capabilities

无。现有 `openspec/specs/` 下的能力（自选股排序、K 线下载、指数状态栏、持仓拆分等）均为功能行为规格，本次变更不改变任何功能行为、接口与数据结构，仅收敛视觉实现方式。`index-status-bar` 中「状态栏视觉与标题栏一致」的既有约束在新令牌体系下继续成立，无需修改。

## Impact

- **令牌与基础层**：`src/styles/main.scss`（重写）、新增 `src/styles/_tokens.scss`、`src/styles/_base.scss`
- **新增代码**：`src/components/ui/AppIcon.vue`、`src/utils/designTokens.ts`
- **视图（9 个）**：`WatchlistView`、`PositionView`、`GridView`、`GridSimulationView`、`HistoricalTradesView`、`FundManagementView`、`PatternScanView`、`SettingsView`、`LogPage`
- **组件（26 个，按硬编码密度）**：`FundStatistics`(41)、`ProfitStatistics`(32)、`KlineChartDialog`(23)、`KlineBatchDownloadDialog`(21)、`TransferRecordItem`(16)、`FundManagementView`(14)、`TransferEditor`(11)、`KlineDownloadDialog`(11)、`StockItem`(11)、`ProfitChart`(9)、`ToastNotification`(9)、`Modal`、`LogViewer`、`StockEditor`、`TradeEditor`、`PositionItem`、`TradeRecordItem`、`TransferRecordList`、`StockList`、`StockEditor`、`RefreshButton`、`SideNav`、`TitleBar`、`IndexStatusBar`、`DateRangePicker`、`HistoricalTradeDetail`、`HistoricalTradeItem`
- **图表色源（4 处）**：`useKlineChart.ts`、`useProfitChart.ts`、`ProfitChart.vue`、`FundStatistics.vue`
- **不改动**：`_stock-grid.scss`、`_position-grid.scss`（实测 0 处 hex、0 处 `var()` 引用，与令牌体系无耦合，仅需确认无需变更）
- **依赖**：不新增任何运行时依赖（图标零依赖手写 SVG，不引入 UI 组件库，不引入图标库）
- **不受影响**：Electron 主进程、IPC 接口、SQLite 数据结构、业务行为
- **需注意的既有单测**：`tests/unit/holdingsBreakdown.test.ts:83-85` 直接断言 `HOLDINGS_COLORS[0..2]`，饼图调色板若调整取值需同步，或将其登记为「数据调色板例外」不改动
- **风险**：纯视觉回归风险，集中在字号基准变更带来的尺寸漂移与色值收敛带来的观感变化，需要逐页人工目视核对；无数据与逻辑风险
