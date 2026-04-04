# Task List: 设置页面配置功能

**Branch**: `feature/005-settings-configuration`
**Date**: 2026-04-04
**Spec**: [spec.md](../005-settings-configuration/spec.md)
**Plan**: [plan.md](../005-settings-configuration/plan.md)

## Task Summary

| # | Task | Status | Dependencies |
|---|------|--------|--------------|
| 1 | 在 shared/types/index.ts 添加 AppConfig 类型定义 | ✅ completed | - |
| 2 | 创建 electron/database.ts SQLite 数据库管理模块 | 🔄 in_progress | Task 1 |
| 3 | 在 electron/index.ts 注册 IPC handlers | ⏳ pending | Task 2 |
| 4 | 在 preload/index.ts 暴露配置 API | ⏳ pending | Task 3 |
| 5 | 修改 src/composables/useConfig.ts | ⏳ pending | Task 4 |
| 6 | 实现 SettingsView.vue 设置页面UI | ⏳ pending | Task 5 |
| 7 | 删除 electron/config.ts INI 配置管理模块 | ⏳ pending | Task 2 |
| 8 | 运行 lint 和 typecheck 验证 | ⏳ pending | Task 7 |

---

## Detailed Tasks

### Task 1: 在 shared/types/index.ts 添加 AppConfig 类型定义

**File**: `shared/types/index.ts`

**Description**:
添加 AppConfig、TradingConfig、PollingConfig、ApiConfig 接口定义，以及 API Provider 常量。

**Acceptance Criteria**:
- [x] TradingConfig 接口包含 morningStart, morningEnd, afternoonStart, afternoonEnd
- [x] PollingConfig 接口包含 interval
- [x] ApiConfig 接口包含 provider 和 url
- [x] AppConfig 接口包含 trading, polling, api
- [x] ConfigAPI 接口定义 getConfig, setConfig 方法
- [x] IPC_CHANNELS 添加 CONFIG_GET, CONFIG_SET
- [x] Window 接口添加 configAPI

---

### Task 2: 创建 electron/database.ts SQLite 数据库管理模块

**File**: `electron/database.ts` (新建)

**Description**:
创建 SQLite 数据库管理模块，使用 sql.js 实现配置的存储和读取。

**Acceptance Criteria**:
- [x] 安装 sql.js 依赖
- [ ] 实现 getDatabasePath() 返回 `~/.stockanalyzer/stockanalyzer.db`
- [ ] 实现 initDatabase() 创建数据库表（config, trade_record）
- [ ] 实现 loadConfig() 从数据库加载配置
- [ ] 实现 saveConfig(config) 保存配置到数据库
- [ ] 数据库不存在时自动初始化并插入默认配置
- [ ] 数据库损坏时回退到默认配置并记录错误日志

**数据库表结构**:
```sql
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS trade_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_code TEXT DEFAULT NULL,
  stock_name TEXT DEFAULT NULL,
  trade_date TEXT DEFAULT NULL,
  trade_type TEXT DEFAULT NULL,
  trade_price REAL DEFAULT NULL,
  trade_count INTEGER DEFAULT NULL,
  holding_count INTEGER DEFAULT NULL,
  holding_price REAL DEFAULT NULL
);
```

---

### Task 3: 在 electron/index.ts 注册 IPC handlers

**File**: `electron/index.ts` (修改)

**Description**:
添加配置相关的 IPC 处理函数，在应用启动时初始化数据库并加载配置。

**Acceptance Criteria**:
- [ ] 导入 database 模块的 initDatabase, loadConfig, saveConfig
- [ ] 注册 config:get handler 返回当前配置
- [ ] 注册 config:set handler 保存配置
- [ ] 在 app.whenReady() 中调用 initDatabase() 和 loadConfig()

---

### Task 4: 在 preload/index.ts 暴露配置 API

**File**: `preload/index.ts` (修改)

**Description**:
通过 contextBridge 暴露配置相关的 IPC 调用接口。

**Acceptance Criteria**:
- [x] 导入 AppConfig 类型
- [x] 创建 configAPI 对象
- [x] 暴露 getConfig() 方法调用 config:get
- [x] 暴露 setConfig(config) 方法调用 config:set
- [x] 使用 contextBridge.exposeInMainWorld 暴露 configAPI

---

### Task 5: 修改 src/composables/useConfig.ts

**File**: `src/composables/useConfig.ts` (修改)

**Description**:
修改配置组合式函数，确保 Vue 响应式对象通过 IPC 传递时序列化为普通对象。

**Acceptance Criteria**:
- [x] 返回 reactive 的 config 对象
- [x] 提供 loadConfig() 方法加载配置
- [x] 提供 saveConfig(config) 方法保存配置
- [x] 使用 JSON.parse(JSON.stringify()) 将响应式对象转为普通对象
- [x] 提供 API_PROVIDERS 常量（包含 defaultUrl）
- [x] 提供 resetToDefault() 方法重置为默认配置

---

### Task 6: 实现 SettingsView.vue 设置页面UI

**File**: `src/views/SettingsView.vue` (修改)

**Description**:
实现完整的设置页面表单界面，包括交易时间段、轮询间隔、API设置。

**Acceptance Criteria**:
- [x] 使用 useConfig() 获取配置状态
- [x] 交易时间段使用 `<input type="time">` (4个输入框)
- [x] 轮询间隔使用 `<input type="number">` (min=1, max=30)
- [x] API 选择使用 `<select>` 下拉框
- [x] API URL 使用 `<input type="text">` 显示/编辑
- [x] 切换 API Provider 时自动填充对应的默认 URL
- [x] 保存按钮调用 saveConfig()
- [x] 重置按钮调用 resetToDefault()
- [x] 保存成功后显示提示
- [x] 保存失败后显示错误提示
- [x] 表单布局美观清晰

---

### Task 7: 删除 electron/config.ts INI 配置管理模块

**File**: `electron/config.ts` (删除)

**Description**:
删除原有的 INI 配置文件管理模块，不再使用。

**Acceptance Criteria**:
- [ ] 删除 electron/config.ts 文件
- [ ] 确保无其他代码引用 config.ts

---

### Task 8: 运行 lint 和 typecheck 验证

**Command**: `npm run lint` and `npm run typecheck`

**Description**:
运行代码检查工具确保代码质量。

**Acceptance Criteria**:
- [ ] ESLint 检查无错误
- [ ] TypeScript 类型检查无错误
- [ ] 所有新增代码符合项目规范

---

## Verification Steps

1. 运行 `npm run lint` 确保无 ESLint 错误
2. 运行 `npm run typecheck` 确保无 TypeScript 错误
3. 运行 `npm run dev` 启动开发服务器
4. 打开设置页面，验证默认配置显示正确
5. 修改配置后点击保存，验证成功提示
6. 检查 `~/.stockanalyzer/stockanalyzer.db` 数据库存在
7. 重启应用，验证配置已持久化
8. 点击重置按钮，验证恢复为默认配置
9. 删除数据库文件，重启应用，验证初始化默认配置
