## 1. 创建价格格式化工具模块

- [x] 1.1 创建 `src/utils/formatPrice.ts` 文件
- [x] 1.2 实现 `isFund()` 函数，基于代码前缀识别基金（支持 51/15/16/50/52/511 开头）
- [x] 1.3 实现 `getPricePrecision()` 函数，返回正确的精度值（基金3，股票2）
- [x] 1.4 实现 `formatPrice()` 函数，格式化价格显示（支持可选的 stockCode 参数）
- [x] 1.5 实现 `formatChange()` 函数，格式化涨跌额显示
- [x] 1.6 实现 `formatChangePercent()` 函数，格式化涨跌幅百分比显示
- [x] 1.7 为所有函数添加 TypeScript 类型定义和 JSDoc 注释

## 2. 更新 StockItem 组件

- [x] 2.1 在 `StockItem.vue` 中导入新的格式化工具函数
- [x] 2.2 修改 `formatPrice()` 调用，传入 `stockCode` 参数
- [x] 2.3 修改 `formatChange()` 调用，传入 `stockCode` 参数
- [x] 2.4 修改 `formatChangePercent()` 调用，传入 `stockCode` 参数
- [x] 2.5 验证模板中所有价格显示都使用了新的格式化函数

## 3. 测试与验证

- [x] 3.1 启动开发服务器，确认编译无错误
- [ ] 3.2 在自选股页面添加测试基金（如 510050）
- [ ] 3.3 验证基金价格显示3位小数
- [ ] 3.4 验证股票价格仍显示2位小数
- [ ] 3.5 验证基金的涨跌额和涨跌幅也显示3位小数
- [ ] 3.6 验证股票的涨跌额和涨跌幅仍显示2位小数
- [ ] 3.7 测试边界情况：价格为 null、0、负数时的显示

## 4. 代码质量检查

- [x] 4.1 运行 `npm run lint` 确保无 ESLint 错误（新文件无错误）
- [x] 4.2 运行 `npm run typecheck` 确保无 TypeScript 类型错误
- [x] 4.3 检查是否有其他组件也需要使用新的格式化工具（如 PositionItem、IndexStatusBar）
- [x] 4.4 如需，在其他组件中也应用相同的精度规则（PositionItem已用4位小数，IndexStatusBar显示指数无需修改）

## 5. 文档与提交

- [ ] 5.1 在工具函数中添加使用说明注释
- [ ] 5.2 创建 git 分支（如 `feature/price-display-precision`）
- [ ] 5.3 提交代码变更
- [ ] 5.4 推送分支到远程仓库
