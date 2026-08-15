<div align="center">

<img src="apps/desktop-electron/assets/celery-todo.svg" width="220" alt="Celery Todo" />

# Celery Todo

**本地优先的跨平台桌面待办应用**

Celery 风格 UI · 多项目管理 · 桌面贴图浮窗 · 拖拽排序 · 本地离线存储

<p>
  <a href="https://github.com/ouyangfeng2022/celery-todo/releases"><img src="https://img.shields.io/github/v/release/ouyangfeng2022/celery-todo?style=flat-square&color=d97757&label=%E7%89%88%E6%9C%AC" alt="Release"></a>
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/Rust-2021-DEA584?style=flat-square&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-8dbf33?style=flat-square" alt="License"></a>
  <a href="https://github.com/ouyangfeng2022/celery-todo/actions"><img src="https://img.shields.io/github/actions/workflow/status/ouyangfeng2022/celery-todo/ci.yml?branch=refactor%2F3.0-monorepo&style=flat-square&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-8dbf33?style=flat-square" alt="Platform">
</p>

<p>
  <a href="#下载">下载</a> ·
  <a href="#功能特性">功能</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#项目架构">架构</a> ·
  <a href="#开发文档">文档</a>
</p>

</div>

Celery Todo 3.0 基于 Tauri 2、React 与 Rust 构建。数据保存在本机 SQLite 数据库中，无需账号或网络连接；`celery` CLI 与桌面端读写同一份 v3 数据库。

> 3.0 是一次跨端重构：2.x Electron 应用保留在 `apps/desktop-electron/`，仅作迁移对照；当前正式桌面端位于 `apps/desktop/`。

---

## 下载

在 [v3.0.0 正式版](https://github.com/ouyangfeng2022/celery-todo/releases/tag/v3.0.0) 或 [最新 Release](https://github.com/ouyangfeng2022/celery-todo/releases/latest) 下载对应平台的安装包。

| 平台                | 文件                                                                |
| ------------------- | ------------------------------------------------------------------- |
| Windows x64         | `Celery.Todo_3.0.0_x64-setup.exe`                                   |
| macOS Apple Silicon | `Celery.Todo_3.0.0_aarch64.dmg`                                     |
| macOS Intel         | `Celery.Todo_3.0.0_x64.dmg`                                         |
| Linux               | `Celery.Todo_3.0.0_amd64.AppImage` 或 `Celery.Todo_3.0.0_amd64.deb` |
| Windows CLI         | `celery.exe`                                                        |

发布附件中的 `.sig` 与 `latest.json` 用于 Tauri 自动更新校验。应用会检查 GitHub Release 上的新版本。

---

## 功能特性

### 待办与项目

- 多项目管理、筛选、搜索、排序、批量操作与完成统计
- 高 / 中 / 低优先级、置顶、Markdown 描述与拖拽排序
- 已归档事项的浏览、恢复与永久删除
- 单项目或全量 v3 数据导入 / 导出

### 桌面能力

- 系统托盘、单实例、窗口状态记忆和开机自启
- 把项目固定为独立的桌面贴图浮窗，支持置顶和样式配置
- 原生保存对话框、自动更新与跨窗口数据同步

### 数据与 CLI

- Rust `celery-db` 提供 SQLite 数据库、迁移、FTS5 搜索和事务性批量写入
- 首次启动可检测并导入本机 2.x 数据库
- `celery status`、`projects`、`list`、`add`、`done`、`archive` 等命令直接管理同一份数据

---

## 技术栈

| 类别             | 技术                                                          |
| ---------------- | ------------------------------------------------------------- |
| 桌面框架         | Tauri 2                                                       |
| 前端             | React 18 + TypeScript 5 + Vite 5 + Tailwind CSS 3             |
| 桌面宿主与数据层 | Rust 2021 + rusqlite（bundled SQLite）                        |
| 数据访问         | `@celery/data` Repository 契约 + Tauri commands               |
| 本地存储         | SQLite（WAL、外键、FTS5）                                     |
| CLI              | Rust + clap                                                   |
| 单元测试         | Vitest、Rust tests                                            |
| E2E 测试         | WebdriverIO + tauri-driver；Playwright Electron（2.x 对照壳） |
| 包管理与构建编排 | Bun workspaces + Turborepo                                    |

---

## 快速开始

### 环境要求

- [Bun](https://bun.sh/) 1.3.10
- Rust stable（含 Cargo）
- 桌面端原生依赖按 Tauri 的 [前置要求](https://v2.tauri.app/start/prerequisites/) 安装

### 安装与开发

```bash
bun install

# 运行桌面端（会启动真实窗口）
bun run desktop:dev

# 构建所有 TypeScript workspace
bun run build

# 打包当前平台的 Tauri 桌面端
bun run desktop:build
```

### 常用验证命令

```bash
bun run lint
bun run test:run
cargo test -p celery-db
cargo check -p celery-desktop
```

> 桌面 E2E 会启动真实应用窗口，由 GitHub Actions 验证；日常开发请优先运行与改动相关的单测或 Rust 测试。

---

## 项目架构

```
celery-todo/
├── apps/
│   ├── desktop/             # 3.0 Tauri 2 桌面端（React/Vite + Rust 宿主）
│   ├── cli/                 # Rust CLI：celery
│   ├── mobile/              # Expo 移动端（独立发布节奏）
│   └── desktop-electron/    # 2.x Electron 迁移对照壳
├── crates/
│   └── celery-db/           # SQLite schema、迁移、Repository 实现与 FTS
├── packages/
│   ├── core/                # 领域实体、规则、排序与导入导出规则
│   ├── data/                # 跨端 Repository 契约与适配器
│   ├── ui-tokens/           # 跨端设计 token
│   └── test-contracts/      # Repository 共享契约测试
├── scripts/                 # 仓库辅助脚本
└── .github/workflows/       # CI、E2E 与桌面发布
```

### 数据流

```
React renderer → @celery/data Repository → Tauri commands → celery-db → SQLite
                                           ↑
celery CLI ───────────────────────────────┘
```

数据库默认位于系统应用数据目录的 `com.celery.todo/celery-v3.db`。写操作以事务执行并广播 `data-changed`，已打开的窗口会同步刷新。

---

## 测试策略

- **TypeScript**：`bun run lint`、`bun run test:run`、`bun run build`
- **Rust**：`cargo test -p celery-db`（同时校验生成的 TypeScript 绑定）和 `cargo check -p celery-desktop`
- **Tauri E2E**：GitHub Actions 在 Linux 上使用 WebdriverIO 与 `tauri-driver`
- **Electron 对照壳 E2E**：GitHub Actions 在 Windows 上使用 Playwright；仅按改动域运行对应 spec

完整约定、命令和变更区域到测试文件的映射见 [`AGENTS.md`](./AGENTS.md)。

---

## 开发文档

| 文档                                               | 内容                                |
| -------------------------------------------------- | ----------------------------------- |
| [`AGENTS.md`](./AGENTS.md)                         | Monorepo 架构、命令、约束与测试约定 |
| [`CHANGELOG.md`](./CHANGELOG.md)                   | 用户可见版本变更日志                |
| [`apps/mobile/README.md`](./apps/mobile/README.md) | Expo 移动端的独立开发说明           |
| [`VERSIONING.md`](./VERSIONING.md)                 | 2.x Electron 版本策略历史说明       |

---

## 贡献

欢迎提交 Issue 与 PR。提交前请运行 `bun run lint`、`bun run test:run` 与相关的 Rust 验证；提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
