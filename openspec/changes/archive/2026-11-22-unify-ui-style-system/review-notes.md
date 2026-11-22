# unify-ui-style-system 文档审阅意见

审阅日期：2026-11-20
审阅范围：`proposal.md`、`design.md`、`specs/ui-style-system/spec.md`、`tasks.md`（对照当前代码库核验）

## 总体结论

方案方向成立（令牌 → 基础类/图标 → 逐页迁移 → 清理），现状量化的多数数字经核验属实。但文档之间在**未定义变量清单、按钮类清单、图标替换归属、验收断言范围**上不闭合，且令牌清单不足以支撑「全项目 0 硬编码」这一验收目标。建议按下文 P0 项修订后再进入实现，否则 L3 阶段会反复返工。

## 事实核验（与文档数字的对照）

| 文档声明 | 实测结果 | 结论 |
|---|---|---|
| 36 个 Vue 单文件组件 | `src/**/*.vue` 共 36 个 | 属实 |
| 318 处硬编码 hex | `.vue` 298 行 + `.scss` 20 行 = 318 行 | 数字属实，但口径是「含 hex 的行数」（同行多值只计一次），建议在文档标注口径 |
| `px` 126 / `rem` 71 处 `font-size` | 126 / 71 | 属实 |
| main.scss「24 个 CSS 变量、65 行」 | 实际 22 个变量、64 行（`src/styles/main.scss:1-24`） | 数字需修正 |
| 5 个文件用公共 Modal | KlineChartDialog / KlineDownloadDialog / KlineBatchDownloadDialog / TransferEditor / FundManagementView | 属实 |
| 12 个被引用未定义变量 | 清单本身在 design 与 tasks 中不一致（见 P0-3） | 数字量级可信，清单有误 |
| ProfitChart 两处重复颜色 98-99 / 129-130 | 与代码一致 | 属实 |
| PositionView 手写 toast 且硬编码 `#fff3e0` | `src/views/PositionView.vue:212-240` | 属实 |
| SideNav 9 个数据驱动图标 | `src/components/SideNav.vue:32-80` 共 9 个 `iconPath` | 属实 |

---

## P0（阻断：不修订会导致任务无法落地或验收必然失败）

### P0-1 任务分解只覆盖 9 个页面，验收却要求全项目为 0

- 证据：`tasks.md` 第 4 节仅迁移 9 个页面的 `.vue`；但 `tasks.md:54-56`（6.2/6.3/6.4）要求全项目「裸 hex 0 命中、`font-size` 数值 0 命中」。而组件层遍地是硬编码：`FundStatistics.vue`（41 处 hex，含 4 处 rgba）、`ProfitStatistics.vue`（33）、`KlineChartDialog.vue`（23）、`KlineBatchDownloadDialog.vue`（21）、`TransferRecordItem.vue`（16）、`KlineDownloadDialog.vue`（11）、`StockItem.vue`（11）、`Modal.vue`（6）、`ToastNotification.vue`（9）；`font-size` 数值硬编码分布在 20 个文件。
- 影响：L3 完成后 6.2/6.3 必然失败，等于把「统一」目标留在半途。
- 建议：新增「组件迁移」任务组（按组件逐个列出，或明确「页面任务包含其下属子组件」），并把 `design.md:35` 的受影响组件清单与 tasks 对齐；6.2/6.3 拆成「页面级断言」与「组件级断言」两阶段。

### P0-2 AppIcon 替换任务指向了错误的文件，实际图标所在组件无人负责

- 证据：`tasks.md:32` 称 `LogPage.vue` 内的 `⟳ / ⚠ / 📄` 换 AppIcon，但这三个符号实际在 `src/components/LogViewer.vue:15,20,25`；`LogPage.vue` 模板里没有这些字符。其余漏项：
  - `▼`：`src/components/PositionItem.vue:203`、`src/components/HistoricalTradeItem.vue:99`
  - `✎` / `✕`：`src/components/TradeRecordItem.vue:71-72`
  - `✏️`：`src/components/TransferRecordItem.vue:13`
  - `✓` / `✗`：`src/components/KlineBatchDownloadDialog.vue:134,138`（位于 **JS 字符串拼接** 中，不是模板图标）
- 影响：`spec.md:111-114` 的「符号字符 0 命中」无法达成；`design.md:168` 只写了「替换的现有写法」，未写「所在文件」，导致任务归属漂移。
- 建议：在 D6 表中为每个图标补充「所在文件」，tasks 增加 LogViewer、PositionItem、HistoricalTradeItem、TradeRecordItem、TransferRecordItem、KlineBatchDownloadDialog 六个组件任务；对 `✓/✗` 明确需把字符串拼接改成模板 + 组件渲染。

