# AGENTS.md

Workspace instructions for ZCode agents working in `celery-todo`.
For deeper background see `README.md` and `CLAUDE.md` (Chinese + English).

## 3.0 跨端重构（进行中，分支 `refactor/3.0-monorepo`）

仓库正按「Celery Todo 3.0 跨端重构计划」迁移为 Bun workspaces + Turborepo
monorepo。**除本节外，本文件其余章节描述的是 2.x Electron 应用** —— 它已整体迁入
`apps/desktop-electron/`，作为迁移对照壳保留到 Tauri 端达到功能基线为止。阅读旧章节时，
把 `src/…`、`electron/…`、`cli/…`、`e2e/…`、`public/…`、`build/…` 一律读作
`apps/desktop-electron/` 下的同名目录。

已完成阶段（每个阶段一个 commit，全部保持构建/测试绿色）：

1. **Monorepo 骨架** —— Bun workspaces（`apps/*`、`packages/*`）+ Turborepo
   （`turbo.json`）。根 `package.json` 是版本号唯一源；`scripts/bump-version.mjs`
   发版时同步所有 workspace 包的 `version` 字段。
2. **共享内核 `packages/core`（`@celery/core`）** —— 实体、校验、计划日期、排序、
   模板、统计、v2 导入导出规则（76 个单测）。Electron 壳经 `@/types`、`@/utils/*`
   兼容 shim 消费，应用内既有 import 未改动。
3. **v3 数据层**：
   - `crates/celery-db`（Rust）—— 全新 `schema_migrations` v1 起（不复用 2.x
     `settings.dataVersion`）；`projects` / `todos` / `archived_todos`（原
     `deleted_todos`，无 `expires_at`）/ `settings` / FTS5 trigram 全文索引；
     WAL + 外键 + busy_timeout；游标分页；批量写单事务。43 个 Rust 测试。
   - `packages/data`（`@celery/data`）—— Repository 契约（todos/projects/settings +
     ChangeFeed）、v3 导出格式（`celery-todo/v3`，旧 JSON 明确拒绝）、内存适配器。
     DTO 类型由 ts-rs 从 Rust 生成到 `src/generated/`（**改 Rust DTO 后必须
     `cargo test -p celery-db` 重新生成并提交**，CI 有漂移检查）。
   - `packages/test-contracts`（`@celery/test-contracts`）—— 共享契约测试套件
     （16 条），内存适配器已接入；Tauri / Expo 适配器完成后挂同一套。
4. **Tauri 桌面骨架 `apps/desktop`（`@celery/desktop`）** —— Tauri 2 + React/Vite，
   29 个强类型命令薄封装 celery-db（`src-tauri/src/commands.rs`），renderer 经
   `createTauriRepositories()` 走 Repository 契约（`src/lib/tauri-repositories.ts`）。
   骨架 UI 验证全链路；正式 UI 沿用 2.x 信息架构迁移是后续里程碑。

3.0 关键命令（根目录执行）：

```bash
cargo test -p celery-db          # Rust 单测 + 重新生成 TS 绑定
cargo check -p celery-desktop    # Tauri 宿主 crate 编译检查
bun run desktop:dev              # Tauri 桌面端开发（弹真实窗口，勿在无人值守时跑）
bun run desktop:build            # Tauri NSIS 打包（release 慢，lto 全开）
bun run test:run                 # turbo：所有 TS 包的单测
bun run build                    # turbo：renderer/electron 壳/桌面端构建
```

5. **2.x 旧库导入（计划第 6 步后端）** —— `celery-db` 的 `legacy_v2` 模块：
   `inspect_v2(path)` 永不抛错、所有问题进报告；`CeleryDb::import_from_v2` 以
   只读 ATTACH 挂载源库后在目标 v3 库单事务转换（失败整体回滚、可重试）；
   `detect_v2_source()` 自动探测 2.x 默认目录与 `storage-config.json` 自定义目录。
   只认 `dataVersion` 4–9；活跃事项孤儿引用终止导入；归档保留项目名快照；
   设置按白名单导入（主题/模板/视图/`sort.*`），OS 级状态跳过。9 项专项测试。
   桌面端已接：`legacy_v2_*` Tauri 命令 + `@celery/data` 的
   `LegacyV2ImportService` + 骨架 UI 的首启导入横幅（仅空库时出现）。
