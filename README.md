# StockAnalyzer

基于 Electron + Vite + Vue 3 + TypeScript 的股票分析桌面应用（当前版本 2.0.0）。

面向 A 股个人投资者，覆盖自选股监控、持仓与交易记账、资金盈亏统计、K 线数据管理与图表分析、蜡烛图形态识别、网格交易策略回测等场景，数据全部保存在本地。

## 功能特性

### 行情监控

- **自选股管理** - 添加/编辑/删除自选股，配置买入与卖出阈值
- **实时价格轮询** - 交易时段内按配置间隔拉取行情，支持新浪、东方财富、腾讯三种数据源
- **价格告警** - 触发买入/卖出阈值时弹出系统通知
- **手动排序** - 拖拽调整自选股顺序，顺序持久化
- **指数状态栏** - 底部常驻展示上证指数、科创 50、深证成指
- **系统托盘** - 最小化到托盘，后台持续监控

### 持仓与交易

- **持仓管理** - 记录买卖与分红，自动计算持仓均价、成本与浮动盈亏
- **交易记录编辑** - 支持修改与删除，自动重放该股票的持仓快照链
- **历史开仓** - 按「开仓 → 清仓」周期归档，查看已清仓股票的交易统计
- **ETF/基金费率** - 场内基金免印花税、免过户费、佣金免最低 5 元
- **交易资金联动** - 交易记录与资金明细在同一事务内写入，失败整体回滚

### 资金管理

- **资金明细** - 转入/转出、股息、股息扣税、利息、股票买卖等类型记账，余额链自动重算
- **资金概览** - 账户余额 + 持仓市值 = 总资产，逐只持仓市值明细与资产分布
- **盈亏统计** - 指定区间盈亏、转入转出汇总、期初/期末资产对比，支持日期快捷选项
- **图表分析** - 年度盈亏柱状图、月度盈亏趋势、月度资金变化

### K 线与形态分析

- **多周期 K 线** - 日线、周线、月线独立建表存储，支持不复权与前复权
- **K 线下载** - 手动单只下载、批量下载（含进度事件）、交易日 15:10 自动增量下载与启动补跑
- **K 线图表** - Canvas 绘制，支持缩放、悬浮详情、交易记录标记、周期切换
- **形态检测** - 内置 32 种蜡烛图形态（单根 9 / 两根 10 / 三根及以上 13），支持方向、形态、日期窗口筛选，结果与 K 线图联动定位

### 网格交易

- **策略配置** - 等量/等比网格、固定金额/百分比间距、预设模板
- **交易计算** - 开仓计算与持仓调整计算（自动取整到 100 股）
- **网格仿真** - 基于历史日 K 回测，支持 5 种策略（整批清仓、分步减仓、高两格卖出、半仓平衡、阈值全仓），输出总收益、年化收益、最大回撤与操作明细

### 系统能力

- **本地数据库** - better-sqlite3 直连文件，事务提交即持久化；内置版本化迁移框架
- **自动备份** - 每日 15:30 备份，保留最近 3 天；迁移前额外生成快照（保留 5 份）
- **日志系统** - 按自然日分文件，保留 30 天，内置日志查看器与日期切换
- **IPC 入参校验** - 关键写操作与批量查询在 `ipcValidation.ts` 中做运行时校验，失败统一返回 `INVALID_INPUT` 结构
- **版本展示** - 侧边栏显示应用版本与开发环境标识，设置页展示数据库/日志路径

## 技术栈

| 分类 | 技术 |
|------|------|
| 桌面框架 | Electron 35.x |
| 前端框架 | Vue 3（Composition API）+ Pinia 3 |
| 构建工具 | Vite 5.x |
| 语言 | TypeScript 5.x（严格模式） |
| 样式 | SCSS |
| 数据库 | SQLite（better-sqlite3 13.x，WAL） |
| 行情数据 | stock-sdk 1.x |
| 日志 | electron-log 5.x |
| 测试 | Vitest 2.x |
| 打包 | electron-builder 24.x |
| 代码规范 | ESLint + Prettier + commitlint（Conventional Commits） |