### P0-3 「12 个未定义变量」清单三处不一致，且包含已定义变量、漏掉真实缺失变量

- 证据：
  - `design.md:18` 列：`--bg-tertiary`、`--bg-primary`、`--bg-header`、`--bg-hover`、`--bg-highlight`、`--card-bg`、`--input-bg`、`--disabled-bg`、`--secondary-bg`、`--text-primary`、`--text-tertiary`、`--color-error`。
  - `tasks.md:6` 列：`--bg-primary`、`--bg-secondary`、`--bg-tertiary`、`--bg-hover`、`--bg-highlight`、`--bg-header`、`--card-bg`、`--input-bg`、`--disabled-bg`、`--text-primary`、`--text-secondary`、`--text-tertiary` + `--border-color` light 变体。
  - 其中 `--bg-secondary`、`--text-secondary` **已在** `src/styles/main.scss:3-4` 定义，不属于缺失；而 `--secondary-bg` 与 `--color-error` 在 tasks 中被漏掉。
  - `--color-error` 有真实引用：`src/components/TradeEditor.vue:355,357`（`var(--color-error, #e53935)`）。按 `tasks.md:8` 的别名方案只把 `--error-color` 指向 `--color-danger`，`--color-error` 仍然无定义，这两条规则会继续走回退色 `#e53935`——恰好是本次要消灭的「第四种红」。
- 建议：以实际 grep 结果生成唯一清单，删除 tasks 中两个「已定义」项，把 `--color-error` 的 2 处引用改名 `--color-danger` 单列一条任务；`--secondary-bg` 保留在别名区（它属于同义组）。

### P0-4 基础按钮类清单不完整，删掉页面内定义后按钮会瞬间掉样式

- 证据：`spec.md:69` 要求 `.btn`、`.btn-primary`、`.btn-secondary`、`.btn-ghost`、`.btn-danger`、`.btn-cancel` 只出现在 `_base.scss`；但 `design.md:137` 与 `tasks.md:14-15` 只定义了 primary/secondary/ghost/danger + sm/md/lg，**没有 `.btn-cancel`**。
- 存量还有以下语义类无归宿：`.btn-add`（`PositionView.vue:190`、`WatchlistView.vue:281`、`TransferRecordList.vue:224`）、`.btn-add-first`（`TransferRecordList.vue:256`）、`.btn-edit`/`.btn-delete`（`StockItem.vue:269-321`、`TradeRecordItem.vue:156-161`、`TransferRecordItem.vue:172-173`）、`.btn-delete-confirm`（`FundManagementView.vue:194-214`）、`.btn-close`（`StockEditor.vue:233`）、`.btn-open-dir`（`LogPage.vue:114`）。`tasks.md:36` 只处理了 `.btn-add`/`.btn-secondary` 两个。
- 影响：迁移顺序是「先删页面内定义、再套基础类」，缺映射时页面在中间态直接丢样式；且 spec 的静态断言（`.btn-cancel` 只在 `_base.scss`）没有对应实现任务。
- 建议：在 D5 补一张「存量类名 → 目标基础类」映射表（例如 `.btn-add → .btn.btn-primary`、`.btn-edit/.btn-delete → .btn.btn-ghost.btn-icon` 或保留语义类但在 `_base.scss` 内定义），tasks 2.x 建齐这些类。

### P0-5 按钮尺寸变体数量三处自相矛盾

- 证据：`proposal.md:13` 写「按钮 4 型 × 2 尺寸」；`tasks.md:14` 定义 `.btn-sm/.btn-md/.btn-lg` 三种；`design.md:137` 只列 `.btn-sm/.btn-md`。
- 建议：统一为 2 种（sm 28 / md 32，与输入框 32px 对齐）或 3 种，并同步修改三份文档，避免实现时各写一套。

---

## P1（重要：影响视觉目标达成或引入未登记的变化）

### P1-6 令牌集不足以支撑「318 → 0」，缺少中性色阶与状态色族的收敛决策

- 证据：实测 84 个唯一 hex，分属三套色系：
  - Tailwind 灰：`#6b7280`(18)、`#9ca3af`(17)、`#374151`(17)、`#e5e7eb`(16)、`#f9fafb`(11)、`#f3f4f6`(11)、`#d1d5db`(10)、`#111827`(8)
  - Element：`#67c23a`(10)、`#f56c6c`(8)、`#909399`(7)、`#f0f9eb`(5)、`#f4f4f5`(4)、`#e6a23c`(2)
  - Ant：`#52c41a`、`#ff4d4f`、`#faad14`