6. **Rust CLI（`apps/cli`，binary 名 `celery`）** —— clap 子命令
   `status/projects/list/add/done/archive`，复用 celery-db、与桌面端同一
   `%APPDATA%/com.celery.todo/celery-v3.db`；id 支持前缀匹配。CLI 写入后的
   桌面实时刷新（本地 IPC）待桌面 UI 里程碑接入。
7. **`packages/ui-tokens`（`@celery/ui-tokens`）** —— 从 2.x 提取的跨端设计
   token：coral/sand/ink 色阶、light/dark/celery 三主题语义色、Poppins/Lora
   字体栈、4px 间距、圆角/阴影/动效；`tokens.css`（CSS 变量）+ TS 常量双形态。
8. **Expo 移动端骨架（`apps/mobile`）** —— expo-sqlite 适配器实现同一套
   Repository 契约（v3 schema 同构、搜索用 LIKE、游标分页），骨架 UI 消费
   `@celery/ui-tokens`。**独立于根 workspace**（Windows 本机 bun 链接 RN
   长路径依赖树失败），依赖用 `file:` 指向共享包；类型检查由
   `.github/workflows/mobile.yml` 在 ubuntu CI 强制。见 `apps/mobile/README.md`。
9. **正式桌面 UI 迁移·阶段 A（renderer 主体）** —— 2.x 的组件/hooks/stores
   整体迁入 `apps/desktop`（Tailwind 3 + globals.css + 字体栈原样保留），
   `src/utils/dataGateway.ts` 重写为 v3 Repository 契约实现（`order`↔`rank`、
   `deletedAt`↔`archivedAt` 映射；分页抽取上限 1.2 万行防御）；App.tsx 拆分为
   `src/app/`（启动/跨窗口同步/全局搜索/导入导出四个 hook + 自绘标题栏 +
   首启导入横幅）。平台耦合收敛到 `src/platform`（能力开关 `capabilities`，
   托盘/贴图/自启/更新/存储迁移未点亮前以 no-op 桩 + UI 门槛隐藏）。
   配套 Rust：`replace_all`/`reset_db`（v2 JSON 全量导入单事务）、
   `archived_count`/`incomplete_counts` 聚合、写命令后 `data-changed` 广播
   （renderer 按窗口 label 过滤自发事件）。单测 51 项（含网关映射层 8 项，
   经 `configureDataGateway` 注入内存适配器）。**阶段 B 待做**：托盘、多贴图
   窗口、自启、窗口状态记忆、tauri-plugin-updater、原生保存对话框导出。

尚未实施的计划阶段：移动端正式 UI（Expo
Router 四入口、滑动/长按/原生拖拽）、CLI→桌面 IPC 刷新、WebdriverIO
Tauri E2E、性能夹具基线、三平台发布流水线（Tauri 签名更新 manifest、
EAS Build/Submit）。
SQLite 默认不加密；无云同步，各设备数据独立。

## Project purpose

Celery Todo — an Electron desktop todo app (React 18 + TypeScript + Tailwind).
All data is stored locally via SQLite compiled to WASM (`sql.js`) and persisted
to IndexedDB. Multi-project, drag-and-drop, recycle bin, system tray, themes.

## Major directories

```
apps/desktop-electron/   # 2.x Electron 应用（迁移对照壳）：内含原 electron/、src/、
                         # cli/、e2e/、public/、build/、assets/ 与应用级 scripts/
apps/desktop/            # 3.0 Tauri 2 桌面端（React/Vite renderer + src-tauri 命令层）
packages/core/           # @celery/core 共享业务内核（实体/规则，平台无关）
packages/data/           # @celery/data Repository 契约 + v3 导出格式 + 内存适配器
packages/test-contracts/ # @celery/test-contracts 共享契约测试套件
crates/celery-db/        # v3 SQLite 数据层（Rust）：schema、迁移、仓储、FTS5
scripts/                 # 仓库级脚本（bump-version、check-repo-health、extract-changelog、
                         # generate-icons —— 图标产物写入 apps/desktop-electron/public）
.github/workflows/       # ci.yml（lint/test/build + Rust 任务）、e2e.yml、release.yml
```

