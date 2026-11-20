## 1. 布局提升

- [x] 1.1 `src/App.vue` 在 `.app-body` 内新增 `.content-area` 容器（`flex:1; display:flex; flex-direction:column; min-width:0`），包裹 `<main class="main-content">` 与 `<IndexStatusBar>`
- [x] 1.2 `.main-content` 调整为 `flex:1; min-height:0; overflow:auto`，保持其作为唯一滚动容器的语义
- [x] 1.3 `src/App.vue` 引入 `IndexStatusBar`，绑定 `watchlistStore.indexDataState`
- [x] 1.4 `src/views/WatchlistView.vue` 移除 `IndexStatusBar` 的 import 与模板挂载

## 2. 状态栏组件调整

- [x] 2.1 `src/components/IndexStatusBar.vue` 根节点补 `flex-shrink: 0`，避免被页面内容压缩
- [x] 2.2 配色改用语义词：背景 `--title-bar-bg`、上边框 `--border-color`、指数名称 `--text-color`、占位符 `--text-secondary`
- [x] 2.3 错误提示由绝对定位浮层改为状态栏内部右侧 flex 项（`flex:0 0 auto`、`margin-left:8px`、`padding:2px 6px`、圆角、浅橙底深橙字、11px、`white-space:nowrap`、超长省略）
- [x] 2.4 移除仅供绝对定位使用的 `position: relative` 与 `z-index` 及不再使用的 `.error-text` 样式

## 3. 质量门禁

- [x] 3.1 `npm run typecheck` 通过
- [x] 3.2 `npx eslint src/App.vue src/views/WatchlistView.vue src/components/IndexStatusBar.vue` 零告警
- [x] 3.3 `npm test` 无新增失败（60 个测试文件 / 369 个用例全部通过）

## 4. 手动验证

- [x] 4.1 切换到持仓/网格/历史交易/资金管理/形态扫描/设置/日志，底部状态栏在所有页面可见且数值一致
- [x] 4.2 状态栏左边缘与主内容区对齐，不覆盖侧边导航栏；与顶部标题栏背景一致
- [x] 4.3 长列表页面滚动时状态栏固定不动，页面内不出现双重滚动条
- [x] 4.4 断开网络触发指数数据错误：错误标签出现在栏内最右侧，不遮挡三个指数项，恢复后自动消失
- [x] 4.5 自选股页刷新按钮仍能刷新指数，且页面列表未被状态栏挤压出现布局异常
