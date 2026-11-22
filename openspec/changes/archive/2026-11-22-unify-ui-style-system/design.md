## Context

### 现状结构

```
src/styles/main.scss        64 行：22 个 CSS 变量 + 全局 reset + 滚动条（仅此）
src/styles/_stock-grid.scss       0 处 hex、0 处 var()，与令牌体系无耦合
src/styles/_position-grid.scss    0 处 hex、0 处 var()，与令牌体系无耦合
36 个 .vue 单文件组件      各自 <style scoped lang="scss"> 内联全部样式
```

没有 UI 组件库，没有图标库，没有 Tailwind/UnoCSS。所有视觉实现靠「每个文件各写一遍」。

### 实测不一致点

统计口径统一为「含该特征的行数」，范围 `src/**`：

| 维度 | 实测结果 |
|---|---|
| CSS 变量被引用但未定义 | 12 个：`--bg-primary`(2 处)、`--bg-tertiary`、`--bg-header`(1)、`--bg-hover`、`--bg-highlight`(5)、`--card-bg`(3)、`--input-bg`(2)、`--disabled-bg`(1)、`--secondary-bg`(5)、`--text-primary`(9)、`--text-tertiary`(2)、`--color-error`(2) |
| 同义重复变量 | 6 组：`--primary-color`／`--color-primary`、`--success-color`／`--color-success`、`--error-color`／`--color-danger`、`--hover-bg`／`--bg-hover`、`--secondary-bg`／`--bg-secondary`、`--text-color`／`--text-primary` |
| 硬编码 hex | 344 行待收敛（`.vue` 295 行 + `.ts` 49 行）；`main.scss` 另有 20 行属令牌定义本身 |
| 唯一色值 | 92 个（含 `.ts`）／84 个（仅 `.vue`＋`.scss`） |
| 硬编码 `rgba()` | 39 处 |
| `font-size` 数值硬编码 | 197 处，**覆盖全部 36 个 `.vue` 文件**（`px` 126 + `rem` 71） |
| 字号档位 | 11/12/13/14/15/18/20 px；`rem` 侧额外产生 10.5/12.25/15.75/17.5 等非整数值 |
| 圆角取值 | 7 种：2/3/4/6/8/10 px、22px、50% |
| 页面一级标题 | 3 页 `1.5rem` 无 `font-weight`；2 页 `1.25rem` + `600` |
| 页面根内边距 | `1rem` / `1.5rem` / `12px 24px` 三种 |
| `.btn-*` 类名 | **18 个不同类名，分散在 20 个文件中各自定义** |
| 图标实现 | 内联 `<svg>` 15 处 + 裸符号字符 + emoji，三套并存 |
| 弹窗 | 5 用公共 `Modal`；`StockEditor`(400px)／`TradeEditor` 自写遮罩 |
| Toast | 公共 `useToast` 7 处使用；`PositionView` 自写一套 |
| 图表色 | 三套红（`#ff4d4f`／`#e53935`／`#ef4444`）、四套绿（`#52c41a`／`#43a047`／`#10b981`／`#22c55e`） |

### 约束

- 不引入 UI 组件库（Element Plus / Naive UI / Vuetify）与图标库，保持零新增运行时依赖
- Electron 桌面端单窗口，无响应式断点需求，无 SSR，无暗色主题（当前仅一套亮色）
- 所有功能行为、IPC 接口、SQLite 结构不得改变，本次变更是纯视觉层收敛
- 无法自动化视觉回归（项目无截图测试基础设施），验证依赖 `vue-tsc` 类型检查 + 逐页人工目视
- `tests/unit/holdingsBreakdown.test.ts:83-85` 直接断言 `HOLDINGS_COLORS[0..2]`，调色板取值变更会破坏该测试

## Goals / Non-Goals

**Goals:**

- 建立单一来源的设计令牌，消除 12 个未定义变量与 6 组同义重复变量
- 字号收敛为 6 档（14/16/18/20/24/28），单位统一，不保留 11px / 12px / 13px / 15px 等中间档位
- 提供可直接复用的基础控件样式，把 18 个存量 `.btn-*` 类名收敛到 5 型形态
- 用零依赖 `AppIcon` 组件统一 16 个通用功能图标，消除三套图标并存
- 让 Canvas 图表颜色与 CSS 令牌同源，消除「三套红、四套绿」
- 消除 `StockEditor`／`TradeEditor` 重复遮罩、`PositionView` 重复 toast

**Non-Goals:**

- 不做暗色主题（令牌结构预留语义层，但不提供暗色取值）
- 不做响应式布局适配或移动端适配
- 不重排任何页面的信息架构、交互流程或布局结构，只替换样式的表达方式
- 不改动 K 线图与利润图的绘制逻辑、交互行为，仅替换颜色来源
- 不引入 CSS 预处理器之外的构建链变化（继续用 SASS，不切 Tailwind）
- 不做视觉回归自动化测试建设
- 不调整 `HOLDINGS_COLORS` 饼图调色板取值（登记为数据调色板例外，见 D9）

## Decisions

### D1：令牌文件拆分与唯一来源

新建 `src/styles/_tokens.scss`（全部变量）与 `src/styles/_base.scss`（全局基础控件类），由 `main.scss` 统一 `@use` 引入。`main.scss` 只保留 reset、滚动条、全局排版基线。

