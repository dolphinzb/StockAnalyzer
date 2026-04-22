# Data Model: 指数状态栏显示

## IndexData

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | 指数代码 (sh000001/sz399001) |
| name | string | Yes | 指数名称 (上证指数/深成指数) |
| price | number | Yes | 当前指数值 |
| change | number | Yes | 涨跌值 (可正可负) |
| changePercent | number | Yes | 涨跌幅百分比 (如 1.25 表示 +1.25%) |
| direction | 'up' \| 'down' \| 'flat' | Yes | 涨跌方向 |
| lastUpdate | string | Yes | ISO 格式最后更新时间 |

### Validation Rules
- `code` 必须是 `sh000001` 或 `sz399001`
- `price` 必须大于 0
- `changePercent` 为 0 时 direction 为 'flat'，正数为 'up'，负数为 'down'

## IndexDataState

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| indices | IndexData[] | Yes | 指数数组 |
| status | 'normal' \| 'error' | Yes | 数据状态 |
| errorMessage | string \| null | No | 错误信息 |
| isLoading | boolean | Yes | 是否正在加载 |

### State Transitions
- `loading` → `normal` (数据获取成功)
- `normal` → `error` (数据获取失败)
- `error` → `normal` (下次获取成功)
- `normal` → `normal` (数据更新)

## Constants

```typescript
const INDEX_CODES = ['sh000001', 'sz399001'];
const INDEX_NAMES: Record<string, string> = {
  'sh000001': '上证指数',
  'sz399001': '深成指数'
};
```
