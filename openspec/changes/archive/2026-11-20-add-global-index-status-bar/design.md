## Context

指数数据链路已经是全局的：`electron/services/priceFetcher.ts` 在每分钟价格轮询中一并抓取 `sh000001`/`sh000688`/`sz399001` 并通过 `index:update` 广播；`src/App.vue` 在 `onMounted` 中调用 `watchlistStore.setupEventListeners()` 全局订阅一次，`indexDataState` 常驻 store。当前唯一的限制是 `src/views/WatchlistView.vue` 把 `IndexStatusBar` 挂在自选股视图末尾，其它视图看不到。

`App.vue` 的布局是 `TitleBar` / `.app-body`(flex:1, row: SideNav + main) / Toast。`main-content` 是 `flex:1; overflow:auto` 的唯一滚动容器，各视图均以 `height:100%` 自适应，全项目只有 `App.vue` 使用 `100vh`。

## Goals / Non-Goals

**Goals**: 状态栏在所有视图常驻、左边缘与主内容区对齐、视觉与标题栏一致、错误提示不悬浮遮挡页面内容、改动不触碰数据链路。

**Non-Goals**: 不新建独立 index store；不新增手动刷新入口、不提供显隐开关；不改状态栏高度（30px）与三指数左右中布局；不改动主进程与 IPC。

## Decisions

### D1 用 `.content-area` 包裹 `main` 与状态栏，而非把状态栏塞进 `main` 内

在 `.app-body`（row）内新增 `.content-area`（`flex:1; display:flex; flex-direction:column; min-width:0`），其子元素为 `main.main-content`（`flex:1; min-height:0; overflow:auto`）与 `IndexStatusBar`。

- 为什么不把状态栏放进 `main`：`main` 是唯一滚动容器，放进去状态栏会随内容滚动，除非再造一层滚动容器，反而改变所有视图的滚动语义。
- 为什么不放在 `.app` 层（`app-body` 之后）：那会横跨整个窗口宽度、延伸到侧边导航栏下方，与用户要求的「左边缘与主内容区对齐」不符；而且视觉上会和 SideNav 切出缺口。
- 布局影响：`main` 仍是有界高度的滚动容器，视图内 `height:100%` 依然成立，各页面无需改动。

### D2 数据归属不动

状态栏直接绑定 `watchlistStore.indexDataState`。`App.vue` 已持有该 store 且已全局订阅事件，功能上零成本。语义上「自选股 store 承载全局状态」确实不够干净，但抽独立 store 属于纯重构，本次不做，避免把布局改动扩散到 store 层。

### D3 视觉改用语义变量

组件内 `#f5f5f5` / `#e0e0e0` / `#333` 改为 `--title-bar-bg` / `--border-color` / `--text-color`（`src/styles/main.scss` 已定义）。状态栏上边框 + 标题栏下边框形成窗口上下对称框架；将来引入暗色主题时无需回改。

### D4 错误提示改为栏内右侧 flex 项

原实现 `position:absolute; top:-20px` 浮在栏外，全局化后会压在页面内容上。改为状态栏最后一个 flex 子项：`flex:0 0 auto`、`margin-left:8px`、`padding:2px 6px`、圆角 3px、浅橙底 + 深橙字、`font-size:11px`、`white-space:nowrap`，文案仍为 `数据更新失败`（较长时 `text-overflow:ellipsis`）。

- 代价：错误状态下三个 `flex:1` 指数项按比例轻微收窄（右项仍在其盒子内右对齐）。该状态属短暂降级，可接受；相比绝对定位与指数文字重叠更安全。
- 弹窗层级无需处理：`Modal`/`TradeEditor`/`StockEditor` 的 `z-index: 1000` 高于状态栏，弹窗照常覆盖底栏；Toast 在右上角 `z-index: 9999`，不冲突。

### D5 手动刷新范围不变

保持现状：只有自选股页的刷新按钮会顺带刷新指数，其它页面由主进程每分钟轮询推送更新。底部栏不加刷新入口与最后更新时间。

## Risks / Trade-offs

- [所有页面可用高度 -30px] → 各视图本身是滚动布局，列表/表格区域自适应；形态扫描、资金管理等长页面需目测确认无内容被压扁或出现双重滚动条。
- [错误标签挤压指数项] → 仅在 error 状态出现，且标签宽度有限；如实际观感不佳，后续可改为仅显示图标 + tooltip（属新变更）。
- [Subcomponent 依赖 watchlist store 的全局事件注册时机] → `App.vue` 的 `onMounted` 早于各视图挂载，状态栏不会错过首帧之后的推送；首次数据到达前按规格显示 `--`。

## Migration Plan

纯前端布局改动，无数据迁移。回滚方式：还原三个文件的改动即可。

## Open Questions

无。
