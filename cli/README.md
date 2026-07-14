# Celery Todo CLI

`celery` 命令行工具提供双模式运行：

| 模式 | 条件 | 原理 |
|---|---|---|
| **IPC**（推荐） | GUI 正在运行 | 经 Unix socket/Windows 命名管道将操作发送到 GUI 渲染进程，经 Zustand store 实时更新界面 → CLI 改动立即反映在 GUI 中 |
| **直连**（离线回退） | GUI 未运行 | 用 better-sqlite3 直接读写 SQLite 文件，下次启动 GUI 时加载 |

**模式自动切换**：CLI 启动时尝试连接 GUI 的 socket/管道，成功则走 IPC，失败回退直连。用户完全无感知。

运行 `celery config` 可查看当前模式与通信端点。

## 快速开始

```bash
# 开发模式：免编译直接跑（tsx）
bun run cli list
bun run cli add "写周报" -p 工作 --priority high --due 2026-07-20

# 编译后以全局命令运行
bun run build:cli           # 输出到 dist-cli/
node dist-cli/index.js list

# 链接为全局命令 celery
bun link                    # 之后即可 celery list
```

## 命令一览

| 命令 | 说明 |
|---|---|
| `celery list` / `ls` | 列出待办（默认隐藏已完成） |
| `celery add <title...>` | 新建待办 |
| `celery show <id>` | 查看单条详情 |
| `celery edit <id>` | 修改标题/描述 |
| `celery done <id...>` | 标记完成 |
| `celery undone <id...>` | 取消完成 |
| `celery delete` / `rm <id...>` | 软删除（移入回收站） |
| `celery restore <id...>` | 从回收站恢复 |
| `celery priority <id> <level>` | 改优先级（high/medium/low） |
| `celery due <id> [date]` | 设置/清除截止日期 |
| `celery archive` | 回收站管理（列表/清空/全部恢复） |
| `celery projects` / `proj` | 项目列表/新增/删除 |
| `celery stats` | 各项目统计概览 |
| `celery config` | 展示当前模式（IPC/直连）、通信端点、数据库路径与 schema 版本 |

空参运行等价于 `celery list`。

## 全局选项

| 选项 | 说明 |
|---|---|
| `--db <path>` | 显式指定数据库文件路径（覆盖一切自动定位） |
| `--force` | 写操作时跳过「App 运行中」检测（**风险自负**） |
| `--json` | 输出 JSON 而非表格，便于脚本消费（`celery list --json \| jq ...`） |
| `-h, --help` | 查看帮助 |

## 用法示例

```bash
# 列出「工作」项目的活跃待办
celery list -p 工作

# 跨项目列全部，含已完成
celery list --all

# 仅看逾期
celery list --overdue

# 新建带优先级、截止日期、描述的待办
celery add "完成季度报告" -p 工作 --priority high --due 2026-07-20 --desc "含 Q2 数据"

# 用 id 前缀操作（无需完整 UUID）
celery done a3f1
celery priority a3f1 low
celery due a3f1 clear

# 批量完成
celery done a3f1 b7c2 c9d3

# 删除（移入回收站，可恢复）
celery delete a3f1 -y

# 从回收站恢复
celery archive --list
celery restore a3f1

# 永久清空回收站
celery archive --clean -y

# 项目管理
celery projects --add "新项目" -c red
celery projects --delete "旧项目" -y

# 查看统计
celery stats

# 机器可读输出
celery list --json > todos.json
```

## 数据库路径定位

CLI 按以下优先级确定要操作的数据库文件：

1. `--db <path>` 命令行选项（最高）
2. `CELERY_TODO_DB` 环境变量
3. `userData/storage-config.json` 中 `dataDir` + `celery-todo.db`
4. 默认 `userData/data/celery-todo.db`

`userData` 路径由 Electron 决定，CLI 兼容两种命名：

- **打包版**：`Celery Todo`（带空格，来自 `productName`）
  - Windows: `%APPDATA%\Celery Todo`
  - macOS: `~/Library/Application Support/Celery Todo`
  - Linux: `~/.config/Celery Todo`
- **开发版**：`celery-todo`（小写连字符，来自 `package.json` name）
  - Windows: `%APPDATA%\celery-todo`
  - macOS: `~/Library/Application Support/celery-todo`
  - Linux: `~/.config/celery-todo`

CLI 会探测候选目录，命中含 `storage-config.json` 或已有数据库文件的目录。

运行 `celery config` 可查看当前解析到的路径。

## ⚠️ 并发安全（旧版直连模式）

桌面应用把数据库**缓存在内存中**，并以 500ms 防抖写回文件。若 App 运行时 CLI 用直连模式写入文件，App 下一次保存会用其内存副本**覆盖** CLI 的改动。

**直连模式**下 CLI 写操作前会 best-effort 检测 App 进程：

- 检测到运行 → 阻止写入并提示，除非加 `--force`
- 检测失败（权限/平台差异）→ 静默放行，不阻塞用户