## Commands

Package manager is **bun** (declared via `packageManager` in package.json).
根脚本经 Turbo / `bun run --filter` 委托到各 workspace；应用级脚本在
`apps/desktop-electron/package.json`。在仓库根执行：

```bash
bun install                 # install deps（workspace 全量）
bun run dev                 # 2.x 壳 Vite dev server (http://localhost:5173)
bun run build               # turbo：tsc + vite（壳与桌面端 renderer）
bun run lint                # eslint（所有包，--max-warnings 0）
bun run format              # prettier（apps/*/src、packages/*/src）
bun run test:run            # 所有 TS 包单测
bun run e2e                 # 2.x 壳 Playwright E2E（完整套件，禁日常本地跑）
bun run cli                 # 2.x 壳 Node CLI
cargo test -p celery-db     # 3.0 Rust 数据层测试 + 生成 TS 绑定
```

Electron 壳专属（也可在根经同名委托脚本调用）：`electron:dev`、`build:electron`、
`electron:build`、`build:cli`、`test:cli`、`rebuild:electron`。

There is no standalone `typecheck` script — `bun run build` (and
`build:electron`) run `tsc -b`, which is the typecheck gate.

## Testing strategy

Two test layers, kept strictly separate:

- **Vitest unit/component tests** (`src/test/`) — fast, run in jsdom, no
  Electron. `vite.config.ts` scopes vitest to `src/**` and excludes `e2e/`, so
  the Playwright specs are never picked up by vitest.
- **Playwright Electron E2E** (`e2e/`) — drives the *real* packaged app via
  `_electron.launch()`. Each test gets an isolated `userData` dir through the
  `CELERY_TODO_USERDATA` env hook in `electron/main.ts` (which also disables
  `requestSingleInstanceLock` and sets a unique `app.name` in test mode). See
  the "E2E testing" section below.

### Run only the specs you need

**严禁运行 `bun run e2e`（完整套件）。** 每个 E2E test 都启动一个独立 Electron 进程并冷加载
sql-wasm.wasm，完整套件耗时 ~6-8 分钟，严重拖累效率。只跑与改动相关的 spec：

```bash
bunx playwright test e2e/todos.spec.ts                  # 单个文件
bunx playwright test e2e/todos.spec.ts e2e/projects.spec.ts   # 多个相关文件
bunx playwright test -g "拖拽"                            # 按名称关键词（跨文件）
bunx playwright test -g "回收站|删除"                       # regex
bunx playwright test --last-failed                        # 仅上次失败项
bunx playwright test e2e/filters.spec.ts --headed         # 看显式窗口运行
```

### Change-area → spec map

| Changed area | Run this spec |
|---|---|
| `src/components/todos/` | `e2e/todos.spec.ts` |
| `src/components/filters/` | `e2e/filters.spec.ts`, `e2e/search.spec.ts` |
| `src/components/projects/` | `e2e/projects.spec.ts` |
| `src/components/recycle/` | `e2e/recycle.spec.ts` |
| `src/components/settings/` | `e2e/settings.spec.ts` |
| `src/utils/export.ts` / import-export | `e2e/import-export.spec.ts` |
| `src/hooks/useKeyboardShortcuts.ts` | `e2e/keyboard.spec.ts` |
| `src/components/common/NotificationPanel.tsx` | `e2e/notifications.spec.ts` |
| dnd-kit drag-and-drop | `e2e/dnd.spec.ts` |
| `electron/main.ts` / startup flow | `e2e/app.spec.ts` |
| Cross-cutting (database.ts, stores, App.tsx, types) | 依次运行最相关的 3-4 个 spec，不要跑全量 |
| `cli/**` | 不跑 E2E —— CLI 与 Electron 无关。跑 `bun run test:cli` |

