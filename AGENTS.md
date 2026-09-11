# AGENTS.md

Workspace instructions for ZCode agents working in `celery-todo`.
For deeper background see `README.md`（中文）与 [`VERSIONING.md`](./VERSIONING.md)。

> 2.x Electron 应用已于 3.4.2 之后退役删除（2026-09）。已发布的 2.x 安装包仍在
> GitHub Releases；存量用户经 2.20.2 迁移引导升级到 3.x，旧数据由 3.0 的
> `legacy_v2` 导入路径承接。本仓库现只维护 3.x 单线。

## Project purpose

Celery Todo — 本地优先的跨端待办应用。桌面端为 Tauri 2（React 18 renderer +
Rust 宿主），数据存本机 SQLite（`celery-db`，WAL + FTS5），无账号、无云同步。
多项目、拖拽排序、归档、系统托盘、桌面贴图浮窗、三主题。Rust CLI（`celery`）
与桌面端读写同一份数据库；Expo 移动端是独立应用，数据只存本机。

## Major directories

```text
apps/desktop/            # Tauri 2 桌面端（React/Vite renderer + src-tauri 命令层）
apps/cli/                # Rust CLI：celery（与桌面端同库）
apps/mobile/             # Expo 移动端（独立应用、独立发布节奏，不入根 workspace）
crates/celery-db/        # v3 SQLite 数据层（Rust）：schema、迁移、仓储、FTS5、legacy_v2
packages/core/           # @celery/core 共享业务内核（实体/校验/排序/模板/统计）
packages/data/           # @celery/data Repository 契约 + v3 导出格式 + 内存适配器
packages/test-contracts/ # @celery/test-contracts 共享契约测试套件
packages/ui-tokens/      # @celery/ui-tokens 跨端设计 token（CSS 变量 + TS 常量）
scripts/                 # 仓库级脚本（check-repo-health、generate-mobile-icons、
                         #   inject-android-signing）
.github/workflows/       # ci.yml、desktop-e2e.yml、desktop-release.yml、mobile*.yml
```

## Commands

Package manager is **bun**（根 `packageManager` 声明）。根脚本经 Turbo /
`bun run --filter` 委托到各 workspace。在仓库根执行：

```bash
bun install                 # 安装 workspace 全量依赖
bun run build               # turbo：tsc + vite（renderer 构建；唯一的 typecheck 门禁）
bun run lint                # eslint（所有包，--max-warnings 0）
bun run format              # prettier（apps/*/src、packages/*/src）
bun run test:run            # 所有 TS 包单测
bun run typecheck           # turbo：各包 tsc --noEmit
bun run desktop:dev         # Tauri 桌面端开发（弹真实窗口，勿在无人值守时跑）
bun run desktop:build       # Tauri 打包（release 慢，lto 全开）
cargo test -p celery-db     # Rust 数据层测试 + 重新生成 TS 绑定
cargo check -p celery-desktop  # Tauri 宿主 crate 编译检查
```

## Architecture（数据流与边界）

```text
React renderer（apps/desktop/src）
  │  components → hooks → zustand stores
  ▼
src/utils/dataGateway.ts        # v3 Repository 契约实现（order↔rank、
  │                             #   deletedAt↔archivedAt 映射；分页抽取上限 1.2 万行）
  ▼
@celery/data 契约 → createTauriRepositories() → Tauri commands
  │                                                        │
  ▼                                                        ▼
crates/celery-db（SQLite：projects · todos · archived_todos ·   apps/cli（celery）
  settings · schema_migrations · FTS5）                        同一数据库
  │
  └─ 写事务后广播 data-changed（renderer 按窗口 label 过滤自发事件；
     CLI 写入经 cli_notify.rs 回环 TCP 触发同一广播）
```

- **分层**：Components → Hooks → Zustand stores → `dataGateway.ts` → Repository
  契约。Store 直接调 gateway，不要再加第二层抽象。平台耦合（托盘/贴图/自启/
  更新/存储）一律收敛在 `src/platform`（能力开关 `capabilities`，浏览器/测试
  环境为 no-op 桩 + UI 门槛隐藏）。