## 架构分层

- **主进程（`electron/`）**：窗口与托盘、定时调度（行情轮询、K 线下载、数据库备份）、数据库访问与迁移、IPC 处理与入参校验、系统通知
- **预加载层（`preload/index.ts`）**：通过 `contextBridge` 将窗口、配置、行情、持仓、资金、K 线、日志等 API 安全暴露为 `window.*API`
- **渲染进程（`src/`）**：页面视图、组件、Pinia 状态、图表 composable，只通过预加载层暴露的 API 与主进程通信
- **共享层（`shared/`）**：跨进程类型与 IPC 契约、证券类型识别、纯函数形态识别库（无 fs / electron 依赖，可直接单测）
- **数据层（`sql/migrations/`）**：纯 SQL 迁移脚本，构建时复制到产物目录

## 项目结构

```
├── electron/                    # Electron 主进程
│   ├── services/                # 服务层
│   │   ├── alertService.ts          # 价格告警
│   │   ├── backupService.ts         # 数据库定时/手动备份
│   │   ├── fundService.ts           # 资金明细与盈亏统计
│   │   ├── gridService.ts           # 网格策略计算
│   │   ├── historicalTradeService.ts # 历史开仓周期
│   │   ├── klineDownloadService.ts  # K 线下载与自动增量调度
│   │   ├── logService.ts            # 按日日志、保留窗口、迁移
│   │   ├── priceFetcher.ts          # 行情轮询与指数数据
│   │   └── tradeService.ts          # 交易记账与手续费
│   ├── index.ts                 # 主进程入口（窗口/托盘/IPC/调度）
│   ├── database.ts              # SQLite 访问、事务、迁移前备份
│   ├── sqliteEngine.ts          # better-sqlite3 引擎封装
│   ├── migrations.ts            # 迁移加载与执行（PRAGMA user_version）
│   └── ipcValidation.ts         # IPC 入参校验与通道契约
├── preload/
│   └── index.ts                 # contextBridge 暴露 window.*API（contextIsolation + sandbox）
├── shared/                      # 主/渲染进程共享
│   ├── types/index.ts           # 全局类型、IPC 契约、API 类型
│   ├── utils/securities.ts      # ETF/LOF 等场内基金识别
│   └── patterns/                # 蜡烛图形态识别库
│       ├── single/              # 单根形态（9）
│       ├── double/              # 两根形态（10）
│       ├── triple/              # 三根及以上形态（13）
│       ├── _lib/                # 几何、强度、趋势公共算法
│       ├── registry.ts          # 形态注册表（barrel 自动聚合）
│       └── index.ts             # 公开入口 detectPatterns()
├── src/                         # Vue 渲染进程
│   ├── components/              # 通用组件与图表（K 线、盈亏、资金统计等）
│   ├── composables/             # useKlineChart / useProfitChart / useGridSimulation 等
│   ├── stores/                  # Pinia：watchlist / position / fundManagement /
│   │                            #        historicalTrades / patternScan / logStore
│   ├── utils/                   # 价格格式化、持仓计算、自选股排序
│   ├── views/                   # 9 个页面视图
│   ├── styles/                  # 全局样式
│   ├── App.vue / main.ts / types.ts
├── sql/migrations/              # 数据库迁移脚本（001_init.sql …）
├── scripts/                     # 构建部署、迁移复制、历史数据修补脚本
├── tests/                       # Vitest 测试（unit 为主）
├── specs/                       # 历史功能规格文档（001–016）
├── openspec/                    # OpenSpec 规格驱动文档（specs + changes/archive）
├── dist/                        # 渲染进程构建输出
├── dist-electron/               # 主进程编译输出
└── release/                     # electron-builder 打包输出
```

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发环境（编译主进程 + 启动 Vite + Electron）
npm run dev

# 仅启动 Vite 开发服务器（端口 15173）
npm run dev:vite

# 仅编译主进程并启动 Electron
npm run dev:electron

# 构建生产版本（主进程 + 渲染进程）
npm run build

# 仅构建主进程（复制 SQL 迁移并编译 TS）
npm run build:electron