**IPC 模式下此问题完全不存在**：CLI 不直接写文件，而是通过管道调用 GUI 渲染进程的 store action → 走正常的 500ms 防抖保存路径。

推荐做法：

1. **GUI 运行时**：CLI 自动走 IPC 模式，无需任何顾虑
2. **GUI 未运行时**：用直连模式。如需同时使用，先退出 GUI，操作 CLI，再启动 GUI

## 命令设计细节

- **ID 前缀匹配**：所有 `<id>` 参数支持 UUID 前缀（如 `a3f1` 匹配 `a3f1b2c3-...`）；前缀歧义时会列出候选项。
- **项目参数**：`-p <name|id>` 支持完整 id、id 前缀、项目名（或唯一名称前缀）。
- **优先级**：`--priority high|medium|low`，非法值回退为 medium。
- **日期**：`--due YYYY-MM-DD`（按本地时区当日零点）或完整 ISO；`due clear` 清除。
- **非 TTY 友好**：管道/重定向时自动关闭颜色（遵循 `NO_COLOR`），`--json` 输出稳定结构，确认提示在非交互环境默认 yes。

## 架构

```
cli/
  tsconfig.json           独立 tsconfig：CommonJS 输出到 dist-cli/
  vitest.config.ts        独立 vitest：node 环境，scope 限定 cli/test
  src/
    index.ts              commander 入口、全局选项、空参快捷
    context.ts            运行时上下文：mode 字段、DB 打开/守卫、错误兜底
    storage.ts            DB 路径定位（复刻 electron/storage.ts + 兼容 dev/prod userData）
    db.ts                 双模式数据访问分派层（async）：
                            - IPC 模式 → ipcCall() 经管道到 GUI
                            - 直连模式 → 委托 db-direct.ts
    db-direct.ts          better-sqlite3 直连层（离线回退）
    ipc.ts                JSON-RPC over net 客户端
                          （unix socket / Windows named pipe）
    render.ts             表格/颜色/确认（零依赖 ANSI）
    process-check.ts      直连模式下 best-effort 检测 App 进程
    types.ts              Todo/Project 类型（独立维护，与 src/types 同步）
    commands/             14 个子命令（全部 async）
  test/
    helpers.ts            临时 DB fixture（复刻 App schema）
    storage.test.ts       路径解析单测
    db.test.ts            数据层 CRUD 集成测试（直连模式）
    ipc.test.ts           JSON-RPC over net 协议测试
electron/
  cli-server.ts           主进程 net server + JSON-RPC 路由 + ID 配对
  main.ts                 初始化 cli-server + before-quit 清理
  preload.ts              新增 onCliRequest/cliRespond IPC 通道
src/
  cli-bridge.ts           渲染进程 CLI handler（调 store action 实时更新 GUI）
  App.tsx                 挂载 useCliBridge hook
scripts/fix-cli-cjs.mjs   写 dist-cli/package.json 标记 CommonJS（与 fix-electron-cjs.mjs 同模式）
```

### 数据流

```
CLI 命令
  │  (celery add/list/...)
  ▼
db.ts 分派层
  │
  ├─ IPC 模式 ────►  ipc.ts  ────►  Unix socket/   ────►  electron/cli-server.ts
  │                                     命名管道              │
  │                                                          ▼
  │                                                   electron/preload.ts
  │                                                          │
  │                                                          ▼
  │                                                   src/cli-bridge.ts
  │                                                          │
  │                                                   Zustand store action
  │                                                          │
  │                                            ┌─────────────┼─────────────┐
  │                                            ▼                         ▼
  │                                       React 实时重渲染           database.ts
  │                                        （GUI 即时刷新）          （500ms 保存）
  │
  └─ 直连模式 ──►  db-direct.ts  ──►  better-sqlite3  ──►  SQLite 文件
```

### 关键约束

### 关键约束

- **better-sqlite3 / commander / tsx 全部放 `devDependencies`**，绝不进 Electron 打包流程（`package.json` 的 `build.files` 只含 `dist`、`dist-electron`、`package.json`）。
- **CLI 独立 tsconfig**，不加入根 `tsconfig.json` 的 references，避免污染渲染端的 `tsc -b`。
- **不修改 journal_mode**：App（sql.js）以 rollback journal 使用文件，CLI 保持一致，避免只读打开时改 journal 报错。
- **不做 schema 迁移**：CLI 只对已初始化的库操作；缺表时报错并提示「请先启动一次 App」。

## 测试

```bash
bun run test:cli          # vitest，跑 cli/test（node 环境，临时 DB）
```

- `db.test.ts`：用 `helpers.createSeedDb()` 构造临时 SQLite（直连模式），覆盖 CRUD 全流程、路径解析、前缀匹配。
- `ipc.test.ts`：启动临时 net server 模拟 GUI 主进程，验证 JSON-RPC over net 协议的往返、错误回传、ID 配对。
- `storage.test.ts`：数据库路径定位逻辑。
