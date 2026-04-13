# Data Model: 设置页面配置功能

**Branch**: `feature/005-settings-configuration`
**Date**: 2026-04-04

## Configuration Entity

### AppConfig

应用配置主实体，包含所有可配置项。

```typescript
interface TradingConfig {
  morningStart: string;   // 上午开始时间，格式 "HH:mm"
  morningEnd: string;     // 上午结束时间，格式 "HH:mm"
  afternoonStart: string; // 下午开始时间，格式 "HH:mm"
  afternoonEnd: string;   // 下午结束时间，格式 "HH:mm"
}

interface PollingConfig {
  interval: number;       // 轮询间隔（分钟），范围 1-30
}

interface ApiConfig {
  provider: 'sina' | 'eastmoney' | 'tencent';
  url: string;
}

interface AppConfig {
  trading: TradingConfig;
  polling: PollingConfig;
  api: ApiConfig;
}
```

### Default Values

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

## Configuration File Format

### config.ini

INI 文件格式，包含三个节（Section）。

```ini
[Trading]
MorningStart=09:30
MorningEnd=11:30
AfternoonStart=13:00
AfternoonEnd=15:00

[Polling]
Interval=1

[API]
Provider=sina
Url=https://hq.sinajs.cn/list=
```

### Field Mapping

| INI Field | Type | Validation | Default |
|-----------|------|------------|---------|
| Trading.MorningStart | string | HH:mm 格式，00:00-23:59 | "09:30" |
| Trading.MorningEnd | string | HH:mm 格式，00:00-23:59 | "11:30" |
| Trading.AfternoonStart | string | HH:mm 格式，00:00-23:59 | "13:00" |
| Trading.AfternoonEnd | string | HH:mm 格式，00:00-23:59 | "15:00" |
| Polling.Interval | number | 整数 1-30 | 1 |
| API.Provider | string | "sina" \| "eastmoney" \| "tencent" | "sina" |
| API.Url | string | 有效 URL | "https://hq.sinajs.cn/list=" |

## API Provider Options

```typescript
interface ApiProviderOption {
  value: string;
  label: string;
  defaultUrl: string;
}

const API_PROVIDERS: ApiProviderOption[] = [
  { value: "sina", label: "新浪财经API", defaultUrl: "https://hq.sinajs.cn/list=" },
  { value: "eastmoney", label: "东方财富API", defaultUrl: "https://push2.eastmoney.com/api/qt/stock/get" },
  { value: "tencent", label: "腾讯API", defaultUrl: "https://web.sqt.gtimg.cn/q=" },
];
```

## Validation Rules

### Trading Time Validation

- 时间格式必须为 `HH:mm`（24小时制）
- 小时范围：00-23
- 分钟范围：00-59
- 开始时间必须早于结束时间
- 上午时间段：morningStart < morningEnd
- 下午时间段：afternoonStart < afternoonEnd

### Polling Interval Validation

- 必须为整数
- 范围：1 <= interval <= 30
- 单位：分钟

### API Provider Validation

- 必须是预定义的 provider 之一
- 有效值："sina", "eastmoney", "tencent"

## File Location

配置文件路径：`~/.stockanalyzer/config.ini`

```typescript
import { join } from 'path';
import { app } from 'electron';

function getConfigPath(): string {
  return join(app.getPath('home'), '.stockanalyzer', 'config.ini');
}
```