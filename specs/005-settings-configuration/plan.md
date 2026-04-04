# Implementation Plan: 设置页面配置功能

**Branch**: `feature/005-settings-configuration` | **Date**: 2026-04-04 | **Spec**: [spec.md](file:///c:/WebProjects/StockAnalyzer/specs/005-settings-configuration/spec.md)
**Input**: Feature specification from `/specs/005-settings-configuration/spec.md` + Clarifications

## Summary

实现设置页面配置功能，包括交易时间段设置、轮询间隔设置、API设置，使用 SQLite 数据库持久化配置，数据库文件位于 `~/.stockanalyzer/stockanalyzer.db`。

## Technical Context

**Language/Version**: TypeScript 5.x (严格模式)
**Primary Dependencies**: Electron 28.x, Vite 5.x, Vue 3.4+, TypeScript 5.x, sql.js
**Storage**: SQLite 数据库 (sql.js)，位于 `~/.stockanalyzer/stockanalyzer.db`
**Testing**: 手动验证 + ESLint 检查
**Target Platform**: Windows 10/11 (x64)
**Project Type**: 桌面应用 (Electron)

## Project Structure

```text
c:\WebProjects\StockAnalyzer\
├── electron/
│   ├── index.ts                  # [修改] 添加 IPC handler
│   ├── config.ts                # [删除] INI 配置管理模块
│   └── database.ts              # [新建] SQLite 数据库管理模块
├── src/
│   ├── views/
│   │   └── SettingsView.vue     # [修改] 实现完整UI
│   └── composables/
│       └── useConfig.ts         # [修改] 配置组合式函数
├── preload/
│   └── index.ts                 # [修改] 暴露配置 API
└── shared/
    └── types/
        └── index.ts             # [修改] 添加 AppConfig 类型
```

## Data Model

### AppConfig 接口

```typescript
interface AppConfig {
  trading: {
    morningStart: string;   // "09:30"
    morningEnd: string;     // "11:30"
    afternoonStart: string; // "13:00"
    afternoonEnd: string;   // "15:00"
  };
  polling: {
    interval: number;       // 1-30 分钟
  };
  api: {
    provider: 'sina' | 'eastmoney' | 'tencent';
    url: string;            // API 地址
  };
}
```

### DefaultConfig

```typescript
const DEFAULT_CONFIG: AppConfig = {
  trading: {
    morningStart: "09:30",
    morningEnd: "11:30",
    afternoonStart: "13:00",
    afternoonEnd: "15:00",
  },
  polling: {
    interval: 1,
  },
  api: {
    provider: "sina",
    url: "https://hq.sinajs.cn/list=",
  },
};
```

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
  trade_price REAL DEFAULT NULL,       -- 成交价格
  trade_count INTEGER DEFAULT NULL,    -- 成交数量
  holding_count INTEGER DEFAULT NULL,   -- 持仓数量
  holding_price REAL DEFAULT NULL      -- 持仓价格/成本价
);
```

### 数据库路径

```typescript
import { join } from 'path';
import { app } from 'electron';

function getDatabasePath(): string {
  return join(app.getPath('home'), '.stockanalyzer', 'stockanalyzer.db');
}
```

## IPC 接口设计

| IPC Channel | Direction | Payload | Response | Description |
|-------------|-----------|---------|----------|-------------|
| config:get | Renderer -> Main | none | AppConfig | 获取当前配置 |
| config:set | Renderer -> Main | AppConfig | boolean | 保存配置 |

## Implementation Phases

### Phase 1: 数据库管理模块 (electron/database.ts)

1. 安装 sql.js 依赖
2. 实现 getDatabasePath() 获取数据库路径
3. 实现 initDatabase() 初始化数据库表
4. 实现 loadConfig() 从数据库加载配置
5. 实现 saveConfig(config) 保存配置到数据库
6. 实现 getDefaultConfig() 获取默认配置

### Phase 2: IPC 接口 (electron/index.ts)

1. 导入 database 模块
2. 注册 config:get handler
3. 注册 config:set handler
4. 在 app.whenReady() 中调用 initDatabase() 和 loadConfig()

### Phase 3: Preload API (preload/index.ts)

1. 导入 AppConfig 类型
2. 暴露 getConfig() 方法
3. 暴露 setConfig(config) 方法

### Phase 4: 前端配置组合式函数 (src/composables/useConfig.ts)

1. 创建 useConfig() 组合式函数
2. 提供 reactive config 状态
3. 提供 loadConfig() 方法
4. 提供 saveConfig(config) 方法

### Phase 5: 设置页面 UI (src/views/SettingsView.vue)

1. 交易时间段表单（使用 `<input type="time">`）
2. 轮询间隔表单（数字输入，范围 1-30）
3. API 选择下拉框（sina/eastmoney/tencent）
4. 保存按钮 + 重置按钮
5. 表单验证逻辑
6. 成功/失败提示

## Edge Cases & Error Handling

| 场景 | 处理方式 |
|------|----------|
| 数据库不存在 | 初始化数据库，创建表，插入默认配置 |
| 数据库损坏 | 使用默认配置，记录错误日志 |
| 保存失败 | 返回 false，前端显示错误提示 |
| 无效时间格式 | HTML5 input type="time" 原生验证 |
| 轮询间隔超出范围 | 前端表单验证拒绝 (1-30) |
| 保存成功后 | 显示成功提示 |
| 重置 | 恢复为默认配置 |

## API Provider Options

```typescript
const API_PROVIDERS = [
  { value: 'sina', label: '新浪采集API', defaultUrl: 'https://hq.sinajs.cn/list=' },
  { value: 'eastmoney', label: '东方财富API', defaultUrl: 'https://push2.eastmoney.com/api/qt/stock/get' },
  { value: 'tencent', label: '腾讯API', defaultUrl: 'https://web.sqt.gtimg.cn/q=' },
];
```

## Complexity Tracking

| 指标 | 值 | 说明 |
|------|-----|------|
| 新增文件数 | 1 | database.ts |
| 修改文件数 | 4 | electron/index.ts, preload/index.ts, SettingsView.vue, useConfig.ts |
| 删除文件数 | 1 | config.ts (INI 管理模块) |
| 新增依赖 | 1 | sql.js |
| 复杂度评估 | 低 | 简单的 CRUD 操作和表单验证 |
