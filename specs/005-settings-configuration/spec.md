# Feature Specification: 设置页面配置功能

**Feature Branch**: `feature/005-settings-configuration`
**Created**: 2026-04-04
**Status**: Draft
**Input**: 用户描述: "实现设置页面。设置如下内容：交易时间段的设置，包括上午（默认9:30-11:30）下午（13:00-15:00）；轮询间隔设置（默认1分钟），可设置为1-30分钟之间的整数；查询API的设置，默认使用新浪财经API；使用SQLite数据库来保存配置内容；每次软件启动时，从数据库加载配置，首次启动时，如果数据库不存在，则初始化数据库并插入默认配置。"

## Clarifications

### Session 2026-04-04

- Q: 数据库目录位置如何处理 Electron 打包后的安全限制？ → A: 使用用户目录下的 `.stockanalyzer` 目录（`~/.stockanalyzer/stockanalyzer.db`），确保跨环境一致的写入权限
- Q: API Provider 需要支持哪些选项？ → A: 新浪、东方财富、腾讯（三大主流免费股票API）
- Q: 重置功能应该重置到什么状态？ → A: 重置为默认配置（清空所有自定义设置）
- Q: 时间输入使用什么UI交互方式？ → A: HTML5 `<input type="time">` 原生时间选择器
- Q: 保存成功后的交互如何处理？ → A: 保存成功后显示成功提示，并提示用户重启应用
- Q: API 配置需要保存哪些信息？ → A: 需要保存 provider（提供商）和 url（API地址），切换 provider 时自动填充对应的默认 url

## User Scenarios & Testing

### User Story 1 - 用户配置交易时间段 (Priority: P1)

作为用户，我希望能够设置股票交易的上午和下午时间段，以便软件只在交易时间内进行数据采集。

**Independent Test**: 在设置页面修改交易时间段后，保存并重启应用，验证配置是否正确持久化。

**Acceptance Scenarios**:

1. **Given** 用户打开设置页面，**When** 查看交易时间段设置，**Then** 默认显示上午 9:30-11:30，下午 13:00-15:00
2. **Given** 用户修改上午开始时间为 9:00，**When** 保存设置并重启应用，**Then** 配置文件中上午开始时间更新为 9:00
3. **Given** 用户输入无效时间格式，**When** 尝试保存，**Then** 显示错误提示，配置不被保存

### User Story 2 - 用户配置轮询间隔 (Priority: P1)

作为用户，我希望能够设置数据轮询间隔，以便控制软件查询股票的频率。

**Independent Test**: 在设置页面修改轮询间隔后，验证配置是否生效。

**Acceptance Scenarios**:

1. **Given** 用户打开设置页面，**When** 查看轮询间隔设置，**Then** 默认显示 1 分钟
2. **Given** 用户修改轮询间隔为 5 分钟，**When** 保存设置并重启应用，**Then** 配置文件中轮询间隔更新为 5
3. **Given** 用户输入 0 或 31，**When** 尝试保存，**Then** 显示错误提示，配置不被保存

### User Story 3 - 用户配置查询API (Priority: P1)

作为用户，我希望能够选择不同的股票数据查询API，以便根据可用性选择数据源。

**Independent Test**: 在设置页面修改API设置后，验证配置是否正确持久化。

**Acceptance Scenarios**:

1. **Given** 用户打开设置页面，**When** 查看API设置，**Then** 默认选择新浪财经API
2. **Given** 用户选择其他API选项，**When** 保存设置并重启应用，**Then** 配置文件中API设置正确更新

### User Story 4 - 配置持久化 (Priority: P1)

作为用户，我希望配置能够持久保存，以便每次启动应用时自动加载上次保存的设置。

**Independent Test**: 配置保存后重启应用，检查配置是否自动加载。

**Acceptance Scenarios**:

1. **Given** 用户首次启动应用（无数据库），**When** 应用启动，**Then** 初始化数据库并插入默认配置
2. **Given** 用户已配置并保存设置，**When** 重启应用，**Then** 自动从数据库加载配置
3. **Given** 数据库文件损坏，**When** 应用启动，**Then** 回退到默认配置并记录错误日志

