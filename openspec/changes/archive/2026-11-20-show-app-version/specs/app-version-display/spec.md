## ADDED Requirements

### Requirement: 侧边栏常驻显示版本号

应用 SHALL 在左侧导航底部常驻显示当前版本号，格式为 `v<version>`；开发模式（未打包运行）下 SHALL 追加 `(dev)` 标识。该信息 MUST NOT 需要用户点击或进入任何页面即可看到。

#### Scenario: 安装版启动
- **WHEN** 用户启动安装版应用
- **THEN** 左侧导航底部显示形如 `v2.0.0` 的版本号，不显示 `(dev)`

#### Scenario: 开发模式启动
- **WHEN** 以 `npm run dev` 启动应用
- **THEN** 左侧导航底部显示形如 `v2.0.0 (dev)` 的版本号

#### Scenario: 侧边栏高度受限
- **WHEN** 窗口高度较小导致导航项超出可用高度
- **THEN** 版本号仍固定显示在底部，不被导航项挤出可视区域

### Requirement: 设置页提供运行环境信息

设置页 SHALL 提供「关于」区域，集中展示当前版本号、数据库文件绝对路径与日志目录绝对路径，并提供打开日志目录与打开数据库目录的操作入口。

#### Scenario: 查看关于信息
- **WHEN** 用户打开设置页并滚动到「关于」区域
- **THEN** 可看到版本号、数据库文件路径与日志目录路径，路径为绝对路径

#### Scenario: 打开日志目录
- **WHEN** 用户点击「打开日志目录」
- **THEN** 系统打开文件管理器并定位到日志目录

#### Scenario: 打开数据库目录
- **WHEN** 用户点击「打开数据库目录」
- **THEN** 系统打开文件管理器并定位到数据库文件所在的目录（`<home>\.stockanalyzer`）

#### Scenario: 打开目录失败
- **WHEN** 主进程返回 `{ success: false }` 或调用抛错（日志目录或数据库目录任一）
- **THEN** 界面以提示（toast）说明失败的原因与目标，MUST NOT 静默失败

#### Scenario: 路径过长
- **WHEN** 数据库或日志路径长度超出容器宽度
- **THEN** 路径文本不撑破布局（换行或省略），且完整路径仍可通过悬停查看

### Requirement: 版本号来源唯一

界面显示的版本号 SHALL 来自主进程的 `app.getVersion()`（即 `package.json` 的 `version`）。渲染进程 MUST NOT 硬编码版本字符串，也 MUST NOT 自行读取 `package.json`。

#### Scenario: 修改版本号
- **WHEN** 仅修改 `package.json` 的 `version` 并重新构建
- **THEN** 侧边栏与设置页显示的版本同步变化，无需改动任何界面代码

#### Scenario: 版本信息获取失败
- **WHEN** 渲染进程调用 `app:info` 失败（接口抛错或返回异常数据）
- **THEN** 侧边栏不显示版本号，设置页「关于」区整体降级为占位或隐藏；两处各自独立降级、互不依赖，且不影响其它功能
