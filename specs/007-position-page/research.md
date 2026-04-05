# Research: 持仓页面

**Created**: 2026-04-04
**Feature**: 007-position-page

## 1. 股票持仓价格计算逻辑

### 1.1 交易费率常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| TRADE_FEE_RATE | 0.0003 | 交易费率 0.03% |
| MIN_FEE | 5 | 最低手续费 5 元 |
| HUATAI_OTHER_FEE_RATE | 0.00002 | 华泰其他费率 0.002% |
| SHENZHEN_STAMP_TAX_RATE | 0.001 | 深交所印花税率 0.1% |
| SHANGHAI_STAMP_TAX_RATE | 0.001 | 上交所印花税率 0.1% |

### 1.2 计算公式

**前提条件**：
- 当 holding_count = 0 时，holding_price = 0

**股息/分红**：
```
holding_price = pre_holding_price - trade_price
holding_count = pre_holding_count (不变)
```

**买入**：
```
trade_fee = trade_count * trade_price * TRADE_FEE_RATE
trade_fee = max(trade_fee, MIN_FEE)  // 最低5元
hua_tai_fee = trade_count * trade_price * HUATAI_OTHER_FEE_RATE

holding_price = round((pre_holding_count * pre_holding_price
                      + trade_count * trade_price
                      + trade_fee + hua_tai_fee) * 1000
                      / (pre_holding_count + trade_count)) / 1000
holding_count = pre_holding_count + trade_count
```

**卖出（深圳）**：
```
trade_fee = trade_count * trade_price * TRADE_FEE_RATE
trade_fee = max(trade_fee, MIN_FEE)
hua_tai_fee = trade_count * trade_price * HUATAI_OTHER_FEE_RATE
tax = -trade_count * trade_price * SHENZHEN_STAMP_TAX_RATE

holding_price = round((pre_holding_count * pre_holding_price
                      + trade_count * trade_price
                      + trade_fee + tax + hua_tai_fee) * 1000
                      / (pre_holding_count + trade_count)) / 1000
holding_count = pre_holding_count - trade_count
```

**卖出（上海）**：
```
trade_fee = trade_count * trade_price * TRADE_FEE_RATE
trade_fee = max(trade_fee, MIN_FEE)
hua_tai_fee = trade_count * trade_price * HUATAI_OTHER_FEE_RATE
tax = -trade_count * trade_price * SHANGHAI_STAMP_TAX_RATE

holding_price = round((pre_holding_count * pre_holding_price
                      + trade_count * trade_price
                      + trade_fee + tax + hua_tai_fee) * 1000
                      / (pre_holding_count + trade_count)) / 1000
holding_count = pre_holding_count - trade_count
```

**卖出（北交所）**：暂不支持

### 1.3 交易所判断

```typescript
function getExchange(stockCode: string): 'SHANGHAI' | 'SHENZHEN' | 'BEIJING' {
  if (stockCode.startsWith('sh') || stockCode.startsWith('sz') || stockCode.startsWith('bj')) {
    // 已有前缀
    if (stockCode.startsWith('sh')) return 'SHANGHAI';
    if (stockCode.startsWith('sz')) return 'SHENZHEN';
    if (stockCode.startsWith('bj')) return 'BEIJING';
  }
  // 无前缀判断
  if (stockCode.startsWith('6') || stockCode.startsWith('5')) return 'SHANGHAI';
  if (stockCode.startsWith('0') || stockCode.startsWith('1') || stockCode.startsWith('3')) return 'SHENZHEN';
  if (stockCode.startsWith('8') || stockCode.startsWith('4')) return 'BEIJING';
  return 'SHENZHEN'; // 默认
}
```

## 2. 交易记录查询逻辑

### 2.1 获取持仓列表

查询当前有持仓的股票（holding_count > 0）：

```sql
SELECT stock_code, stock_name, holding_count, holding_price, trade_date
FROM trade_record
WHERE holding_count > 0
GROUP BY stock_code
HAVING trade_date = MAX(trade_date)
```

### 2.2 获取交易记录（点击某股票时）

1. 先查询该股票上次 holding_count = 0 的记录时间
```sql
SELECT trade_date FROM trade_record
WHERE stock_code = ? AND holding_count = 0
ORDER BY trade_date DESC LIMIT 1
```

2. 如果存在，查询该时间之后的记录
```sql
SELECT * FROM trade_record
WHERE stock_code = ? AND trade_date >= ?
ORDER BY trade_date DESC
```

3. 如果不存在，查询所有记录
```sql
SELECT * FROM trade_record
WHERE stock_code = ?
ORDER BY trade_date DESC
```

### 2.3 日期显示

- 数据库存储：精确到秒（如 `2026-04-04T10:30:00`）
- 页面展示：只显示到天（如 `2026-04-04`）

## 3. 数据流向

```
用户输入交易信息
       ↓
TradeEditor.vue
       ↓
IPC: position:add-record
       ↓
electron/index.ts (IPC Handler)
       ↓
tradeService.ts (计算逻辑)
       ↓
database.ts (更新 trade_record)
       ↓
返回结果给 renderer
       ↓
PositionStore 更新状态
       ↓
PositionView 刷新列表
```

## 4. 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 北交所计算 | 暂不支持 | 参考代码中未实现 |
| 默认交易所 | 深圳 | 代码中有 else 分支默认处理 |
| 精度处理 | 保留3位小数 | 参考代码中 `Math.round(*1000)/1000` |