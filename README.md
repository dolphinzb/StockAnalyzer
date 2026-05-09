# StockAnalyzer

基于 Electron + Vite + Vue3 + TypeScript 的股票分析桌面应用

## 功能特性

- **股票监控** - 添加自选股，实时监控股价变动
- **持仓管理** - 记录交易记录，自动计算持仓成本和盈亏
- **网格交易** - 支持网格交易策略配置与监控
- **价格告警** - 设置买入/卖出阈值，触发时系统通知
- **系统托盘** - 最小化到托盘，后台持续监控
- **日志查看** - 内置日志查看器，方便调试追踪
- **资金管理** - 资金明细记录和盈亏统计分析
- **历史交易** - 查看已清仓股票的历史开仓记录
- **K线下载** - 支持下载指定股票的K线数据

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
│   │   ├── backupService.ts   # 数据库备份服务
│   │   ├── fundService.ts     # 资金管理服务
│   │   ├── gridService.ts     # 网格交易服务
│   │   ├── historicalTradeService.ts # 历史交易服务
│   │   ├── klineDownloadService.ts # K线下载服务
│   │   ├── priceFetcher.ts    # 股票价格获取服务
│   │   └── tradeService.ts    # 交易记录服务
│   ├── database.ts        # SQLite 数据库操作
│   └── index.ts           # 主进程入口
├── src/                   # Vue 渲染进程代码
│   ├── components/        # Vue 组件
│   │   ├── DateRangePicker.vue    # 日期范围选择器
│   │   ├── HistoricalTradeDetail.vue # 历史交易详情
│   │   ├── HistoricalTradeItem.vue # 历史交易项
│   │   ├── IndexStatusBar.vue     # 底部指数状态栏
│   │   ├── KlineChartDialog.vue   # K线图弹窗
│   │   ├── KlineDownloadDialog.vue # K线下载对话框
│   │   ├── LogViewer.vue          # 日志查看器
│   │   ├── Modal.vue              # 模态框
│   │   ├── PositionItem.vue       # 持仓项组件
│   │   ├── PositionList.vue       # 持仓列表
│   │   ├── ProfitChart.vue        # 盈亏图表
│   │   ├── ProfitStatistics.vue   # 盈亏统计
│   │   ├── RefreshButton.vue      # 刷新按钮
│   │   ├── SideNav.vue            # 侧边导航栏
│   │   ├── StockEditor.vue        # 股票编辑器
│   │   ├── StockItem.vue          # 股票项组件
│   │   ├── StockList.vue          # 股票列表
│   │   ├── TitleBar.vue           # 标题栏
│   │   ├── ToastNotification.vue  # Toast 通知组件
│   │   ├── TradeEditor.vue        # 交易记录编辑器
│   │   ├── TradeRecordItem.vue    # 交易记录项
│   │   ├── TransferEditor.vue     # 资金明细编辑器
│   │   ├── TransferRecordItem.vue # 资金明细项
│   │   └── TransferRecordList.vue # 资金明细列表
│   ├── composables/       # 组合式函数
│   │   ├── useBackup.ts           # 数据库备份
│   │   ├── useConfig.ts           # 配置管理
│   │   ├── useIndexData.ts        # 指数数据
│   │   ├── useNavigation.ts       # 导航管理
│   │   └── useToast.ts            # Toast 通知
│   ├── stores/            # Pinia 状态管理
│   │   ├── fundManagement.ts      # 资金管理存储
│   │   ├── historicalTrades.ts    # 历史交易存储
│   │   ├── logStore.ts            # 日志存储
│   │   ├── position.ts            # 持仓存储
│   │   └── watchlist.ts           # 自选股存储
│   ├── styles/            # 样式文件
│   │   └── main.scss              # 全局样式
│   ├── views/             # 页面视图
│   │   ├── FundManagementView.vue # 资金管理页面
│   │   ├── GridView.vue           # 网格交易页面
│   │   ├── HistoricalTradesView.vue # 历史交易页面
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
│   ├── 010-index-status-bar/      # 指数状态栏
│   ├── 011-historical-trades/     # 历史交易
│   ├── 012-database-backup/       # 数据库备份
│   ├── 013-fund-management/       # 资金管理
│   ├── 014-trade-fund-sync/       # 交易资金同步
│   └── 015-kline-download/        # K线下载
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

# 打包程序（windows）
npx electron-builder --win
```


## 页面说明

| 页面 | 说明 |
|------|------|
| 自选股 | 管理关注的股票，查看实时价格和涨跌幅，支持K线数据下载和图表展示 |
| 持仓 | 查看持仓股票、成本、盈亏情况，支持交易记录管理和资金明细同步 |
| 网格交易 | 配置网格交易策略，自动计算交易点位，提供交易计算和开仓计算功能 |
| 资金管理 | 记录资金明细（转入转出、分红、利息等），提供盈亏统计分析 |
| 历史交易 | 查看已清仓股票的历史开仓记录和交易统计信息 |
| 设置 | 配置刷新间隔、API提供商、交易时间段等应用设置，支持数据库手动备份 |
| 日志 | 查看应用运行日志，支持自动刷新和手动刷新 |

## 注意事项

- 开发环境下修改 Electron 主进程代码后需要重启应用
- 构建前请确保所有代码已保存
- 数据库使用 SQLite，数据存储在应用数据目录

## License

MIT