理由：现在 `main.scss` 混了变量与 reset，页面级 scss 无法独立引用变量层级。拆分后令牌可被任意入口安全引入。

备选方案：全部塞进一个 `main.scss`（否决——会回到现在的状态，无边界）。

`_stock-grid.scss`、`_position-grid.scss` 实测 0 处 hex、0 处 `var()`，与令牌体系无耦合，本次不改动，仅在收尾时确认。

### D2：字号基准改为 16px，六档阶梯

```scss
html { font-size: 16px; }                  // 显式声明，不依赖浏览器默认
body { font-size: var(--font-size-sm); }   // 1rem = 16px，正文默认字号
```

| 令牌 | rem | px | 用途 |
|---|---|---|---|
| `--font-size-xs` | 0.875rem | 14 | 次要说明、表单标签、表格辅助列、小尺寸按钮 |
| `--font-size-sm` | 1rem | 16 | **正文默认**、按钮文字、列表主内容 |
| `--font-size-md` | 1.125rem | 18 | 强调正文、卡片内数字 |
| `--font-size-lg` | 1.25rem | 20 | 区块标题、弹窗标题 |
| `--font-size-xl` | 1.5rem | 24 | **页面一级标题** |
| `--font-size-2xl` | 1.75rem | 28 | 统计面板主数字（`FundStatistics` 总资产、`ProfitStatistics` 合计） |

**实施期间做过一次整体上调**：首版阶梯为 `12/14/16/18/20/24`、`body` 为 14px。在实际使用中 14px 正文在 1200px 桌面窗口下偏小、最小档 12px 阅读吃力，因此按使用反馈把整条阶梯上移一档为 `14/16/18/20/24/28`，`body` 随之变为 16px。本文件与 `spec.md` 记录的都是**上调后的最终取值**，实现以 `_tokens.scss` 为准。

这次上调的连带影响：全站 `var(--font-size-xs)`（53 处）由 12px 变为 14px、`var(--font-size-sm)`（82 处）由 14px 变为 16px、页面一级标题由 20px 变为 24px。因此配套上调了控件高度与列表列宽，见 D2.1。

**角色优先于数值**：当某个数值映射到的档位与它承担的角色冲突时，以角色为准。典型冲突是页面一级标题——`LogPage`／`PatternScanView` 当前写 `1.25rem`（17.5px），按数值应映射 `--font-size-lg`(20px)，但它承担「页面一级标题」角色，因此统一映射 `--font-size-xl`(24px)。同理，`FundStatistics` 当前的总资产数字为 `20px`，按角色（面板主数字）映射 `--font-size-2xl`(28px)。`--font-size-2xl` 的落点即此类统计主数字，不是空转令牌。

逐值重映射表（旧 14px 基准 → 最终档位）：

| 旧写法 | 旧实际渲染 | 迁移后 |
|---|---|---|
| `0.75rem` | 10.5px | `--font-size-xs` (14px) |
| `0.875rem` | 12.25px | `--font-size-sm` (16px) |
| `1rem` | 14px | `--font-size-sm` (16px) |
| `1.125rem` | 15.75px | `--font-size-md` (18px) |
| `1.25rem` | 17.5px | `--font-size-lg` (20px)；若为页面一级标题则 `--font-size-xl` (24px) |
| `1.5rem` | 21px | `--font-size-lg` (20px)；若为页面一级标题则 `--font-size-xl` (24px) |
| `11px` | 11px | `--font-size-xs` (14px) |
| `12px` | 12px | `--font-size-xs` (14px) |
| `13px` | 13px | `--font-size-xs` (14px) |
| `14px` | 14px | `--font-size-sm` (16px) |
| `15px` | 15px | `--font-size-sm` (16px) |
| `16px` | 16px | `--font-size-sm` (16px) |
| `18px` | 18px | `--font-size-md` (18px) |
| `20px` | 20px | `--font-size-lg` (20px)；若为统计主数字则 `--font-size-2xl` (28px) |

配套：`--line-height-tight: 1.25`、`--line-height-base: 1.5`、`--line-height-loose: 1.75`；`--font-weight-normal: 400`、`--font-weight-medium: 500`、`--font-weight-semibold: 600`。

理由：改造前 `html { font-size: 14px }` 使 `0.875rem` 渲染为 12.25px、`0.75rem` 为 10.5px，永远无法与代码中的 `12px`／`13px` 对齐——这是「rem 和 px 对不上」的根因。改成 16 基准后 rem 换算是整数，rem 与 px 两套写法在数值上等价。

代价是改造前的所有 rem 值会按 16/14 ≈ 1.143 倍放大，因此**迁移不得直接沿用旧数值**，必须按上表重映射。

备选方案：保持 `html { font-size: 14px }`（否决——rem 永远落在非整数值，源头上无法收敛）。
备选方案：全部改用 px（否决——丧失单一基准调整能力，且与「令牌化」目标相悖）。

### D2.1：字号上调的连带尺寸调整

字号整体上移一档后，若不调整控件与列宽，会出现文字被裁切、按钮内文字贴边、列表列宽不够等问题。配套调整：