- **schema 真源在 Rust**：改表结构在 `crates/celery-db` 加迁移；改 Rust DTO 后
  必须跑 `cargo test -p celery-db` 重新生成 `packages/data/src/generated/` 的
  TS 绑定并提交，CI 有漂移检查。
- **共享类型改动的闸门**：凡改 `packages/core` 的共享类型（尤其给 `AppSettings`
  加必填字段），本地必须跑**根** `bun run build`（turbo 全量 typecheck），
  单包 `tsc --noEmit` 不算数——多个 workspace 同时消费这些类型。
- **数据目录**：桌面端与 CLI 共用 `%APPDATA%/com.celery.todo`（经
  `celery_db::storage_config` 解析 `storage-config.json` 自定义目录；该文件
  恒在 appData 根）。SQLite 默认不加密；无云同步。
- **移动端是独立应用**：expo-sqlite 适配同一套 Repository 契约，但数据只存
  本机、与桌面端互不相通、无导入关系。Windows 本机 bun 链接 RN 依赖树会失败，
  故 `apps/mobile` 独立于根 workspace（依赖 `file:` 指向共享包）；类型检查由
  `mobile.yml` 在 ubuntu CI 强制（无 push 触发，直接 push main 会跳过——改完
  本地 `bun run typecheck`）。见 `apps/mobile/README.md`。

## Testing strategy

- **Vitest 单测/组件测试**（`apps/desktop/src/test/` + 各 packages）— jsdom，
  快；改哪个域就跑哪个文件：`cd apps/desktop && bunx vitest run src/test/xxx.test.tsx`。
  网关映射层测试经 `configureDataGateway` 注入内存适配器，不依赖 Tauri。
- **共享契约测试**（`packages/test-contracts`）— 内存适配器已接入；新适配器
  实现后挂同一套。
- **Rust 测试** — `cargo test -p celery-db`（含 ts-rs 绑定再生成）。
- **WebdriverIO Tauri E2E**（`apps/desktop/e2e/`）— 目前仅 Linux + xvfd 4 条
  冒烟（`desktop-e2e.yml`，手动触发）。E2E 会启动真实应用窗口，日常开发不要
  本地跑，交给 CI。
- **移动端无自动化测试**（CI 只 tsc）；所有 mobile 修复依赖真机手动验证。

## Conventions

- **注释以中文为主**；用户可见文案保持中文。
- TypeScript `strict`；接口 CamelCase、DB 列 snake_case（Rust 侧）。`@/*`
  alias 映射 `apps/desktop/src/*`，优先用 alias 而非深层相对路径。
- ESLint 把 `no-explicit-any` / unused-vars 设为 warn，但 CI 门禁
  `--max-warnings 0`——新代码不得引入任何 warning。
- 格式交给 Prettier：跑 `bun run format`，不要手调格式。
- 批量操作（`addTodosBulk`、`batchAction`、`deleteTodos`）已存在——复用它们，
  不要循环单条操作。
- 键盘快捷键集中在 `useKeyboardShortcuts()`。

## Versioning

三类版本号（App / DB schema / 导出格式）完整策略见
[`VERSIONING.md`](./VERSIONING.md)。要点：

- **App 版本单一源 = `apps/desktop/src-tauri/tauri.conf.json` 的 `version`**，
  与根 `Cargo.toml` 的 `[workspace.package] version` **手动同步**（无自动校验）。
  Renderer 经 vite `define` 读到 `APP_VERSION`。workspace 各 package.json 的
  version 仅作展示对齐。
- **DB schema 版本** = `crates/celery-db` 的 `schema_migrations`（v1 起）。
  任何 schema 变更必须走 Rust 迁移并重新生成 TS 绑定；不可逆迁移配 MAJOR bump。
- **导出格式版本** = `packages/data/src/export-format.ts` 的
  `V3_EXPORT_FORMAT_VERSION`（格式标识 `celery-todo/v3`，旧 2.x JSON 拒绝）。

### GitHub release pipeline