When in doubt about blast radius (e.g. touching `database.ts`, a Zustand store,
`App.tsx`, or shared types), 根据改动涉及的功能域选 3-4 个最相关的 spec，
不要跑全量套件（参见禁止完整套件的规定）。

> **CLI 隔离**：`cli/` 有独立的 `tsconfig.json` 与 `vitest.config.ts`，不进入
> 根 `tsc -b` 与主 vitest。改动 CLI 源码只需 `bun run build:cli` + `bun run test:cli`，
> 不会影响 renderer/electron 构建，也无需跑 Playwright。`better-sqlite3` / `commander` /
> `tsx` 全部是 devDependencies，绝不进 electron-builder 打包（`build.files` 不含 `dist-cli`）。

## Data flow

```
React Components
  │  (Header, TodoList, ProjectSidebar, SettingsPanel, …)
  ▼
Custom Hooks        useTodos, useProjects, useFilter, useTheme, …
  ▼
Zustand Stores      useTodoStore, useProjectStore,
  │                 useSettingsStore, useNotificationStore
  ▼
SQLite (sql.js WASM)   src/utils/database.ts
  │                     └─ IndexedDB persistence
  ▼
Tables: projects · todos · deleted_todos · settings · notifications
```

## Database schema

```
projects:        id, name, color, created_at, updated_at
todos:           id, project_id, title, description, completed, priority,
                 due_date, created_at, updated_at, completed_at, sort_order
deleted_todos:   same as todos + deleted_at, expires_at   (30-day recycle bin)
settings:        key, value                                 (K/V store)
notifications:   id, type, title, message, todo_id, created_at, read
```

## Architecture boundaries

- Layering follows the data flow above: **Components → Hooks → Zustand stores
  → `src/utils/database.ts`**. Stores call database functions directly; do not
  add a second abstraction layer.
- Database is the single source of truth. `database.ts` exposes typed helpers
  plus `rowToTodo()` / `rowToProject()` mappers from snake_case DB rows to
  camelCase TS interfaces. Keep new columns/snake_case on the DB side and map.
- Saving is debounced (500ms) into IndexedDB; `flushSave()` forces a write.
  Anything that mutates the DB should go through the existing store actions so
  the debounced save fires.
- Multi-project: every todo has `project_id`; switching project calls
  `useTodoStore.getState().loadProject(projectId)`. A default project is created
  automatically — don't assume an empty DB.
- Recycle bin: deletes move rows to `deleted_todos` with a 30-day `expires_at`;
  restore moves them back. Auto-cleanup uses `expires_at`.
- Electron main process (`electron/main.ts`) handles window/tray/auto-start;
  `electron/preload.ts` is the IPC bridge; `electron/tray.ts` the system tray.
  Window position is persisted to `window-state.json` in userData. Touching IPC
  = touch both preload and main. `main.ts` also has a test-only hook: if
  `CELERY_TODO_USERDATA` is set (only by E2E), it redirects userData, sets a
  unique `app.name`, and skips the single-instance lock — production behavior
  is unchanged. Don't remove this without updating `e2e/helpers.ts`.

## Conventions

- **Comments are primarily Chinese.** Match existing Chinese comment style in
  `.ts`/`.tsx` files when editing; user-facing strings stay Chinese.
- TypeScript: `strict` on. CamelCase for interfaces, snake_case for DB columns.
  `@/*` path alias maps to `src/*` (configured in tsconfig.json) — prefer it for
  imports over deep relative paths.
- ESLint treats `@typescript-eslint/no-explicit-any` and unused-vars as warn;
  CI gate is `--max-warnings 0`, so new code must not introduce warnings.
- Prettier handles formatting; run `bun run format` rather than hand-formatting.
- Bulk operations exist (`addTodosBulk`, `batchAction`, `deleteTodos`) — reuse
  them instead of looping single-item ops.
- Keyboard shortcuts are centralized in `useKeyboardShortcuts()`.

## Versioning

