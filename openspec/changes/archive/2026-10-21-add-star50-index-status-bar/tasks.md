## 1. 主进程数据源接入

- [x] 1.1 在 `electron/services/priceFetcher.ts` 的 `INDEX_CODES` 中新增 `'sh000688'`
- [x] 1.2 在 `INDEX_NAMES` 中新增映射 `'sh000688': '科创50'`
- [x] 1.3 确认无需改动 `parseIndexData` 结果过滤逻辑（`INDEX_CODES.includes(r.stockCode)` 自动覆盖新代码）

## 2. 状态栏组件扩展

- [x] 2.1 在 `src/components/IndexStatusBar.vue` 中新增 `kc50Index` computed（匹配 `i.code === 'sh000688'`），与 `shIndex`/`szIndex` 风格一致
- [x] 2.2 模板新增中间指数项：复制现有指数项结构（名称/现价/涨跌额带箭头/涨跌幅 + 涨跌着色类），`v-if="kc50Index"`，`v-else` 显示 `--` 占位
- [x] 2.3 调整布局：三个 `.index-item` 均 `flex:1`，中间项 `justify-content: center`，保持容器 `justify-content: space-between`
- [x] 2.4 将 `.error-indicator` 移至状态栏上沿外侧（`top: -20px; left: 50%; transform: translateX(-50%)`），避免遮挡中间指数项
- [x] 2.5 在 `shared/types/index.ts`（及 `src/types.ts` 如存在对应注释）`IndexData.code` 注释中补充 `sh000688` 代码示例说明

## 3. 质量门禁

- [x] 3.1 运行 `npm run typecheck` 验证 TypeScript 类型检查通过
- [x] 3.2 运行 `npm run lint`（改动文件单独校验零问题；存量问题经 stash 对比确认与本次改动无关）
- [x] 3.3 运行 `npm test` 确认无回归失败（15 failed / 143 passed，与基线一致，失败均为存量形态测试）

## 4. 手动验证

- [ ] 4.1 启动应用，状态栏中间项显示「科创50」及实时点位、涨跌额、涨跌幅，与行情软件数值一致
- [ ] 4.2 验证三项指数着色正确：涨红、跌绿、平黑，箭头方向与数值符号一致
- [ ] 4.3 验证指数数值格式：价格/涨跌额2位小数，涨跌额与涨跌幅带正负号，涨跌幅带 `%`
- [ ] 4.4 将窗口缩至最小可用宽度，验证三项指数单行显示不换行、不溢出、不遮挡
- [ ] 4.5 断开网络触发数据错误：验证保留上次成功数据、错误提示浮层不遮挡三个指数项内容
- [ ] 4.6 验证科创50数据缺失时（如网络仅部分失败）中间项显示 `--`，上证与深成指不受影响