- 发版手动流程：改 `tauri.conf.json` + 根 `Cargo.toml` 两处版本 → 收敛
  `CHANGELOG.md` 的 `[Unreleased]` → **同一 commit 更新 README 的下载链接与
  安装包文件名**（如 `Celery.Todo_3.4.3_x64-setup.exe`）→ 提交、打 `v3*`
  tag 推送。`desktop-release.yml` 按 tag 构建 Win/macOS/Linux 安装包 +
  `celery.exe` + Android APK（`expo.version`/`versionCode` 按 tag 自动同步），
  附到同一 Release。iOS / Play 商店走 EAS 线 `mobile-release.yml`（手动）。
- 不要在红 CI 上打 tag；`desktop-release.yml` 自身不重跑测试。

## Tauri / Rust gotchas

- **同步命令/菜单回调里绝不能建 WebviewWindow（wry#583）**——会冻结全部 IPC，
  症状像各种数据 bug。Windows 建窗必须离开主线程（`stickers.rs` 已按此实现）；
  `quit_app` 的看门狗防退出死锁，不要移除。
- **updater（reqwest）不读 Windows 系统代理**：设置页「网络代理」三键经
  `proxy.rs` 映射为 HTTP(S)_PROXY 环境变量并即时生效，否则国内直连 GitHub
  超时。
- **外链跳转**：markdown 链接无 target 会整页导航，须 `platform` 的
  `bindExternalLinks` 全局拦截走默认浏览器；opener 注入脚本只拦
  `target=_blank`；缺 `opener:default` capability 时所有 `open_url` 被静默
  拒绝（含 `_blank`）。
- **自定义数据目录切换** = checkpoint WAL → 拷贝 → 写 `storage-config.json` →
  旧库重挂，失败回滚（`storage.rs`）；`storage-config.json` 与
  `cli_notify` 发现文件恒在 appData 根，不随数据目录迁移。
- **窗口状态记忆**（`window_state.rs`）：主窗 rect + 最大化标记 + 贴图清单，
  400ms debounce；最小化状态不得持久化（否则下次启动窗口跑出屏幕外）。
- **bun linker 固定 hoisted**（`bunfig.toml`）：历史原因是（已删除的）2.x
  electron-builder 依赖收集；现保留以避免整套 workspace 重新洗牌
  node_modules。不要随手改回 isolated。
- `apps/desktop` 的 `vite.config.ts` 从 `tauri.conf.json` 读版本号注入
  `__APP_VERSION__`；vitest 的 include/exclude 也在该文件里，E2E 目录不会
  被单测误捡。

## 2.x 存量数据承接（legacy_v2）

`crates/celery-db` 的 `legacy_v2` 模块负责导入 2.x 旧库：

- `inspect_v2(path)` 永不抛错，所有问题进报告；`CeleryDb::import_from_v2`
  以只读 ATTACH 挂载源库后在目标 v3 库单事务转换（失败整体回滚、可重试）。
- `detect_v2_source()` 自动探测 2.x 默认目录与 `storage-config.json` 自定义目录。
- 只认 `dataVersion` 4–9；活跃事项孤儿引用终止导入；归档保留项目名快照；
  设置按白名单导入（主题/模板/视图/`sort.*`），OS 级状态跳过。
- 桌面端入口：`legacy_v2_*` Tauri 命令 + `@celery/data` 的
  `LegacyV2ImportService` + 首启导入横幅（仅空库时出现）。
- 2.x 数据真机位置：`%APPDATA%/celery-todo/data`（排查导入问题先看这里）。

## Read before editing sensitive areas

- `apps/desktop/src/utils/dataGateway.ts` — Repository 契约实现与全部映射层。
- `apps/desktop/src/store/useTodoStore.ts` — 最复杂的 store（归档、批量、
  筛选、排序）。
- `apps/desktop/src-tauri/src/commands.rs` — Tauri 命令面；改命令时同步
  `tauri-repositories.ts` 与（若涉及 DTO）Rust 侧绑定再生成。
- `apps/desktop/src/platform/index.ts` — 平台能力开关与降级桩。
- `apps/desktop/src/store/useSettingsStore.ts` — K/V 持久化读取层：新增设置
  字段要在这里补缺失键回退，并跑根 `bun run build`。
- `apps/desktop/e2e/wdio.conf.ts` — E2E 启动约定。
- `apps/mobile/README.md` — 移动端架构与关键约束（独立依赖树、无自动化测试）。
