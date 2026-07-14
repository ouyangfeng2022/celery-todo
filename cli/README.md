# Celery Todo CLI

`celery` 命令行工具直接读写桌面应用的 SQLite 数据库文件，提供与 GUI 对齐的待办管理能力。适合在终端、脚本、CI 中批量操作。

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
| `celery config` | 展示数据库路径与 schema 版本 |

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

## ⚠️ 与桌面应用的并发安全

桌面应用把数据库**缓存在内存中**，并以 500ms 防抖写回文件。若 App 运行时 CLI 写入文件，App 下一次保存会用其内存副本**覆盖** CLI 的改动。

**CLI 在写操作前会 best-effort 检测 App 进程**：

- 检测到运行 → 阻止写入并提示，除非加 `--force`
- 检测失败（权限/平台差异）→ 静默放行，不阻塞用户

推荐做法：

1. 完全退出桌面应用后再用 CLI 写入；或
2. 仅用 CLI 做只读查询（`list` / `show` / `stats` / `config`），这些操作不检测进程；或
3. 确知风险后用 `--force` 跳过检测。

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
    context.ts            运行时上下文：DB 打开/守卫、错误兜底
    storage.ts            DB 路径定位（复刻 electron/storage.ts + 兼容 dev/prod userData）
    db.ts                 better-sqlite3 数据层 + row mapper + CRUD
    render.ts             表格/颜色/确认（零依赖 ANSI）
    process-check.ts      best-effort 检测 App 进程
    types.ts              Todo/Project 类型（独立维护，与 src/types 同步）
    commands/             14 个子命令
  test/
    helpers.ts            临时 DB fixture（复刻 App schema）
    storage.test.ts       路径解析单测
    db.test.ts            数据层 CRUD 集成测试
scripts/fix-cli-cjs.mjs   写 dist-cli/package.json 标记 CommonJS（与 fix-electron-cjs.mjs 同模式）
```

### 关键约束

- **better-sqlite3 / commander / tsx 全部放 `devDependencies`**，绝不进 Electron 打包流程（`package.json` 的 `build.files` 只含 `dist`、`dist-electron`、`package.json`）。
- **CLI 独立 tsconfig**，不加入根 `tsconfig.json` 的 references，避免污染渲染端的 `tsc -b`。
- **不修改 journal_mode**：App（sql.js）以 rollback journal 使用文件，CLI 保持一致，避免只读打开时改 journal 报错。
- **不做 schema 迁移**：CLI 只对已初始化的库操作；缺表时报错并提示「请先启动一次 App」。

## 测试

```bash
bun run test:cli          # vitest，跑 cli/test（node 环境，临时 DB）
```

测试用 `helpers.createSeedDb()` 构造一个已初始化的临时 SQLite（执行与 `src/utils/database.ts createTables` 同源的 schema），覆盖 CRUD 全流程、路径解析、前缀匹配、并发模式切换。