Three independent version numbers coexist; full policy in [`VERSIONING.md`](./VERSIONING.md).

- **App version** — `package.json` `version` (SemVer). Single source of truth.
  Renderer reads it via `import { APP_VERSION } from '@/utils/version'`
  (injected by `vite.config.ts` `define`); Electron main reads `app.getVersion()`.
  Releases go through `bun run bump -- <patch|minor|major>` (see
  `scripts/bump-version.mjs`), which also updates `CHANGELOG.md` and creates an
  annotated `vX.Y.Z` tag. Don't bump `package.json:version` by hand.
- **DB schema version** — `DB_VERSION` in `src/utils/database.ts`. **Any schema
  change MUST bump `DB_VERSION` and add a migration row.** Persisted as
  `settings.dataVersion`. Irreversible migrations require a MAJOR App bump.
- **Export format version** — `EXPORT_FORMAT_VERSION` in `src/utils/export.ts`.
  Bump when the JSON export structure changes. Do **not** confuse with
  `DB_VERSION` (one describes tables, the other describes files).

### GitHub release pipeline

- Pushing a `v*` tag triggers `.github/workflows/release.yml`, which builds the
  NSIS installer on `windows-latest`, extracts the matching section from
  `CHANGELOG.md` via `scripts/extract-changelog.mjs`, and creates a GitHub
  Release with those notes + the built artifacts.
- One-shot release command: `bun run bump -- <patch|minor|major> --push` —
  bumps version, writes CHANGELOG, commits, tags, pushes both, and CI takes
  over. Workflow requires repo Settings → Actions → Workflow permissions =
  "Read and write permissions".
- The workflow fails fast if `package.json:version` ≠ the pushed tag, so the
  two cannot drift. See `VERSIONING.md` §8 for the full chain diagram.

## Electron / build gotchas

- Electron sources compile with a **separate** `electron/tsconfig.json`
  (`module: CommonJS`, `outDir: ../dist-electron`). After every electron TS
  build, `scripts/fix-electron-cjs.mjs` writes `dist-electron/package.json`
  with `{ "type": "commonjs" }` so Node loads it as CJS. If you change the
  electron build pipeline, keep that step — Electron's `main` field points at
  `dist-electron/main.js`.
- `package.json` `"type": "module"` applies to the renderer/Vite side; the
  Electron build is forced CJS as above. Don't mix `import`/`require` across the
  boundary without going through the build step.
- `tsconfig.json` has `noEmit: true` and uses project references
  (`tsconfig.node.json` for Vite config). `tsc -b` is the canonical build; don't
  call `tsc` directly without `-b`.
- `sql.js` WASM is loaded via `import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`
  in `src/utils/database.ts`. Vite resolves it from `node_modules` in dev and
  emits a hashed asset in prod — **don't** hand-copy a `sql-wasm.wasm` into
  `public/`; that creates a stale duplicate that drifts from the JS glue layer
  on every `sql.js` upgrade.
- electron-builder config is inlined in `package.json` (`build` field). Windows
  target is NSIS; output goes to `release/`.
