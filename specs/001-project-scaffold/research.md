# Research Report: 搭建项目基础框架

**Feature**: 001-project-scaffold
**Date**: 2026-04-03
**Status**: Complete

## Executive Summary

本研究报告确定了 Electron + Vite + Vue3 + TypeScript 技术栈的最佳集成方案，为项目骨架搭建提供技术依据。所有决策均符合项目章程要求。

## Research Topics

### 1. Electron + Vite 集成方案

**Decision**: 手动配置 Vite + Electron（不采用 electron-vite 框架）

**Rationale**:
- 手动配置提供更大的灵活性，可精确控制构建流程
- electron-vite 是成熟方案，但增加了一层抽象，调试复杂度上升
- 根据章程要求，需要清晰的主进程(preload)与渲染进程分离结构，手动配置更直观
- 备选方案 electron-vite 可在未来考虑迁移

**Alternatives Considered**:
| 方案 | 优点 | 缺点 |
|------|------|------|
| electron-vite | 开箱即用，配置简单 | 抽象层增加调试难度 |
| 手动配置 | 灵活可控，透明 | 需要更多初始配置 |
| electron-forge | 官方推荐 | 模板化严重，定制困难 |

### 2. Vue 3 + TypeScript 最佳实践

**Decision**: 使用 `<script setup>` 语法 + TypeScript

**Rationale**:
- `<script setup>` 是 Vue 3.4+ 官方推荐的组合式 API 语法
- 编译时语法糖，减少样板代码
- 与 TypeScript 类型系统完美集成
- 符合章程要求的 "Vue 3 Composition API 最佳实践"

**TypeScript Configuration**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "moduleResolution": "bundler"
  }
}
```

### 3. Electron 安全配置

**Decision**: 启用上下文隔离 + 禁用节点集成 + 使用 contextBridge

**Rationale**:
- 符合章程 "安全性" 原则的强制要求
- Electron 28.x 默认推荐配置
- 防止渲染进程直接访问 Node.js API

**Required Configuration**:
```typescript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  preload: path.join(__dirname, 'preload.js')
}
```

### 4. electron-builder 打包配置

**Decision**: 使用 electron-builder 进行 Windows 打包

**Rationale**:
- 成熟稳定的跨平台打包方案
- 支持 Windows NSIS 和 portable 格式
- 配置灵活，支持代码签名
- 文档完善，社区活跃

**Configuration**:
- target: nsis (Windows 安装程序)
- architecture: x64
- output: dist/

### 5. 代码规范工具

**Decision**: ESLint + Prettier + husky + lint-staged

**Rationale**:
- ESLint: TypeScript 和 Vue 代码检查
- Prettier: 代码格式化
- husky: Git hooks 集成
- lint-staged: 仅检查暂存文件，提升性能

## Technical Recommendations

### Directory Structure

```
project/
├── electron/           # 主进程代码 (main)
├── src/                # 渲染进程 Vue 代码 (renderer)
├── preload/            # 预加载脚本
├── shared/             # 共享类型
└── build/              # 构建资源
```

### Critical Dependencies

| 依赖 | 版本 | 用途 |
|------|------|------|
| electron | ^28.0.0 | 桌面应用框架 |
| vite | ^5.0.0 | 构建工具 |
| vue | ^3.4.0 | UI 框架 |
| typescript | ^5.3.0 | 类型系统 |
| electron-builder | ^24.0.0 | 打包工具 |

### Build Commands

- `npm run dev`: 启动开发服务器 (Vite + Electron)
- `npm run build`: 生产构建
- `npm run preview`: 预览构建结果

## Conclusion

所有技术决策均与项目章程保持一致，优先考虑安全性、可维护性和性能。项目骨架将采用手动配置的 Electron + Vite 集成方案，以获得最大的控制力和透明度。

## References

- [Electron Security Best Practices](https://www.electronjs.org/docs/tutorial/security)
- [Vue 3 Composition API](https://vuejs.org/api/composition-api-setup.html)
- [Vite Electron Guide](https://vitejs.dev/guide/>
- [electron-builder Documentation](https://www.electron.build/)
