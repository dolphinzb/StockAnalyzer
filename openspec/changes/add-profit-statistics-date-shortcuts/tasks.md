## 1. 日期计算工具函数

- [x] 1.1 在 ProfitStatistics.vue 中实现 getThisYearRange() 函数,返回今年的起止日期 { startDate: 'YYYY-01-01', endDate: 'YYYY-MM-DD' }
- [x] 1.2 在 ProfitStatistics.vue 中实现 getLastYearRange() 函数,返回去年的起止日期 { startDate: 'YYYY-01-01', endDate: 'YYYY-12-31' }
- [x] 1.3 在 ProfitStatistics.vue 中实现 getLastYearStartRange() 函数,返回从去年1月1日到今天的日期范围 { startDate: 'YYYY-01-01', endDate: 'YYYY-MM-DD' }

## 2. UI 模板修改

- [x] 2.1 在 ProfitStatistics.vue 的 query-bar 中,DateRangePicker 之后添加快捷按钮组容器 div.shortcuts-group
- [x] 2.2 在 shortcuts-group 中添加"今年"按钮,绑定点击事件 handleSetThisYear
- [x] 2.3 在 shortcuts-group 中添加"去年"按钮,绑定点击事件 handleSetLastYear
- [x] 2.4 在 shortcuts-group 中添加"去年开始"按钮,绑定点击事件 handleSetLastYearStart

## 3. 事件处理函数实现

- [x] 3.1 实现 handleSetThisYear() 函数,调用 getThisYearRange() 更新日期范围并自动触发计算
- [x] 3.2 实现 handleSetLastYear() 函数,调用 getLastYearRange() 更新日期范围并自动触发计算
- [x] 3.3 实现 handleSetLastYearStart() 函数,调用 getLastYearStartRange() 更新日期范围并自动触发计算

## 4. 样式实现

- [x] 4.1 为 shortcuts-group 添加 CSS 样式,设置 display: flex 和 gap: 8px
- [x] 4.2 创建 .btn-shortcut 样式类,使用白色背景、灰色边框的次要按钮样式
- [x] 4.3 为 .btn-shortcut 添加 hover 状态样式(背景色 #f9fafb)
- [x] 4.4 为 .btn-shortcut 添加 active 状态样式(背景色 #f3f4f6)
- [x] 4.5 确保快捷按钮与现有按钮高度一致(36px)
- [x] 4.6 调整 query-bar 的 gap 值,确保所有元素间距合理(16px)

## 5. 测试与验证

- [x] 5.1 在开发环境中测试"今年"按钮功能,验证日期设置正确且自动触发计算
- [x] 5.2 在开发环境中测试"去年"按钮功能,验证日期设置正确且自动触发计算
- [x] 5.3 在开发环境中测试"去年开始"按钮功能,验证日期设置正确且自动触发计算
- [x] 5.4 测试快捷按钮与手动日期选择的兼容性,确保互不干扰
- [x] 5.5 测试快捷按钮在不同年份的行为(特别是年初和年末)
- [x] 5.6 验证快捷按钮的视觉样式与设计要求一致
- [x] 5.7 验证快捷按钮在小屏幕上的显示效果,确保不会溢出或换行
