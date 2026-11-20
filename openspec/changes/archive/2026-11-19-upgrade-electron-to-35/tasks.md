## 1. 依赖升级

- [x] 1.1 `package.json` 中 `electron` 由 `^28.2.10` 改为 `^35.7.5`，重装依赖并用 `npx electron -v` 确认版本（实测输出 `v35.7.5`）
- [x] 1.2 确认无需其它运行时依赖变更（`sql.js` 等保持不变，未引入 better-sqlite3）

## 2. 构建与开发模式验证

- [x] 2.1 `npm run build:electron` 通过
- [x] 2.2 `npm run dev` 启动：窗口显示、K 线图表加载、关闭窗口隐藏到托盘、托盘菜单「显示窗口/退出」可用（人工验证通过）
- [x] 2.3 `npm run test`（59 文件 / 361 用例）与 `npm run typecheck` 通过
- [x] 2.4 确认数据库路径仍为 `~/.stockanalyzer/stockanalyzer.db`、日志仍写入 `%APPDATA%\stockanalyzer\logs\`（人工验证通过）
- [x] 2.5 记录是否复现「托盘退出后进程残留」（人工验证完成；该缺陷仍按独立事项跟踪）

## 3. 打包与安装验证

- [x] 3.1 现有 `electron-builder@24.13.3` 直接打包 Electron 35 成功：`release/win-unpacked` 73 个文件，`StockAnalyzer.exe` 201,310,208 字节
- [x] 3.2 无需升级 electron-builder（3.1 已通过，`files`/`asarUnpack` 配置与 deploy 脚本未改动）
- [x] 3.3 `npm run deploy` 成功，安装目录 73 个文件与 `release/win-unpacked` 一致，exe 已更新
- [x] 3.4 安装版冒烟：窗口、图表、手动单只下载、手动批量下载（含进度事件）、备份失败通知、托盘退出（人工验证通过）
- [x] 3.5 记录升级前后体积与启动表现：exe 176,890,368 → 201,310,208 字节（+13.8%），启动耗时无明显劣化

## 4. 收尾

- [x] 4.1 在 `migrate-to-sqlite-engine` 的 design D1 回填「Electron 35 已验证」，并解锁该 change 的任务 0.7
- [x] 4.2 归档时同步 `desktop-runtime` 主规格
