## Context

当前系统已实现完整的K线数据下载功能，包括：
- 手动下载：用户在自选股列表点击"下载K线"按钮，选择日期范围和复权类型后下载
- 自动下载：交易日15:10自动下载所有自选股的当日K线数据
- 数据存储：K线数据保存在 `kline_data` 表中，支持不复权和前复权两种类型
- 前端展示：K线弹窗从数据库加载数据并展示，支持复权类型切换和交易标注

现有代码限制：
- `electron/services/klineDownloadService.ts` 中的 `isAStockCode()` 函数仅验证以0、3、6开头的6位数字代码（A股）
- 基金代码（51、15、16、50、52、511开头）被拒绝，抛出 "INVALID_STOCK_CODE: 不支持的股票类型，仅支持A股" 错误

但系统中已有基金支持基础：
- `src/utils/formatPrice.ts` 实现了 `isFund()` 函数，可识别基金代码
- 前端价格显示已根据证券类型自动调整精度（基金3位小数，股票2位小数）
- 数据库表结构支持任意6位数字代码，无需修改

## Goals / Non-Goals

**Goals:**
- 扩展K线下载服务，使其支持基金代码（ETF、LOF等）
- 保持现有A股下载功能完全不变
- 确保 stock-sdk 能够正确获取基金的K线数据
- 最小化代码改动，仅修改验证逻辑

**Non-Goals:**
- 不修改数据库表结构（已支持）
- 不修改前端UI组件（已支持基金显示）
- 不改变现有的下载流程、复权类型选择、数据存储逻辑
- 不处理非6位数字代码的证券（如港股、美股）

## Decisions

### Decision 1: 扩展证券类型验证逻辑

**Choice**: 创建新的 `isValidSecurityCode()` 函数替代 `isAStockCode()`，同时支持A股和基金

**Rationale**:
- 保持代码语义清晰，`isAStockCode` 名称与实际功能不符（现在支持多种证券类型）
- 复用已有的基金识别规则（来自 `formatPrice.ts`），保持一致性
- 单一职责：验证函数负责判断是否为支持的证券类型

**Implementation**:
```typescript
/**
 * 判断证券代码是否有效（支持A股和基金）
 * @param stockCode 证券代码（6位数字）
 * @returns 是否为支持的证券类型
 */
function isValidSecurityCode(stockCode: string): boolean {
  // A股：深市主板(0)、创业板(3)、沪市主板(6)
  const isAStock = /^[036]\d{5}$/.test(stockCode);
  
  // 基金：上交所ETF(51)、深交所ETF(15)、深交所LOF(16)、上交所LOF(50)、上交所货币基金(52)、上交所债券ETF(511)
  const isFund = /^(51|15|16|50|52|511)\d{4}$/.test(stockCode);
  
  return isAStock || isFund;
}
```

**Alternatives considered**:
- 方案A：直接修改 `isAStockCode()` 函数名和逻辑 → 拒绝，因为函数名会误导（不再仅是A股）
- 方案B：保留 `isAStockCode()`，新增 `isFundCode()`，在验证时两者都检查 → 拒绝，增加复杂度
- 方案C：使用正则表达式白名单 `/^(0|3|6|51|15|16|50|52|511)\d{4}$/` → 拒绝，可读性差，511是3位前缀需特殊处理

### Decision 2: 更新错误提示信息

**Choice**: 将错误提示从"仅支持A股"改为"仅支持A股和基金"

**Rationale**:
- 明确告知用户支持的证券类型范围
- 避免用户困惑为什么基金代码被拒绝

**Implementation**:
```typescript
if (!isValidSecurityCode(stockCode)) {
  throw new Error('INVALID_STOCK_CODE: 不支持的证券类型，仅支持A股和基金');
}
```

### Decision 3: 确认 stock-sdk 支持基金K线数据

**Assumption**: stock-sdk 的 `getHistoryKline()` 方法已支持基金代码

**Rationale**:
- 项目中已有基金价格获取功能（`priceFetcher.ts`），说明 stock-sdk 支持基金
- stock-sdk 基于东方财富API，该API支持基金K线数据
- 如有问题，可在测试阶段验证并调整

**Verification Plan**:
- 在开发完成后，手动测试下载一只基金（如510050上证50ETF）的K线数据
- 验证 stock-sdk 返回的数据格式与股票一致
- 验证数据库中保存的数据正确

### Decision 4: 不修改自动下载逻辑

**Choice**: 自动下载功能无需修改，因为它调用的是 `downloadWithRetry()`，而该函数内部调用 `downloadKline()`，后者会使用新的验证逻辑

**Rationale**:
- 自动下载遍历自选股列表，对每只股票调用下载函数
- 如果自选股中包含基金，新验证逻辑会自动允许下载
- 无需额外判断证券类型，保持代码简洁

## Risks / Trade-offs

### Risk 1: stock-sdk 可能不支持某些基金类型

**Impact**: 部分基金代码下载失败

**Mitigation**: 
- 在验证阶段添加日志，记录下载的证券类型
- 捕获 stock-sdk 异常，返回友好错误提示
- 如发现问题，可调整 `isValidSecurityCode()` 的正则表达式，排除不支持的类型

### Risk 2: 基金复权数据处理可能与股票不同

**Impact**: 前复权数据可能不准确

**Mitigation**:
- stock-sdk 应已处理复权计算，客户端无需关心
- 测试时验证基金前复权数据的合理性
- 如有问题，记录日志并反馈给 stock-sdk 维护者

### Risk 3: 用户可能在自选股中添加无效基金代码

**Impact**: 下载失败，用户体验差

**Mitigation**:
- 依赖 stock-sdk 的验证和错误返回
- 前端在添加自选股时已有股票代码验证（通过 positionApi.getStockName()）
- 下载失败时给出明确的错误提示

### Trade-off: 验证逻辑复杂度增加

**Trade-off**: 从简单的A股验证扩展到A股+基金验证，增加了正则表达式的复杂度

**Acceptance**: 
- 增加的复杂度是可接受的，因为提升了功能完整性
- 使用清晰的函数命名和注释降低理解成本
- 未来如需支持更多证券类型（如债券），可继续扩展

## Migration Plan

**部署步骤**:
1. 修改 `electron/services/klineDownloadService.ts` 文件
2. 重新构建 Electron 主进程：`npm run build:electron`
3. 重启应用进行测试

**回滚策略**:
- 如发现严重问题，可快速回滚到之前的代码版本
- 数据库无需迁移，回滚不影响已有数据
- 用户已下载的基金K线数据会保留（即使回滚，数据仍可用）

**测试计划**:
1. 单元测试：验证 `isValidSecurityCode()` 函数对各种代码的判断结果
2. 手动测试：下载几只典型基金（510050、159915、161725）的K线数据
3. 回归测试：验证现有A股股票下载功能不受影响
4. 自动下载测试：在自选股中添加基金，验证15:10自动下载是否正常执行

## Open Questions

**Q1**: 是否需要在前端添加证券类型提示？
- 当前：用户在添加自选股时输入代码，系统自动获取名称
- 建议：暂不添加，保持简洁。如用户输入无效代码，stock-sdk 会返回错误

**Q2**: 是否需要区分基金和股票的下载统计？
- 当前：自动下载日志仅统计成功/失败数量
- 建议：暂不区分，保持日志简洁。如需详细统计，可在后续版本增强

**Q3**: 基金是否支持前复权？
- 假设：stock-sdk 应支持，因为基金也有分红、拆分等除权事件
- 待验证：测试时需确认基金前复权数据是否正确
