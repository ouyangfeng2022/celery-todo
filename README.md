# 🥬 Celery Todo

> 一款功能完整的桌面端待办事项应用，Celery 风格 UI，支持多项目、回收站、拖拽排序与本地离线存储。

Celery Todo 是一个基于 Electron + React 的桌面 Todo 应用，所有数据通过 SQLite (WASM) 存储在本地浏览器/Electron 中，无需联网、无需账号，开箱即用。

## ✨ 功能特性

- **多项目管理** — 以项目维度组织待办，每个项目独立维护自己的事项列表
- **优先级与截止日期** — 高 / 中 / 低三档优先级，支持设置截止日期与到期提醒
- **Markdown 描述** — 事项描述支持 Markdown 语法
- **拖拽排序** — 基于 `@dnd-kit` 的流畅拖拽体验，支持手动排序
- **筛选与排序** — 按全部 / 未完成 / 已完成筛选，按创建时间、截止日期、优先级或手动排序
- **批量操作** — 多选后批量完成 / 取消完成 / 删除 / 设置优先级
- **回收站** — 删除的事项进入回收站，30 天内可恢复
- **键盘快捷键** — 常用操作均提供快捷键支持
- **主题切换** — 浅色 / 深色 / 跟随系统
- **数据导入/导出** — 支持单项目或全量数据导出，方便备份与迁移
- **桌面集成（Electron）** — 系统托盘、最小化到托盘、开机自启、桌面通知

## 🛠️ 技术栈

| 类别 | 技术 |
| --- | --- |
| 桌面框架 | Electron 31 |
| 前端框架 | React 18 + TypeScript 5 |
| 构建工具 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 状态管理 | Zustand |
| 本地存储 | sql.js (SQLite WASM) + IndexedDB |
| 拖拽 | @dnd-kit |
| 动画 | Framer Motion |
| 测试 | Vitest + Testing Library |
| 包管理 | Bun |

## 📦 安装与运行

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Bun](https://bun.sh/) ≥ 1.0（项目指定的包管理器）

### 安装依赖

```bash
bun install
```

### 开发模式

```bash
# 仅 Web 端（浏览器开发调试）
bun dev

# Electron 桌面端开发（启动 Vite + Electron）
bun run electron:dev
```

### 构建产物

```bash
# 构建 Web 产物
bun run build

# 构建 Web + Electron TypeScript
bun run build:electron

# 打包成可执行安装包（Windows NSIS）
bun run electron:build
```

打包产物位于 `release/` 目录下。

## 📜 常用脚本

| 命令 | 说明 |
| --- | --- |
| `bun dev` | 启动 Vite 开发服务器（仅 Web） |
| `bun run electron:dev` | 启动 Electron 桌面端开发模式 |
| `bun run build` | 构建前端产物 |
| `bun run electron:build` | 打包桌面端安装包 |
| `bun test` | Vitest 监听模式运行测试 |
| `bun run test:run` | 单次运行测试 |
| `bun run test:coverage` | 运行测试并生成覆盖率报告 |
| `bun run lint` | ESLint 代码检查 |
| `bun run format` | Prettier 格式化代码 |

## 🏗️ 项目架构

```
celery-todo/
├── electron/               # Electron 主进程
│   ├── main.ts             # 窗口管理、自启动
│   ├── preload.ts          # IPC 桥接
│   ├── tray.ts             # 系统托盘
│   └── tsconfig.json
├── src/
│   ├── components/         # React 组件
│   │   ├── common/         # 通用组件（对话框、图标、通知等）
│   │   ├── filters/        # 筛选与搜索
│   │   ├── layout/         # 布局（Header）
│   │   ├── projects/       # 项目侧边栏
│   │   ├── recycle/        # 回收站
│   │   ├── settings/       # 设置面板
│   │   ├── stats/          # 统计面板
│   │   └── todos/          # 待办事项相关组件
│   ├── hooks/              # 自定义 Hooks
│   ├── store/              # Zustand 状态管理
│   ├── utils/              # 工具函数（数据库、导出、辅助函数）
│   ├── types/              # TypeScript 类型定义
│   ├── styles/             # 全局样式
│   └── test/               # 测试
├── public/                 # 静态资源（含 sql-wasm.wasm）
├── scripts/                # 构建辅助脚本
└── package.json
```

### 数据流

```
React 组件 → 自定义 Hooks → Zustand Store → SQLite (sql.js WASM)
                                                   ↓
                                              IndexedDB 持久化
```

数据层使用 sql.js 在浏览器/Electron 中运行 SQLite，数据库二进制通过 IndexedDB 持久化，采用 500ms 防抖自动保存，并支持手动 `flushSave()`。

### 已知平台行为

- **Windows 拖拽改窗口大小时右上角出现尺寸数字**：这是 Windows DWM 在无框窗口上
  绘制的原生尺寸提示，与 Electron 无框 + `titleBarOverlay` 配合时的已知现象
  （[electron/electron#943](https://github.com/electron/electron/issues/943)）。
  非 Bug，应用层无法移除，仅影响拖拽改大小期间的视觉。

## 📸 截图

![Celery Todo 主界面](assets/main.png)

## 📄 许可证

本项目基于 [MIT License](./LICENSE) 开源。
