## Why

指数状态栏当前只在自选股页面渲染，用户切到持仓、网格、历史交易、资金管理、形态扫描、设置等页面后指数信息即消失。但指数数据本身早已是全局的：主进程价格轮询统一抓取并通过 `index:update` 广播，渲染进程在 `App.vue` 挂载时一次性订阅，`indexDataState` 常驻于 store。也就是说缺失的只是「展示位置」，而不是数据能力。把状态栏提升为主内容区常驻底栏，才能兑现规格里「无需切换页面即可一屏掌握市场整体表现」的目标。

## What Changes

- 在 `src/App.vue` 中新增 `.content-area` 容器包裹 `<main>` 与状态栏，状态栏位于主内容区底部，宽度与主内容区一致、左边缘与主内容区对齐，不跨越侧边导航栏
- 移除 `src/views/WatchlistView.vue` 内对 `IndexStatusBar` 的挂载与引用（自选股页面因此多出 30px 列表高度）
- 状态栏配色改用语义词：背景 `--title-bar-bg`、上边框 `--border-color`、指数名称 `--text-color`，与 `TitleBar` 统一，去掉硬编码浅色值
- 错误提示由「状态栏上沿外侧浮层」改为「状态栏内部右侧的紧凑标签」，不再悬浮覆盖页面内容
- 数据归属保持不变：继续复用 `watchlist` store 的 `indexDataState`，不新建 store、不改 IPC
- 手动刷新入口保持不变：仍只有自选股页的刷新按钮会顺带刷新指数，其余页面依赖每分钟轮询

## Capabilities

### New Capabilities

<!-- 无新增能力 -->

### Modified Capabilities

- `index-status-bar`: 展示位置由「自选股页面底部」提升为「主内容区底部、跨视图常驻」；视觉样式改用语义变量与标题栏统一；数据异常提示改为栏内右侧紧凑标签

## Impact

**受影响的文件**:
- `src/App.vue` - 新增 `.content-area` 布局容器与状态栏挂载，`watchlistStore.indexDataState` 直接复用
- `src/views/WatchlistView.vue` - 移除状态栏挂载与 import
- `src/components/IndexStatusBar.vue` - 配色改用语义词、错误提示改为栏内右侧标签、补齐 `flex-shrink: 0`

**API影响**: 无（不涉及 IPC、`IndexData` 结构、主进程轮询）

**依赖影响**: 无

**用户体验影响**:
- 正面: 任意页面都能看到三大指数，底部状态栏与顶部标题栏形成对称的窗口框架
- 风险: 所有页面可用高度减少 30px（状态栏高度），长列表页面滚动区域相应缩小；错误状态下最右侧紧凑标签会占用少量宽度，三个指数项按比例轻微收窄