# 运行单元测试 / 监听模式
npm run test
npm run test:watch

# 代码检查并自动修复
npm run lint

# 类型检查（vue-tsc）
npm run typecheck

# 构建并部署到本机安装目录（Windows）
# 等价于 npm run build + npx electron-builder --win + 同步 release/win-unpacked
npm run deploy

# 仅打包（Windows，输出到 release/win-unpacked）
npx electron-builder --win
```

## 页面说明

| 页面 | 说明 |
|------|------|
| 自选股 | 管理关注的股票，实时价格与涨跌幅、阈值告警、拖拽排序，K 线图与下载入口 |
| 持仓 | 持仓成本与盈亏、交易记录增删改、资金明细联动 |
| 网格 | 网格策略管理，开仓计算与持仓调整计算 |
| 网格仿真 | 基于历史日 K 回测网格策略，展示收益、年化、最大回撤与操作流水 |
| 历史开仓 | 查看已清仓周期的开仓记录与交易统计 |
| 资金管理 | 资金明细记账、资金概览、盈亏统计、年度/月度图表、持仓明细 |
| 形态检测 | 32 种蜡烛图形态扫描，方向/形态/日期筛选，K 线标记与滚动定位 |
| 设置 | 交易时段、轮询间隔、行情源、手动备份、版本与运行环境信息 |
| 日志 | 按自然日查看运行日志，支持日期切换与打开日志目录 |

## 数据与文件位置

| 内容 | 路径 |
|------|------|
| 数据库 | `~/.stockanalyzer/stockanalyzer.db` |
| 每日备份 | `~/.stockanalyzer/stockanalyzer_YYYYMMDD.db`（每日 15:30，保留 3 天） |
| 迁移前快照 | `~/.stockanalyzer/stockanalyzer.db.bak-YYYYMMDD-HHmmss`（保留最近 5 份） |
| 运行日志 | `<userData>/logs/main-YYYY-MM-DD.log`（保留 30 天，含当天） |

数据库包含 `config`、`watchlist_stocks`、`trade_record`、`transfer_records`、`kline_daily`、`kline_weekly`、`kline_monthly` 等表。

## 数据库迁移

- 迁移文件位于 `sql/migrations/`，命名规则 `NNN_name.sql`（如 `001_init.sql`），版本号必须大于 0 且不重复
- 当前版本记录在 SQLite 的 `PRAGMA user_version` 中
- 新库从 0 开始执行全部迁移；**存量库**（无版本记录但已有业务表）自动做基线标记，不重复执行首版脚本
- 迁移前自动生成数据库快照；基线标记与所有待执行迁移处于同一事务，任一步失败整体回滚
- `npm run build:electron` 会通过 `scripts/copy-migrations.mjs` 把 SQL 文件复制到主进程产物目录

## 规格文档与测试

- `specs/`：按编号归档的历史功能规格（001 项目骨架 ~ 016 资金统计）
- `openspec/specs/`：当前生效的能力规格（如 `candlestick-pattern-recognition`、`kline-download`、`grid-trading-simulation`、`database-schema-migration`）
- `openspec/changes/archive/`：已归档的变更提案、设计与任务清单
- `tests/unit/`：58 个测试文件，覆盖数据库与迁移、IPC 校验、资金与盈亏、K 线下载、网格仿真、32 种形态等；`tests/*.test.ts`（2 个）为跨模块集成测试

## 注意事项

- **升级提示**：编辑或删除历史交易记录时，系统会重放该股票的持仓快照链并同步资金明细余额链，历史持仓成本与盈亏数值可能被修正。首次编辑历史记录前建议先手动备份数据库。
- 开发环境下修改 Electron 主进程代码后需要重启应用（`npm run dev` 不热更新主进程）
- 自动 K 线下载仅在交易日 15:10 触发，应用启动时若已过该时刻会补跑当日未完成任务
- 构建前请确保所有代码已保存；打包目标为 Windows 免安装目录（`release/win-unpacked`）
- 数据库引擎为 better-sqlite3（原生模块），升级 Electron 主版本后需执行 `electron-rebuild` 重新编译

## License

MIT
