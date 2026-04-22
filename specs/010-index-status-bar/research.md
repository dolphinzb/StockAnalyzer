# Research: 指数状态栏显示

## Phase 0: Research Findings

### 1. 指数代码研究

**Decision**: 使用新浪财经API获取指数数据

**Rationale**: 
- 上证指数代码: `sh000001`
- 深成指数代码: `sz399001`
- 新浪财经API支持批量获取，格式: `https://hq.sinajs.cn/list=sh000001,sz399001`
- 现有 `fetchStockPrices` 函数已支持批量获取，可直接复用

**Alternatives considered**:
- 腾讯财经API - 需要额外适配
- 东方财富API - 接口格式不同

### 2. 现有代码研究

**Decision**: 复用现有 `priceFetcher.ts` 中的批量获取逻辑

**Rationale**:
- 现有 `fetchStockPrices` 函数通过逗号分隔支持批量获取
- 只需在股票列表中添加指数代码即可一并获取
- 无需新增API调用，符合"禁止单独调用接口"约束

**Implementation approach**:
- 在 `priceFetcher.ts` 中定义指数代码常量
- 在批量获取时将指数代码添加到请求列表
- 解析返回数据时区分股票和指数

### 3. 状态栏UI设计

**Decision**: 使用Vue组件实现固定高度30px的状态栏

**Rationale**:
- Vue 3.4+ 组件化开发，与现有项目一致
- 固定高度30px，不影响主内容区域
- 左右分布布局：左侧上证指数，右侧深成指数

**Styling approach**:
- 使用CSS flexbox实现左右分布
- 使用CSS clamp()实现字体自适应
- 颜色规则：上涨红色(#ff0000)，下跌绿色(#00ff00)，持平黑色(#000000)

### 4. 数据流设计

**Decision**: 通过IPC通道推送指数数据更新

**Rationale**:
- 主进程获取数据后通过IPC推送到渲染进程
- 渲染进程使用Pinia store管理状态
- 组件通过composable订阅store数据

**IPC channels**:
- `index:update` - 新增通道，推送指数数据
- `prices:update` - 扩展现有通道，包含指数数据
