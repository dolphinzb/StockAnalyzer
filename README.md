# StockAnalyzer

基于 Electron + Vite + Vue3 + TypeScript 的股票分析桌面应用

## 功能特性

- **股票监控** - 添加自选股，实时监控股价变动
- **持仓管理** - 记录交易记录，自动计算持仓成本和盈亏
- **网格交易** - 支持网格交易策略配置与监控
- **价格告警** - 设置买入/卖出阈值，触发时系统通知
- **系统托盘** - 最小化到托盘，后台持续监控
- **日志查看** - 内置日志查看器，方便调试追踪

## 技术栈

- **前端框架**: Vue 3 (Composition API)
- **状态管理**: Pinia
- **桌面框架**: Electron 28.x
- **构建工具**: Vite 5.x
- **语言**: TypeScript 5.x (严格模式)
- **样式**: SCSS
- **数据库**: SQLite (sql.js)
- **打包工具**: electron-builder

## 项目结构

```
├── electron/              # Electron 主进程代码
│   ├── services/          # 服务层
│   │   ├── alertService.ts    # 价格告警服务
│   │   ├── gridService.ts     # 网格交易服务
│   │   ├── priceFetcher.ts    # 股票价格获取服务
│   │   └── tradeService.ts    # 交易记录服务
│   ├── database.ts        # SQLite 数据库操作
│   └── index.ts           # 主进程入口
├── src/                   # Vue 渲染进程代码
│   ├── components/        # Vue 组件
│   │   ├── IndexStatusBar.vue     # 底部指数状态栏
│   │   ├── LogViewer.vue          # 日志查看器
│   │   ├── PositionItem.vue       # 持仓项组件
│   │   ├── PositionList.vue       # 持仓列表
│   │   ├── RefreshButton.vue      # 刷新按钮
│   │   ├── SideNav.vue            # 侧边导航栏
│   │   ├── StockEditor.vue        # 股票编辑器
│   │   ├── StockItem.vue          # 股票项组件
│   │   ├── StockList.vue          # 股票列表
│   │   ├── TitleBar.vue           # 标题栏
│   │   ├── ToastNotification.vue  # Toast 通知组件
│   │   ├── TradeEditor.vue        # 交易记录编辑器
│   │   └── TradeRecordItem.vue    # 交易记录项
│   ├── composables/       # 组合式函数
│   │   ├── useConfig.ts           # 配置管理
│   │   ├── useIndexData.ts        # 指数数据
│   │   ├── useNavigation.ts       # 导航管理
│   │   └── useToast.ts            # Toast 通知
│   ├── stores/            # Pinia 状态管理
│   │   ├── logStore.ts            # 日志存储
│   │   ├── position.ts            # 持仓存储
│   │   └── watchlist.ts           # 自选股存储
│   ├── styles/            # 样式文件
│   │   └── main.scss              # 全局样式
│   ├── views/             # 页面视图
│   │   ├── GridView.vue           # 网格交易页面
│   │   ├── LogPage.vue            # 日志页面
│   │   ├── PositionView.vue       # 持仓页面
│   │   ├── SettingsView.vue       # 设置页面
│   │   └── WatchlistView.vue      # 自选股页面
│   ├── App.vue            # 根组件
│   ├── main.ts            # 渲染进程入口
│   ├── types.ts           # 类型定义
│   └── shims-vue.d.ts     # Vue 类型声明
├── shared/                # 共享类型定义
│   └── types/
│       └── index.ts       # 共享类型
├── specs/                 # 功能规格文档
│   ├── 001-project-scaffold/      # 项目骨架
│   ├── 004-sidebar-navigation/    # 侧边导航
│   ├── 005-settings-configuration/# 设置配置
│   ├── 006-stock-watchlist-page/  # 自选股页面
│   ├── 007-position-page/         # 持仓页面
│   ├── 008-grid-trading/          # 网格交易
│   ├── 009-add-log-viewer/        # 日志查看器
│   └── 010-index-status-bar/      # 指数状态栏
├── tests/                 # 测试文件
│   ├── e2e/               # 端到端测试
│   └── unit/              # 单元测试
├── dist/                  # 构建输出目录
└── release/               # 打包输出目录
```

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器 (同时启动 Vite 和 Electron)
npm run dev

# 仅启动 Vite 开发服务器
npm run dev:vite

# 仅启动 Electron (需先构建主进程)
npm run dev:electron

# 构建生产版本
npm run build

# 仅构建 Electron 主进程
npm run build:electron

# 预览生产版本
npm run preview

# 代码检查
npm run lint

# 代码检查并修复
npm run lint:fix

# 类型检查
npm run typecheck
```

## 页面说明

| 页面 | 说明 |
|------|------|
| 自选股 | 管理关注的股票，查看实时价格和涨跌幅 |
| 持仓 | 查看持仓股票、成本、盈亏情况 |
| 网格交易 | 配置网格交易策略，自动计算交易点位 |
| 设置 | 配置刷新间隔、代理等应用设置 |
| 日志 | 查看应用运行日志 |
| 底部状态栏 | 显示主要指数（上证指数、深证成指、创业板指）实时行情 |

## 注意事项

- 开发环境下修改 Electron 主进程代码后需要重启应用
- 构建前请确保所有代码已保存
- 数据库使用 SQLite，数据存储在应用数据目录

## License

MIT
