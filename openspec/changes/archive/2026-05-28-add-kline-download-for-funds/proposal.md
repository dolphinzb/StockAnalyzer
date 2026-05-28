## Why

当前自选股K线数据下载功能仅支持A股股票（以0、3、6开头的6位数字代码），不支持基金（ETF、LOF等）。但项目中已经实现了基金的识别逻辑（代码前缀为51、15、16、50、52、511）和价格精度处理（基金3位小数，股票2位小数）。用户需要在自选股中添加基金并下载其K线数据，以便进行技术分析和交易决策。扩展现有K线下载功能以支持基金，可以提升系统的完整性和用户体验。

## What Changes

- **扩展股票代码验证规则**：修改 `klineDownloadService.ts` 中的验证逻辑，允许基金代码通过验证（除了现有的A股代码外，还支持51、15、16、50、52、511开头的基金代码）
- **更新错误提示信息**：将"仅支持A股"的错误提示改为更通用的提示，说明支持的证券类型
- **保持现有功能不变**：自动下载、手动下载、复权类型选择、数据存储等核心功能保持不变，仅扩展支持的证券类型范围
- **前端无需修改**：由于基金已在系统中被正确识别和处理，前端UI组件（如价格显示、K线图表）已支持基金，无需额外改动

## Capabilities

### New Capabilities
<!-- No new capabilities - extending existing kline-download capability -->

### Modified Capabilities
- `kline-download`: 扩展支持的证券类型，从仅支持A股扩展到同时支持A股和基金（ETF、LOF等）

## Impact

**Affected Code**:
- `electron/services/klineDownloadService.ts`: 修改 `isAStockCode()` 函数和 `validateDownloadInput()` 函数，扩展证券类型验证逻辑
- `shared/types/index.ts`: 无需修改（基金识别逻辑已在 `src/utils/formatPrice.ts` 中实现）

**APIs**: 
- IPC 通道 `kline:download` 的接口契约不变，但接受的 stockCode 范围扩大

**Dependencies**: 
- 依赖 `stock-sdk` 库，需确认 stock-sdk 是否支持基金K线数据获取（根据已有代码，stock-sdk 应已支持）

**Systems**:
- 数据库 `kline_data` 表无需修改（已支持任意6位数字代码）
- 前端组件无需修改（已支持基金价格显示和K线展示）

**Backward Compatibility**:
- 完全向后兼容，现有A股股票的下载功能不受影响
- 新增基金下载能力，不影响已有数据