- `tasks.md:5-6` 只定义语义色 + 12 个表面/文字变量，没有中性灰阶（text-1/2/3/4、border-light/lighter、surface-1/2/3），也没有 overlay / scrollbar / hover / focus-ring 令牌；同时未决定灰阶与成功/危险色最终采用哪一族。
- 影响：`spec.md:49-53` 要求不留 hex，但巧妇难为无米之炊，实现时会临时自造变量，回到「无单一来源」。
- 建议：在 design 增加「色板收敛决策」小节（建议 Ant 语义色 + Tailwind 中性灰），列出完整令牌清单（`--neutral-*`、`--surface-*`、`--border-*`、`--overlay`、`--focus-ring`），tasks 1.x 同步扩表；并说明 Element 系（Toast/批量下载）统一后会有可见色值变化。

### P1-7 Canvas 颜色任务与令牌定义不匹配，且漏掉另外三个图表色源

- 证据：`tasks.md:26` 要求 `useKlineChart.ts` 的 15 个常量全部走令牌，但 1.3 只定义 profit/loss/buy/sell/dividend。`src/composables/useKlineChart.ts:45-75` 中 `COLOR_FLAT`、`COLOR_AXIS`、`COLOR_AXIS_TEXT`、`COLOR_VOLUME_UP/DOWN`、`COLOR_TOOLTIP_BG/TEXT`、`COLOR_PATTERN_BULLISH/BEARISH/WARNING` 均无对应令牌。
- 未登记的视觉变化：`COLOR_BUY #22c55e → --color-buy #52c41a`、`COLOR_SELL #ef4444 → --color-sell #ff4d4f`、**`COLOR_DIVIDEND #3b82f6 → --color-dividend #faad14`（分红标注由蓝变琥珀）**；`design.md:197-204` 只写了 UP/DOWN 与利润图的变化。
- 漏项：
  - `src/composables/useProfitChart.ts:65-66` 也硬编码 `#ef4444/#10b981`（tasks 3.3 只覆盖 `ProfitChart.vue:98-99,129-130`）
  - `src/components/FundStatistics.vue:299,349-351` 还有 `#3b82f6/#f97316/#10b981` 三个图表色
  - `src/utils/holdings.ts:18` 的 `HOLDINGS_COLORS` 是饼图调色板，且被 `tests/unit/holdingsBreakdown.test.ts:83-85` 断言
- 建议：令牌表补一组 `--chart-*`；任务补 `useProfitChart.ts` 与 `FundStatistics.vue`；明确 `HOLDINGS_COLORS` 属「数据调色板例外」或改为令牌数组，并说明对单测的影响（项目约束：饼图必须保留「账户余额」扇区）。

### P1-8 `designTokens.ts` 存在运行时取值风险，且 alpha 色无方案

- 证据：`design.md:186-193` 只描述「读取 `:root` 计算值并缓存」。`getComputedStyle(document.documentElement)` 在样式生效前调用会返回空串；`COLOR_VOLUME_UP/DOWN` 是 `rgba(...,0.5)`（`useKlineChart.ts:61-63`），无法由 hex 令牌直接得出。
- 建议：design 明确「懒加载 + 首帧后读取 + 空值兜底」；为带透明度需求定义 `--chart-volume-up` 这类含 alpha 的令牌，或约定用 hex→rgba 工具函数换算（工具函数放 `src/utils/`）。

### P1-9 AppIcon 模板只支持单条 path，多数目标图标是多图元

- 证据：`design.md:150-155` 模板为 `<path :d="paths[name]" />`。但 `search`（圆 + 斜线）、`trash`（盖 + 桶 + 竖线）、`download`（箭头 + 托盘）、`warning`（三角 + 感叹号）、`info/error`（圆 + 符号）都需要多个图元；单 `d` 拼接时圆要写成弧线，线宽交接容易走形。
- 建议：`paths` 改为 `string[]` 并 `v-for` 渲染多个 `<path>`，或按图标允许混合 `circle/line/path`；同步修改 tasks 2.6 的模板要求。

### P1-10 AppIcon 尺寸约束矛盾、无障碍缺失、替换范围不含 `×`/Toast 图标