### User Story 5 - 配置目录位置 (Priority: P1)

作为用户，我希望数据库文件位于用户目录，便于数据管理。

**Independent Test**: 检查数据库文件是否在正确位置。

**Acceptance Scenarios**:

1. **Given** 应用已正常运行，**When** 检查文件系统，**Then** 数据库位于 `~/.stockanalyzer/stockanalyzer.db`
2. **Given** 在打包环境下运行，**When** 检查数据库位置，**Then** 数据库位于用户数据目录

## Requirements

### Functional Requirements

- **FR-001**: 设置页面必须包含交易时间段设置（上午开始时间、上午结束时间、下午开始时间、下午结束时间）
- **FR-002**: 上午默认时间段为 9:30-11:30，下午默认时间段为 13:00-15:00
- **FR-003**: 轮询间隔设置必须为 1-30 分钟的整数，默认值为 1 分钟
- **FR-004**: API设置必须支持选择不同的采集API，默认使用新浪财经API
- **FR-005**: 配置数据使用 SQLite 数据库存储
- **FR-006**: 数据库文件位于用户目录 `~/.stockanalyzer/stockanalyzer.db`
- **FR-007**: 应用启动时必须自动从数据库加载配置
- **FR-008**: 首次启动时，如果数据库不存在，必须初始化数据库并插入默认配置
- **FR-009**: 设置页面必须提供保存和重置功能

### Key Entities

- **AppConfig**: 应用配置实体
  - trading: TradingConfig
    - morningStart: string (默认 "09:30")
    - morningEnd: string (默认 "11:30")
    - afternoonStart: string (默认 "13:00")
    - afternoonEnd: string (默认 "15:00")
  - polling: PollingConfig
    - interval: number (默认 1, 范围 1-30)
  - api: ApiConfig
    - provider: string (默认 "sina"，可选值: "sina" | "eastmoney" | "tencent")
    - url: string (默认新浪API地址)

- **ConfigService**: 配置服务
  - loadConfig(): AppConfig - 从文件加载配置
  - saveConfig(config: AppConfig): boolean - 保存配置到文件
  - getDefaultConfig(): AppConfig - 获取默认配置

### 数据库配置存储

配置以 JSON 格式存储在 SQLite 的 config 表中：

| key | value (JSON) |
|-----|--------------|
| app_config | {"trading":{...},"polling":{...},"api":{...}} |

**默认配置示例：**
```json
{
  "trading": {
    "morningStart": "09:30",
    "morningEnd": "11:30",
    "afternoonStart": "13:00",
    "afternoonEnd": "15:00"
  },
  "polling": {
    "interval": 1
  },
  "api": {
    "provider": "sina",
    "url": "https://hq.sinajs.cn/list="
  }
}
```

## Technical Approach

- **Frontend**: Vue 3 Composition API + TypeScript
- **Backend**: Electron Main Process
- **Database**: sql.js (纯 JavaScript SQLite 实现)
  - 无需编译，跨平台兼容
  - 数据存储在 `~/.stockanalyzer/stockanalyzer.db`
  - 支持 SQL 查询、事务
- **IPC Communication**: Electron IPC for database operations
- **Data Flow**: SettingsView -> IPC -> Main Process -> SQLite Database

### 数据库表结构

```sql
-- 应用配置表
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER
);

-- 交易记录表
CREATE TABLE IF NOT EXISTS trade_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT DEFAULT NULL,
  stock_name TEXT DEFAULT NULL,
  trade_date TEXT DEFAULT NULL,
  trade_type TEXT DEFAULT NULL,        -- 'buy' | 'sell'
  trade_price REAL DEFAULT NULL,        -- 成交价格
  trade_count INTEGER DEFAULT NULL,     -- 成交数量
  holding_count INTEGER DEFAULT NULL,   -- 持仓数量
  holding_price REAL DEFAULT NULL       -- 持仓价格/成本价
);

## Technical Approach