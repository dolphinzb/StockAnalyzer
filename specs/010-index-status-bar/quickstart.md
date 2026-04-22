# Quickstart: 指数状态栏显示

## 开发步骤

### Step 1: 修改类型定义

**文件**: `shared/types/index.ts`

新增 `IndexData` 和 `IndexDataState` 类型，以及 IPC 通道常量 `INDEX_UPDATE`。

### Step 2: 修改价格获取服务

**文件**: `electron/services/priceFetcher.ts`

1. 定义指数代码常量:
   ```typescript
   const INDEX_CODES = ['sh000001', 'sz399001'];
   ```

2. 修改 `fetchStockPrices` 函数，在批量获取时包含指数代码

3. 新增 `sendIndexUpdate` 函数，通过 IPC 推送指数数据

### Step 3: 修改主进程入口

**文件**: `electron/index.ts`

1. 注册 `index:update` IPC 通道处理器
2. 扩展 `prices:update` 通道，包含指数数据

### Step 4: 创建指数数据状态管理

**文件**: `src/composables/useIndexData.ts`

1. 创建 composable 管理指数数据状态
2. 监听 `index:update` IPC 事件
3. 提供响应式数据供组件使用

### Step 5: 创建指数状态栏组件

**文件**: `src/components/IndexStatusBar.vue`

1. 固定高度 30px
2. 左右分布布局：左侧上证指数，右侧深成指数
3. 颜色规则：
   - 上涨：红色 (#ff0000)
   - 下跌：绿色 (#00ff00)
   - 持平：黑色 (#000000)
4. 箭头显示：
   - 上涨：↑
   - 下跌：↓
   - 持平：无箭头
5. 字体自适应：使用 CSS clamp()
6. 首次加载显示占位符 "--"
7. 错误状态显示"数据更新失败"提示

### Step 6: 集成到自选股页面

**文件**: `src/views/WatchlistView.vue`

1. 在页面底部添加 `IndexStatusBar` 组件
2. 确保手动刷新时触发指数数据更新

### Step 7: 测试验证

1. 启动应用，验证状态栏显示占位符
2. 等待首次数据获取，验证指数数据显示
3. 验证颜色规则（红涨绿跌黑持平）
4. 验证箭头显示
5. 验证手动刷新时指数数据更新
6. 模拟网络错误，验证错误处理

## 关键约束

- **禁止单独调用API**: 指数数据必须随股票数据一起获取
- **固定高度**: 状态栏高度 30px
- **左右布局**: 左侧上证指数，右侧深成指数
- **首次加载**: 显示占位符 "--"
