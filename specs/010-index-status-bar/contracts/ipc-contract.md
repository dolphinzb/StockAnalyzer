# IPC Contracts: 指数状态栏显示

## IPC 通道

### 新增通道

#### index:update

**方向**: 主进程 → 渲染进程  
**描述**: 推送指数数据更新

```typescript
interface IndexUpdateMessage {
  indices: IndexData[];
  status: 'normal' | 'error';
  errorMessage?: string;
  timestamp: string;
}
```

**Payload**:
- `indices`: 指数数据数组
- `status`: 数据状态（normal/error）
- `errorMessage`: 错误信息（仅status为error时）
- `timestamp`: ISO格式时间戳

### 修改通道

#### prices:update

**方向**: 主进程 → 渲染进程  
**描述**: 扩展现有通道，包含指数数据

```typescript
interface PricesUpdateMessage {
  stocks: StockData[];
  indices?: IndexData[];  // 新增字段
  status: 'normal' | 'error';
  errorMessage?: string;
  timestamp: string;
}
```

## 数据类型

### IndexData

```typescript
interface IndexData {
  code: string;           // 指数代码 (sh000001/sz399001)
  name: string;           // 指数名称 (上证指数/深成指数)
  price: number;          // 当前指数值
  change: number;         // 涨跌值
  changePercent: number;  // 涨跌幅百分比
  direction: 'up' | 'down' | 'flat';  // 涨跌方向
  lastUpdate: string;     // ISO格式最后更新时间
}
```