| 项目 | 首版 | 最终 |
|---|---|---|
| `.btn` / `.btn-md` 高度 | 32px | 36px（16px 文字在 32px 内上下仅剩 7px，过挤） |
| `.btn-sm` 高度 | 28px | 32px |
| `.btn-icon` 宽度 | 32px | 36px（默认）/ 28px（`.btn-icon.btn-sm`） |
| 输入框 / 下拉框 / 文本域高度 | 32px | 36px（与 `.btn` 对齐） |
| `.tag` 高度 | 20px | 24px |
| `TitleBar` 高度 | 32px | 36px |
| `IndexStatusBar` 高度 | 30px | 36px |

关于 `.btn-icon.btn-sm` 保持 28px：图标按钮没有文字，其尺寸不应跟随字号缩放；28px = 16px 图标 + 左右各 6px，配合 `.col-actions` 的 4px 间距，图标视觉间距为 16px。若沿用 32px 宽会把图标间距拉到 24px，显得松散。

列表列宽调整（16px 下按原列宽会截断内容）：

| 位置 | 调整 |
|---|---|
| 自选股列表 | 名称列 `minmax(132px, 1fr)`（默认窗口约 164px，可完整显示「科创50ETF华夏」）；监控 56→44px；操作 120→96px（3 个 28px 图标按钮 + 2 个 4px 间距） |
| 持仓列表 | 名称 120→136、日期 90→104、盈亏 90→104 等，总宽 720→808px |
| 持仓展开的交易记录 | 日期 100→112、均价 100→112、操作 60→80px（两个 36px 图标按钮） |
| 转账明细 | 日期 100→112、金额/余额 120→130 |
| 交易明细表格 | 价格 80→92、金额 90→110 |
| 自选股价格 / 阈值列 | 保持 72px / 80px（`1800.0000` 这类 4 位小数价格需要约 76px，不可再压） |

自选股名称列用 `minmax(132px, 1fr)` 而非固定上限，原因：CSS Grid 在无 `fr` 时会把列撑到 `max` 值导致整表横向溢出。配套需要 `.stock-list-body { scrollbar-gutter: stable }` + 表头 `padding-right` 额外预留 8px，否则滚动条出现时表头与数据行会错位。

### D3：单位使用边界

- **字号、间距、行高、控件尺寸**：一律 `rem`
- **1px 级细节**（`border-width`、`box-shadow` 偏移、`outline`）：保留 `px`，rem 换算会产生非整像素导致渲染模糊
- **圆角**：用 `px`（`--radius-sm: 4px` 等），小尺寸圆角用 rem 无收益且易产生小数
- **2px 级间距**（如 `gap: 2px`、微调偏移）：保留 `px`，属细节微调不属于间距阶梯
- **Canvas 坐标轴数值**：按 CSS 像素计算，保持 px

理由：追求「全用 rem」在边框和圆角上是负收益。边界必须写死，否则迁移时每人判断不同。

### D4：变量命名收敛与两阶段删除

语义色统一 `--color-*` 前缀，表面 `--bg-*`，文字 `--text-*`，边框 `--border-*`，阴影 `--shadow-*`。

命名收敛表（左列旧名 → 右列新名为唯一来源）：

| 旧名 | 新名 | 说明 |
|---|---|---|
| `--bg-color` | `--bg-primary` | 页面底色，6 处引用；`--bg-primary` 同时吸收原 `--bg-primary` 的 2 处引用（弹窗/设置卡片背景，取值相同） |
| `--primary-color` | `--color-primary` | |
| `--success-color` | `--color-success` | |
| `--warning-color` | `--color-warning` | |
| `--error-color` | `--color-danger` | 另有 `--color-error` 的 2 处引用（`TradeEditor.vue:355,357`）直接改名 `--color-danger`，不设别名 |
| `--hover-bg` | `--bg-hover` | |
| `--active-bg` | `--bg-active` | |
| `--secondary-bg` | `--bg-secondary` | |
| `--text-color` | `--text-primary` | |
| `--title-bar-bg` | 保留原名 | 语义明确，不作为别名清除 |
| `--bg-header` | `var(--title-bar-bg)` | 表头与标题栏同色 |

迁移采用两阶段，避免一次性改动导致大面积样式失效：

1. **阶段 A（L1）**：定义全部新令牌；在 `_tokens.scss` 末尾加一段显著标注「**临时，迁移完成后删除**」的兼容别名区，把旧名指向新名（如 `--primary-color: var(--color-primary)`）；同时让 12 个失效引用全部生效——其中 10 个直接定义取值，`--secondary-bg` 由别名指向 `--bg-secondary`，`--color-error` 的 2 处引用直接改名 `--color-danger`。
2. **阶段 C（L3 收尾）**：每个文件迁移时同步把该文件内的旧名替换为新名；全部页面与组件迁移完成后删除别名区，`grep` 验证旧名为 0 命中。

理由：344 行硬编码 + 6 组同义变量不可能一次改对，别名让迁移可以逐文件推进且任何中间态都能正常渲染。旧名替换必须分散在每个页面与组件的迁移过程中逐个完成，不能全部堆到收尾一次性大改。

### D5：色板收敛决策

实测 92 个唯一色值分属三套色系，必须明确取舍：