- Windows 无框窗口（`titleBarStyle: 'hidden'` + `titleBarOverlay`）在拖拽改窗口
  大小时，OS 会在右上角绘制一个尺寸提示框（如 "1200 × 800"），与 overlay 的
  最小化按钮位置重叠。这是 Windows + Chromium 的已知行为
  ([electron/electron#943](https://github.com/electron/electron/issues/943))，
  非 React 元素、Electron 亦无 API 可隐藏。如需消除，唯一选项是 `thickFrame: false`，
  代价是失去拖拽窗口边缘改大小的能力 —— 当前选择保留原生 resize，故仅作记录。

## E2E testing (Playwright Electron)

Specs in `e2e/` drive the real packaged Electron app (not a browser). Before
adding or editing E2E tests, read `e2e/helpers.ts` and keep these conventions:

- **`launchApp()` / `closeApp()`** from `e2e/helpers.ts` are the only sanctioned
  way to start/stop the app. `beforeEach` → `launchApp()`, `afterEach` →
  `closeApp()`. Never call `electron.launch` / `app.close()` directly.
- **Default focus mode**: the app boots into focus mode (sidebar/Header/FilterBar
  hidden). `launchApp()` already presses `Ctrl+P` to exit it; don't re-exit in
  tests unless you're specifically testing focus mode.
- **Selectors**: the app has no `data-testid`. Use semantic locators
  (`getByRole`, `getByPlaceholderText`, `getByLabel`) and exact text. Many
  hover-only buttons (row actions, sidebar collapse handle) need `.hover()`
  first or `{ force: true }`. Scope multi-match locators to their container
  (e.g. a project row, the settings dialog) with `.filter({ has: ... })`.
- **ConfirmDialog**: press `Enter` to confirm / `Escape` to cancel (the dialog
  listens for both). Don't try to click the confirm button — its text collides
  with row-level buttons.
- **dnd-kit drag**: use keyboard `Space` (pick up) → `ArrowUp/Down` → `Space`
  (drop) on the drag handle, not mouse simulation. Switch sort to `manual`
  first for todos, otherwise the sort algorithm overwrites the reorder.
- **Exports** (`<a download>` + Blob) don't reliably fire Playwright's download
  event in Electron. `e2e/import-export.spec.ts` monkey-patches
  `HTMLAnchorElement.prototype.click` to capture content; reuse that helper.
- **Persistence**: DB writes are debounced 500ms. Before reloading or asserting
  cross-restart state, `waitForSave()` or press `Ctrl+S` (`flushSave`).
- **CI**: `.github/workflows/e2e.yml` runs the full suite on `windows-latest`
  for PRs. Local cold-start can flake (one known instance: the "首次启动" test
  when a zombie electron process lingers); `playwright.config.ts` sets
  `retries: 1` locally / `2` on CI as a safety net.

## Read before editing sensitive areas

- `src/utils/database.ts` — schema, migrations, and all data access.
- `src/store/useTodoStore.ts` — most complex store (recycle bin, bulk ops,
  filtering, sorting).
- `electron/main.ts` + `electron/preload.ts` — IPC surface; any change must be
  mirrored on both sides and recompiled via `build:electron` / `electron:dev`.
- `electron/install-options.ts` + `build/installer.nsh` — NSIS 自定义安装页
  与主进程的"一次性信箱"协议。`installer.nsh` 在用户勾选「使用自定义设置」
  时把选择写入 `userData/install-options.json`，`install-options.ts` 在
  `app.whenReady` 早期读取、应用、删除。**任何字段重命名/增删都要同步两边**，
  且 NSIS 改动**必须本地 `bun run electron:build` 一次跑通 Setup.exe 才能合**
  （vitest 无法覆盖 NSIS 脚本本身；只有 `normalizeInstallOptions` 纯函数有单测）。
  升级场景下 `${isUpdated}` 宏自动跳过自定义页，不要破坏 PRE 函数里的 Abort。
- `electron/updater.ts` — auto-update (electron-updater) integration: events
  broadcast to the renderer, `app.isPackaged` short-circuit for dev, and
  IPC channels consumed by `src/hooks/useAutoUpdate.ts`. Touching the
  updater = mirror changes in main, preload, and `src/types/global.d.ts`.
- `e2e/helpers.ts` — `launchApp`/`closeApp`, the `CELERY_TODO_USERDATA` env
  hook contract with `electron/main.ts`, and shared selector/interaction
  helpers that every spec depends on.
- `vite.config.ts` — dev server, alias, plugin setup, and the vitest
  include/exclude that keeps E2E specs out of unit-test runs.
- `cli/src/storage.ts` + `cli/src/db.ts` — the CLI's mirror of the app's
  storage-path resolution and DB schema. Any change to `electron/storage.ts`,
  the DB schema (`src/utils/database.ts` createTables / `DB_VERSION`), or the
  Todo/Project types must be reflected here too. The CLI does **not** run
  migrations — it assumes an already-initialized DB, so it must track schema
  changes by hand. See `cli/README.md` §架构 / 关键约束.