- 证据：`spec.md:105` 写「尺寸只允许 16 与 20」；`design.md:149` 写 `size?: 16 | 20 | number`，联合类型被 `number` 吞掉，等于没有约束。
- `Modal.vue:8` 的关闭图标是文本 `×`，`spec.md:112` 的符号清单没有 `×`，因此它不会被替换；`ToastNotification.vue:20-28` 的 16×16 填充图标也不在 tasks 中，而 `design.md:168-169` 又声称用 AppIcon 的 `info/error` 替换 Toast 图标。
- 建议：props 收紧为 `size?: 16 | 20`；组件根节点加 `aria-hidden="true"`（装饰性），需要语义时由调用方传 `aria-label`；spec 符号清单补 `×`，tasks 补 Modal 与 ToastNotification 的图标替换。

### P1-11 PositionView toast 迁移会收窄等级，且新增「等级语义」要求与「不改功能行为」冲突

- 证据：`PositionView.vue:110,120` 自带 `'info' | 'warning' | 'error'`；公共 `useToast.ts:13` 只有 `'success' | 'error' | 'info'`。当前唯一调用点为 `error`，迁移可行，但 `warning` 能力消失。
- `spec.md:151-153` 新增「部分成功不得以成功等级提示，并说明成功/失败数量」——这是新的行为要求；`proposal.md:37` 却声明「不受影响：所有功能行为」。
- 建议：design 给出 toast 等级映射（warning → error，或扩展 `useToast` 增加 warning）；spec 该 scenario 收敛为「提示等级与结果一致」，不引入新的业务返回值统计逻辑。

### P1-12 页面标题档位与 24px 令牌的内部矛盾

- 证据：`design.md:99` 把 `1.25rem` 映射到 `--font-size-lg`(18px)；但页面标题统一定义为 `--font-size-xl`(20px)（`design.md:86`），`tasks.md:40` 又要求 PatternScanView 的 `1.25rem` 标题「对齐页面标题令牌」。
- `--font-size-2xl`(24px) 在整张迁移映射表中无任何来源，存在「令牌有了但无处使用」的空转风险。
- 建议：在 D2 增加「角色优先于数值」的例外说明；明确 2xl 的落点（如 FundStatistics 总资产数字）并写入任务。

### P1-13 间距重映射只有一句「同理」，缺少映射表；6 档令牌表达不了现有小间距

- 证据：`design.md:109` 仅写「同理，间距的 rem 值也按语义档位重映射」；`tasks.md:4` 只给 6 档（0.25–2rem）。现有 px 间距包含 4/6/8/12/18/24px（如 `PatternScanView` 的 `4px 8px`、`6px 18px`、`8px 12px`），其中 6px=0.375rem、18px=1.125rem 均不在档位内。
- 同时 `html` 基准 14→16 后，所有 rem 间距自动放大 14%，与不变 px 间距同页混排会被拉开密度差。
- 建议：给出完整的「旧间距 → 新令牌」映射表；补充 2px 级细节保留 px 的边界，或把档位扩展为 4/8/12/16/24/32。

### P1-14 Modal 无法承载现有弹窗尺寸，迁移会带来未登记的布局变化

- 证据：`Modal.vue:65-71` 固定 `max-width:600px; width:90%`；`StockEditor.vue:212-217` 现为 `width:400px`。`tasks.md:46-47` 只要求换用 Modal，未包含「为 Modal 增加宽度参数」。
- 建议：先给 Modal 增加 `width`/`maxWidth` props 再迁移；`tasks.md:48` 的「完全一致」改成「同类弹窗容器规格一致（宽度可由 props 指定）」。

### P1-15 别名只覆盖 6 组，`--bg-color` 等变量无归宿，会制造新的同义变量

- 证据：`--bg-color` 在 `src/App.vue:77,99`、`LogViewer.vue`、`LogPage.vue`、`main.scss` 共 6 处引用；但 D4（`design.md:126-133`）、tasks 1.4/1.6 均未给出它的新名。而 tasks 1.4 又新增 `--bg-primary`——若两者并存，直接违反 `spec.md:13`「不出现同义变量并存」。
- `--active-bg`、`--title-bar-bg` 同样没有纳入收敛表（D4 只说「表面与文字统一为 `--bg-*`/`--text-*`」）。
- 建议：明确 `--bg-color → --bg-primary`（或反向保留 `--bg-color` 作为唯一页面底色），把三个变量补进 D4 的命名收敛表与别名区。

---

## P2（细节/可执行性）