| 色系 | 代表值 | 处理 |
|---|---|---|
| Ant Design | `#1890ff`、`#52c41a`、`#faad14`、`#ff4d4f` | **作为语义色基准保留**（与现有令牌一致，改动最小） |
| Element UI | `#67c23a`(10)、`#f56c6c`(8)、`#909399`(7)、`#f0f9eb`(5)、`#f4f4f5`(4)、`#e6a23c`(2) | **收敛**到 Ant 语义色：`#67c23a`→`--color-success`、`#f56c6c`→`--color-danger`、`#909399`→`--text-tertiary`、`#f0f9eb`→`--bg-success-subtle`、`#f4f4f5`→`--bg-tertiary`、`#e6a23c`→`--color-warning`。Toast 与批量下载弹窗会有可见色变 |
| Tailwind 中性灰 | `#6b7280`(22)、`#374151`(22)、`#9ca3af`(20)、`#e5e7eb`(17)、`#f3f4f6`(12)、`#d1d5db`(12)、`#f9fafb`(11)、`#111827`(8) | **作为中性色阶基准**（出现频次最高）：`#9ca3af`→`--text-tertiary`、`#f3f4f6`→`--bg-tertiary`、`#d1d5db`→`--text-disabled`／`--border-color-strong`、`#e5e7eb`→`--border-color-light`；`#374151`／`#111827` 收敛到 `--text-primary`(#333、观感极接近) |
| 独立高频蓝 | `#3b82f6`(23，全项目最高频) | 新增 `--color-info`，承载余额线、饼图账户余额扇区、信息提示。它不是品牌主色（主色为 `#1890ff`），不能并入 `--color-primary` |

完整令牌清单：

```scss
/* 语义色（Ant 系） */
--color-primary: #1890ff;        --color-primary-dark: #0d6ed9;
--color-primary-subtle: #e6f4ff;
--color-success: #52c41a;        --color-warning: #faad14;
--color-danger: #ff4d4f;         --color-danger-dark: #d92f2f;
--color-info: #3b82f6;

/* 涨跌与交易 */
--color-profit: #ff4d4f;   --color-loss: #52c41a;
--color-buy: #52c41a;      --color-sell: #ff4d4f;
--color-dividend: #faad14;

/* 文字 */
--text-primary: #333333;   --text-secondary: #666666;
--text-tertiary: #9ca3af;  --text-disabled: #d1d5db;

/* 边框 */
--border-color: #e0e0e0;   --border-color-light: #f3f4f6;
--border-color-strong: #d1d5db;

/* 表面 */
--bg-primary: #ffffff;     --bg-secondary: #fafafa;
--bg-tertiary: #f3f4f6;    --bg-hover: rgba(0, 0, 0, 0.05);
--bg-active: rgba(24, 144, 255, 0.15);
--bg-highlight: #e6f4ff;   /* 拖拽/高亮，5 处引用 */
--card-bg: #ffffff;        --input-bg: #ffffff;
--disabled-bg: #f5f5f5;

/* 语义浅底 */
--bg-success-subtle: #f6ffed;  --bg-warning-subtle: #fffbe6;
--bg-danger-subtle: #fff1f0;   --bg-info-subtle: #e6f4ff;

/* 遮罩、焦点、滚动条 */
--overlay: rgba(0, 0, 0, 0.5);
--focus-ring: rgba(24, 144, 255, 0.15);
--scrollbar-thumb: rgba(0, 0, 0, 0.2);
--scrollbar-thumb-hover: rgba(0, 0, 0, 0.3);

/* 阴影与层级 */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);
--z-dropdown: 100;  --z-modal: 1000;  --z-toast: 9999;

/* 图表专用（含 alpha，见 D9） */
--chart-volume-up: rgba(255, 77, 79, 0.5);
--chart-volume-down: rgba(82, 196, 26, 0.5);
--chart-tooltip-bg: rgba(0, 0, 0, 0.8);
--chart-tooltip-text: #ffffff;

/* 字号 / 行高 / 字重 — 见 D2 */
/* 间距 — 见 D7 */
--radius-sm: 4px;  --radius-md: 6px;  --radius-lg: 8px;
--radius-pill: 999px;  --radius-circle: 50%;
```

`--bg-highlight` 取 `#e6f4ff`（主色浅底），用于 `StockItem`／`StockList`／`TransferRecordItem`／`TransferRecordList` 的拖拽高亮；`--bg-header` 指向 `--title-bar-bg`(#f5f5f5)，用于 `PositionList` 表头。

### D6：按钮体系与存量映射

**5 种形态 × 2 种尺寸（`sm` 32px / `md` 36px，与输入框 36px 对齐）× 1 个图标修饰（`.btn-icon`）**

> 尺寸随 D2.1 的字号上调同步放大（首版为 `sm` 28px / `md` 32px）。`.btn-icon` 是例外：默认 36px，`.btn-icon.btn-sm` 保持 28px——图标按钮无文字，尺寸不随字号缩放。

| 形态 | 说明 |
|---|---|
| `.btn-primary` | 主色填充，主操作 |
| `.btn-secondary` | 主色描边、透明底，次要操作 |
| `.btn-ghost` | 无底无边，hover 浅底，工具栏/行内操作 |
| `.btn-ghost-danger` | 无底无边、文字危险色，hover 浅红底，行内删除 |
| `.btn-danger` | 危险色填充，破坏性确认 |

取消 `lg` 尺寸（现有代码无该需求，三份文档统一为 2 种）。

存量 18 个 `.btn-*` 类名的映射（由 grep 全量生成，不是抽样），下表为**实施后的实际结果**：

| 存量类名 | 所在文件 | 目标 |
|---|---|---|
| `.btn-primary` | GridSimulationView, GridView, SettingsView | `.btn.btn-primary` |
| `.btn-secondary` | GridSimulationView, GridView, SettingsView, WatchlistView | `.btn.btn-secondary` |
| `.btn-add` | PositionView, WatchlistView, TransferRecordList | `.btn.btn-primary` |
| `.btn-add-first` | TransferRecordList | `.btn.btn-primary` |
| `.btn-submit` | StockEditor, TradeEditor, TransferEditor | `.btn.btn-primary` |
| `.btn-confirm` | KlineBatchDownloadDialog, KlineDownloadDialog | `.btn.btn-primary` |
| `.btn-cancel` | KlineBatchDownloadDialog, KlineDownloadDialog, StockEditor, TradeEditor, TransferEditor, FundManagementView | `.btn.btn-secondary` |
| `.btn-close` | StockEditor, TradeEditor | 类名消失：两个编辑器改用公共 `Modal`，关闭按钮由 `Modal` 统一提供 |
| `.btn-delete-confirm` | FundManagementView | `.btn.btn-danger` |
| `.btn-delete` | StockItem | `.btn.btn-ghost-danger.btn-icon.btn-sm`（图标，行内操作） |
| `.btn-delete` | TradeRecordItem, TransferRecordItem | `.btn.btn-ghost-danger.btn-icon` |
| `.btn-edit` | StockItem | `.btn.btn-ghost.btn-icon.btn-sm`（图标，行内操作） |
| `.btn-edit` | TradeRecordItem, TransferRecordItem | `.btn.btn-ghost.btn-icon` |
| `.btn-kline` | StockItem | `.btn.btn-ghost.btn-icon.btn-sm`（改为下载图标） |
| `.btn-retry` | FundStatistics | `.btn.btn-secondary` |
| `.btn-shortcut` | ProfitStatistics | `.btn.btn-secondary.btn-sm` |
| `.btn-calculate` | ProfitStatistics | `.btn.btn-primary` |
| `.btn-reset` | ProfitStatistics | `.btn.btn-secondary` |
| `.btn-clear-filter` | TransferRecordList | `.btn.btn-ghost-danger.btn-sm` |
| `.btn-open-dir` | LogPage | `.btn.btn-secondary` |

**相对初版方案的偏离**（实施中发现并修正，均为「原设计有可见边框/填充，不应降级为无边框幽灵按钮」）：

| 类名 | 初版方案 | 实际 | 原因 |
|---|---|---|---|
| `.btn-kline`、`.btn-edit`、`.btn-delete`（StockItem） | `btn-ghost` / `btn-ghost-danger` + `btn-icon` | 三者改为纯图标按钮 + `btn-sm` | 原为蓝/蓝/红填充按钮，改为 ghost 后无背景无边框，行内看似纯文字；改图标按钮后尺寸收紧到 28px |
| `.btn-shortcut`（ProfitStatistics） | `.btn-ghost.btn-sm` | `.btn-secondary.btn-sm` | 原为白底灰描边按钮，ghost 会失去边框 |
| `.btn-clear-filter`（TransferRecordList） | `.btn-ghost.btn-sm` | `.btn-ghost-danger.btn-sm` | 原为红字红描边，需保留危险语义 |
| `.btn-ghost-danger` 静止态 | 灰色文字，hover 才变红 | **静止态即危险色文字**，hover 加深并加浅红底 | 危险操作在静止态必须有视觉提示 |

其余同类基础类：

```scss
.input / .select / .textarea   // 高 36px（与 .btn 对齐），padding 0 var(--space-2)，
                               // border 1px var(--border-color)，radius var(--radius-sm)
                               // focus: border-color var(--color-primary) + box-shadow 0 0 0 3px var(--focus-ring)
.form-item / .form-label       // label 用 --font-size-xs(14px) + --text-secondary
.card / .card-header
.page / .page-header / .page-title   // .page-title 用 --font-size-xl(24px) + 600
.empty-state / .tag                  // .tag 高 24px、字号 --font-size-xs(14px)
```
```

`_base.scss` 是全局非 scoped 样式，类名统一加 `.btn` 前缀族与上述固定名，避免与现有 scoped 规则撞名。

### D7：间距档位与映射

字号调整后间距也需按语义档位重映射，6 档：

| 令牌 | rem | px |
|---|---|---|
| `--space-1` | 0.25rem | 4 |
| `--space-2` | 0.5rem | 8 |
| `--space-3` | 0.75rem | 12 |
| `--space-4` | 1rem | 16 |
| `--space-5` | 1.5rem | 24 |
| `--space-6` | 2rem | 32 |

px 侧旧值就近归并：

| 旧值 | 归并到 |
|---|---|
| 2px | 保留 `px`（细节微调，不进阶梯） |
| 3px / 5px | `--space-1` (4) |
| 6px | `--space-2` (8) |
| 10px | `--space-2` (8) 或 `--space-3` (12)，按上下文取近者 |
| 14px | `--space-3` (12) 或 `--space-4` (16) |
| 18px | `--space-4` (16) |
| 20px | `--space-4` (16) 或 `--space-5` (24) |
| 24px 以上 | `--space-5` / `--space-6` |

rem 侧旧值（14 基准，实际像素）重映射：

| 旧写法 | 旧实际 | 迁移后 |
|---|---|---|
| `0.25rem` | 3.5px | `--space-1` (4px) |
| `0.5rem` | 7px | `--space-2` (8px) |
| `0.75rem` | 10.5px | `--space-3` (12px) |
| `1rem` | 14px | `--space-4` (16px) |
| `1.5rem` | 21px | `--space-5` (24px) |
| `2rem` | 28px | `--space-6` (32px) |

必须显式重映射的原因：`html` 基准 14→16 后，未处理的 rem 间距会自动放大 14%，与同页未变的 px 间距混排会拉开密度差。迁移以「页面/组件为单位整体处理」,禁止跨文件批量正则替换。

### D8：AppIcon 零依赖图标组件

```vue
<!-- src/components/ui/AppIcon.vue -->
<!-- props: name: IconName; size?: 16 | 20 （默认 16，收紧为字面量联合，不允许任意 number） -->
<svg :width="size" :height="size" viewBox="0 0 24 24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true">
  <component :is="el.tag" v-for="(el, i) in paths[name]" :key="i" v-bind="el.attrs" />
</svg>
```

**每个图标是图元数组**（`circle` / `line` / `polyline` / `path` 混合），不是单条 `d` 字符串。原因：`search`（圆 + 斜线）、`trash`（盖 + 桶 + 竖线）、`download`（箭头 + 托盘）、`warning`（三角 + 感叹号）、`info`／`error`（圆 + 符号）都是多图元，强行把圆写成弧线路径会导致线宽交接走形。

16 个图标及其替换位置：

| 图标名 | 替换的现有写法 | 所在文件 |
|---|---|---|
| `refresh` | `⟳` | `RefreshButton.vue:24`、`LogViewer.vue:15` |
| `check` | `✓`（JS 字符串拼接） | `KlineBatchDownloadDialog.vue:134` |
| `close` | `✕`（删除）、`✗`（失败）、`×`（弹窗关闭） | `TradeRecordItem.vue:72`、`KlineBatchDownloadDialog.vue:138`、`Modal.vue:8` |
| `warning` | `⚠` | `LogViewer.vue:20` |
| `error` | 填充式圆形图标 | `ToastNotification.vue:22-28` |
| `info` | 填充式圆形图标 | `ToastNotification.vue:20-21` |
| `plus` | 新增类按钮（文字） | 各页新增按钮 |
| `edit` | `✎`、`✏️` | `TradeRecordItem.vue:71`、`TransferRecordItem.vue:13` |
| `trash` | 删除类按钮 | 各列表行删除按钮 |
| `search` | 搜索输入框（文字） | 搜索框前缀 |
| `download` | 下载类按钮（文字） | 各下载按钮 |
| `chevron-down` | `▼` | `PositionItem.vue:203`、`HistoricalTradeItem.vue:99` |
| `chevron-right` | `▶` | `HistoricalTradeItem.vue:99` |
| `help` | `?` | `GridSimulationView.vue:263` |
| `file` | `📄` | `LogViewer.vue:25` |
| `arrow-up` | 涨跌箭头内联 svg | `IndexStatusBar.vue:11-16` 等 |

`arrow-down` 不单独定义，由 `arrow-up` 加 CSS `rotate(180deg)` 表达（下跌方向）。

`✓`／`✗` 位于 `KlineBatchDownloadDialog.vue` 的 **JS 字符串拼接** 中（`return { status: 'success', text: '\`✓ ${text}\`' }`），不是模板图标，需改为「状态字段 + 模板渲染 `AppIcon`」，这一处不是纯样式替换。

**例外**：`SideNav` 的 9 个导航图标已是数据驱动（`iconPath` 字段 + 统一 svg 模板），形态与 AppIcon 规范一致，保持现状不动，仅统一尺寸与线宽；`TitleBar` 的 3 个窗口控制按钮属系统窗口控件，保持内联 SVG，仅对齐尺寸。

`Modal` 的 `×` 与 `ToastNotification` 的 4 个填充图标必须纳入替换——它们原本不在替换清单内，会导致「符号 0 命中」断言不成立。

### D9：图表颜色同源与 alpha 方案

新建 `src/utils/designTokens.ts`：

```ts
const cache = new Map<string, string>();
/**
 * 读取 :root 上的令牌计算值。
 * - 懒加载：首次调用时读取，不在模块顶层执行（避免样式未生效时拿到空串）
 * - 缓存：读取成功后缓存，同一 key 只读一次
 * - 兜底：读取失败或返回空串时使用 fallback（由调用方传入或使用内置映射）
 */
export function token(name: string, fallback?: string): string
```

**时序风险处理**：`getComputedStyle(document.documentElement)` 在样式表生效前调用会返回空串。约定：所有图表构造函数在组件 `onMounted`（首帧后）触发，`designTokens.ts` 内不执行任何顶层读取，并对空值返回 fallback。

**alpha 色方案**：`COLOR_VOLUME_UP`／`COLOR_VOLUME_DOWN` 是 `rgba(...,0.5)`，无法由 hex 令牌换算。处理方式：在 `_tokens.scss` 中直接定义含 alpha 的图表令牌（`--chart-volume-up`、`--chart-volume-down`、`--chart-tooltip-bg`、`--chart-tooltip-text`），令牌文件是唯一允许出现 `rgba()` 字面量的地方，`designTokens.ts` 直接读取其完整 `rgba(...)` 字符串。

各色源收敛对照：

| 现有常量 | 现值 | 收敛到 |
|---|---|---|
| `COLOR_UP` | `#e53935` | `--color-profit` (#ff4d4f) |
| `COLOR_DOWN` | `#43a047` | `--color-loss` (#52c41a) |
| `COLOR_FLAT` | `#9e9e9e` | `--text-tertiary` (#9ca3af) |
| `COLOR_BUY` | `#22c55e` | `--color-buy` (#52c41a) |
| `COLOR_SELL` | `#ef4444` | `--color-sell` (#ff4d4f) |
| `COLOR_DIVIDEND` | `#3b82f6`（蓝） | `--color-dividend`（**#faad14 琥珀，可见变化**） |
| `COLOR_AXIS` | `#e0e0e0` | `--border-color` |
| `COLOR_AXIS_TEXT` | `#666666` | `--text-secondary` |
| `COLOR_VOLUME_UP` | `rgba(229,57,53,.5)` | `--chart-volume-up` |
| `COLOR_VOLUME_DOWN` | `rgba(67,160,71,.5)` | `--chart-volume-down` |
| `COLOR_TOOLTIP_BG` | `rgba(0,0,0,.8)` | `--chart-tooltip-bg` |
| `COLOR_TOOLTIP_TEXT` | `#ffffff` | `--chart-tooltip-text` |
| `COLOR_PATTERN_BULLISH` | `#10b981` | `--color-success`（看涨形态标注用绿色，与蜡烛红绿区分，语义上是「信号色」不是涨跌色） |
| `COLOR_PATTERN_BEARISH` | `#f43f5e` | `--color-danger` |
| `COLOR_PATTERN_WARNING` | `#f59e0b` | `--color-warning` |
| `ProfitChart.colorPositive` | `#ef4444` | `--color-profit` |
| `ProfitChart.colorNegative` | `#10b981` | `--color-loss` |
| `useProfitChart.colorPositive/Negative` | `#ef4444`／`#10b981` | 同上 |
| `useProfitChart.lineColorBalance` | `#3b82f6` | `--color-info` |
| `useProfitChart.lineColorHoldings` | `#f97316` | `--color-warning`（橙，观感接近） |
| `useProfitChart.lineColorTotal` | `#10b981` | `--color-success` |
| `FundStatistics` 饼图/折线色 | `#3b82f6`／`#f97316`／`#10b981` | `--color-info`／`--color-warning`／`--color-success` |
| `useProfitChart` 文字/网格色（`#9ca3af` `#374151` `#6b7280` `#e5e7eb` `#d1d5db` `#f3f4f6` `#ffffff`） | 硬编码 | `--text-tertiary`／`--text-primary`／`--text-secondary`／`--border-color-light`／`--border-color-strong`／`--bg-tertiary`／`#ffffff` |

**例外**：`src/utils/holdings.ts` 的 `HOLDINGS_COLORS` 是饼图分类调色板（每个扇区一色，用于区分持股），不属于语义色，**保持现有取值不动**，仅在其定义处加注释说明「分类调色板，不受令牌约束」。理由：`tests/unit/holdingsBreakdown.test.ts:83-85` 直接断言该数组前三项，改值会破坏单测且无视觉收益。

### D10：Modal 宽度能力

当前 `Modal.vue` 固定 `max-width: 600px; width: 90%`（第 69-70 行），而 `StockEditor.vue` 现为 `width: 400px`。直接换用会导致编辑弹窗被撑宽，属未登记的布局变化。

决策：为 `Modal.vue` 增加 `width?: string` 与 `maxWidth?: string` props，默认值维持现有 `90%` / `600px`，`StockEditor`、`TradeEditor` 迁移时传 `width="400px"`，`TransferEditor` 保持默认。

验收表述随之修正为「同类弹窗容器规格一致（圆角、阴影、遮罩、标题栏），宽度由 props 指定」。

### D11：Toast 等级扩展

`useToast.ts:6,13` 目前只有 `'success' | 'error' | 'info'`，而 `PositionView.vue:110,120` 自带 `'info' | 'warning' | 'error'`。若直接迁移会把 `warning` 降级为 `error`，属于静默丢失能力。

决策：为 `useToast` 与 `ToastNotification` 增加 `'warning'` 等级（复用 `--color-warning` 与 `--bg-warning-subtle`），使公共能力覆盖原有场景。这是**新增能力**，不改变既有调用点的行为。

`PositionView` 的唯一调用点当前为 `error`，迁移后行为不变。

### D12：迁移顺序与安全网

顺序固定为：**L1 令牌 → L2 基础类与图标 → L3 逐页/逐组件迁移 → 收尾清理**。

L3 内部分两批：先 9 个视图页面（由简到繁），再组件（按硬编码密度由高到低）。每个单元独立提交、独立目视核对。

页面批次：`LogPage`(195 行) → `HistoricalTradesView`(150) → `FundManagementView`(223) → `PositionView`(253) → `WatchlistView`(328) → `SettingsView`(482) → `GridView`(755) → `GridSimulationView`(676) → `PatternScanView`(869)。

组件批次（按 hex 行数）：`FundStatistics`(41) → `ProfitStatistics`(32) → `KlineChartDialog`(23) → `KlineBatchDownloadDialog`(21) → `TransferRecordItem`(16) → `KlineDownloadDialog`(11) → `StockItem`(11) → `Modal` → `ToastNotification` → `LogViewer` → `StockEditor` → `TradeEditor` → `TransferEditor` → `PositionItem` → `TradeRecordItem` → `TransferRecordList` → 其余无硬编码组件（`StockList`、`ProfitChart`、`RefreshButton`、`SideNav`、`TitleBar`、`IndexStatusBar`、`DateRangePicker`、`HistoricalTradeDetail`、`HistoricalTradeItem`、`PositionList`）

安全网：

- 每阶段结束跑 `npm run typecheck`（`vue-tsc --noEmit`）
- 每个单元迁移后执行以下断言：
  - 无裸十六进制色值
  - 无 `font-size: <数字>` 直接数值
  - 无重定义的 `.btn-*` 规则
  - 无图标性符号字符（断言正则需排除合法场景：`useKlineChart.ts` 内 Canvas 形态标注使用的 `▲▼◆`、`SideNav.vue:69` 注释、`?` 在三元表达式中的出现）
- 单测基线：迁移前先跑一次 `tests/` 记录基线，`holdingsBreakdown.test.ts` 与 `profitStatistics.test.ts` 为重点关注项

项目无自动化视觉测试，视觉正确性只能靠人工逐单元确认，这是本次变更主要的验证成本。

## Risks / Trade-offs

| 风险 | 缓解 |
|---|---|
| 字号基准 16px 使所有 rem 尺寸放大 1.143 倍，某文件漏做重映射则该处字号被动变大 | 以页面/组件为单位整体处理该文件全部字号与间距，禁止跨文件批量正则替换；每单元迁移后目视核对 |
| `_base.scss` 为全局非 scoped 样式，`.btn` 等通用类名可能与现有 scoped 规则冲突 | 基础类只在全局层定义；页面 scoped 内只允许组合使用，不允许重定义同名类；迁移时同步删除文件内同名定义 |
| 344 行硬编码无法一次改完，遗漏项让「统一」流于形式 | 不给硬编码留后门：每单元结束时 grep 断言，未清零不得进入下一单元 |
| 迁移期间旧名与新名并存，开发者可能继续用旧名 | 别名区加显著注释；每单元迁移时同步替换该文件旧名，而非堆到收尾 |
| 图表颜色改为令牌读取后颜色与之前不同，可能被误认为数据变化 | 已在 proposal 登记完整可见变化清单；一次只改颜色来源不改绘制逻辑 |
| `designTokens.ts` 在样式生效前读取会拿到空串，导致图表全黑或透明 | 不在模块顶层读取；首帧后（`onMounted`）首次调用；空值返回 fallback |
| `✓`／`✗` 在 JS 字符串拼接中，纯样式替换无法覆盖 | 该处改为「状态字段 + 模板渲染」，作为独立任务列出，不混在样式替换里 |
| 无法自动化验证视觉效果，人工核对可能漏单元 | 建立逐单元 checklist：标题字号、按钮形态、输入框焦点态、空状态、表格行、弹窗、Toast 七项 |
| `PatternScanView` 869 行全 px 体系，改动面最大 | 放在页面批次最后，此时基础类已被前 8 页验证过，可参照成熟样例 |
| 饼图调色板若被误改，`holdingsBreakdown.test.ts` 会失败 | 明确登记 `HOLDINGS_COLORS` 为数据调色板例外，不在迁移范围 |

## Migration Plan

1. **阶段 A — 令牌就位**（仅字号基准变化，其余不改变现有渲染）
   - 新建 `_tokens.scss`：全部新令牌 + 兼容别名区 + 补齐 12 个缺失变量
   - `--color-error` 的 2 处引用直接改名 `--color-danger`
   - 改写 `main.scss`：`html { font-size: 16px }`、`body { font-size: var(--font-size-sm) }`
   - 验证：应用可启动、无样式塌陷，页面尺寸整体略放大属预期
2. **阶段 B — 基础类与图标**
   - 新建 `_base.scss`（5 形态 × 2 尺寸按钮、输入类、容器类、空状态、标签）
   - 新建 `AppIcon.vue`（图元数组）+ 16 个图标
   - 新建 `designTokens.ts`，改造 4 处图表色源
   - `Modal` 增加 `width`／`maxWidth` props
   - `useToast` 增加 `warning` 等级
   - 验证：此时无页面引用，应用渲染不变
3. **阶段 C — 逐单元迁移**（9 页面 + 26 组件，每单元独立提交）
   - 每单元：删除重复定义 → 换基础类 → 图标换 `AppIcon` → 色值换令牌 → 旧变量名同步替换 → `typecheck` + 目视核对七项
4. **阶段 D — 消除重复实现**
   - `StockEditor`／`TradeEditor` 改用 `Modal.vue`（带宽度参数）
   - `PositionView` 改用 `useToast`
5. **阶段 E — 清理**
   - 删除 `_tokens.scss` 兼容别名区
   - 执行全项目断言（页面级 → 组件级 → 全项目级）
   - 跑 `tests/` 与迁移前基线对比

**回滚策略**：每个阶段独立提交，视觉问题可 `git revert` 单个阶段；L3 按单元提交使得单个页面/组件可独立回退。令牌层是纯新增 + 别名，回滚阶段 A 即恢复原状。

## Open Questions

无。用户已确认三项关键决策：范围（L1+L2+L3 全做，含组件层）、图标方案（零依赖手写 16 个 SVG）、字号（不保留 13px，11px 一并并入 12px）。
