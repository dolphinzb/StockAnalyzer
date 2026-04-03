# StockAnalyzer

基于 Electron + Vite + Vue3 + TypeScript 的股票分析桌面应用

## 技术栈

- **前端框架**: Vue 3 (Composition API)
- **桌面框架**: Electron
- **构建工具**: Vite
- **语言**: TypeScript
- **包管理**: npm

## 项目结构

```
├── electron/          # Electron 主进程代码
├── src/               # Vue 渲染进程代码
├── public/            # 静态资源
└── dist/              # 构建输出目录
```

## 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 注意事项

- 开发环境下修改 Electron 主进程代码后需要重启应用
- 构建前请确保所有代码已保存