1. **spec 混入流程要求**：`spec.md:155-169` 的「视觉一致性可验证」整节是 typecheck、测试、grep 等流程约束，属于 tasks/design 的验证章节，`spec` 描述可观察能力更合适；建议下沉，避免与其他能力的 spec 风格不一致。
2. **符号断言会误命中**：`spec.md:112` 用字符搜索 `▼ ▶ ✓ ✗ ⚠ ⟳ ✎ ✕ ? 📄 ✏️`，但 `useKlineChart.ts:76,219,595,690,716`（Canvas 形态标注）与 `SideNav.vue:69`（注释）合法包含 `▲/▼/◆`，`?` 还会命中大量三元表达式。建议把断言限定为「模板文本节点与样式/脚本中的图标用法」，并给出可执行正则。
3. **main.scss 变量数与行数**：`design.md:3` 写 65 行、`design.md:6` 写 24 个变量，实际 64 行、22 个（`main.scss:1-24`）。
4. **图标数量表述**：`proposal.md:13` 写「12–16 个」，D6 与 tasks 2.7 定为 16 个，建议统一；另 D6 表把 `arrow-up / arrow-down` 写成一行却只定义一条路径，tasks 2.7 只列 `arrow-up`，需说明 `arrow-down` 由旋转实现（`design.md:176` 已有，但表头易误读）。
5. **图标观感变化未登记**：`ToastNotification.vue:20-28`、`KlineBatchDownloadDialog` 的现有图标是 `fill` 填充式（16×16 viewBox），统一为 `stroke` 线性图标属可见变化，应补进 `proposal.md:15-16` 的可见变化清单。
6. **提交粒度与仓库规则冲突**：`tasks.md:30` 「每页独立提交」需与 `AGENTS.md`「新功能先建分支」「修复完成后等用户确认再提交」对齐，任务里建议写明分支与确认节点。
7. **两阶段迁移收益会被 6.1 抵消**：tasks 4.x 没有要求「该页旧变量名一并替换」，把旧名替换全部堆到 6.1，等于最后一次性大改。建议在每页迁移任务中追加「该文件旧变量名同步替换」。
8. **`_stock-grid.scss` / `_position-grid.scss` 无任务归属**：`proposal.md:31` 点名受影响，tasks 无对应任务；需确认它们是否引用令牌、是否纳入 grep 断言。
9. **视觉验收缺量化基线**：`html` 基准 14→16 会让所有未迁移页面的 rem 值立刻放大 14%，`tasks.md:10` 仅要求「变化在预期范围内」这一主观判断。建议约定每页迁移前后的基准截图与核对清单（标题字号、按钮、输入焦点、空状态、表格行、弹窗、Toast 已有七项，可复用）。
10. **测试影响未评估**：`tests/unit/holdingsBreakdown.test.ts` 直接断言调色板常量；`tests/unit/profitStatistics.test.ts` 可能触及利润图行为，建议在 tasks 6.6 中写明需先跑基线并记录。

---

## 建议的最小修订清单

1. 统一「未定义变量」权威清单，修正 tasks 1.4（去掉已定义的 `--bg-secondary`/`--text-secondary`，补 `--color-error` 改名任务）。
2. 在 D5 补存量为按钮类 → 目标基础类的映射表，并补齐 `.btn-cancel`、`.btn-add`、`.btn-edit`、`.btn-delete`、`.btn-delete-confirm`、`.btn-close` 等。
3. 统一按钮尺寸变体为 2 种或 3 种（proposal/design/tasks 三处一致）。
4. 新增组件迁移任务组（至少 FundStatistics、ProfitStatistics、KlineChartDialog、KlineDownloadDialog、KlineBatchDownloadDialog、Modal、ToastNotification、LogViewer、StockItem、TradeRecordItem、TransferRecordItem、TransferRecordList、StockEditor、TradeEditor），并把 6.2/6.3 拆成页面级与组件级。
5. 修正图标任务归属（LogViewer、PositionItem、HistoricalTradeItem、TradeRecordItem、TransferRecordItem、KlineBatchDownloadDialog），并说明 `✓/✗` 从字符串改为模板渲染。
6. 补「色板收敛决策」与完整令牌清单（中性灰阶、surface、border、overlay、chart、alpha 色）。
7. 补间距映射表，扩展档位或明确 px 例外。
8. 给 Modal 增加宽度能力，修改 tasks 5.1/5.2/5.3 的验收表述。
9. 明确 `--bg-color`、`--active-bg`、`--title-bar-bg` 的收敛去向。
10. 修正 design 中的行数/变量数，并把 AppIcon 模板改为多图元、props 收紧为 `16 | 20`。
