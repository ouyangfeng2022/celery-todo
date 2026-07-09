# AGENTS.md

Workspace instructions for ZCode agents working in `celery-todo`.
For deeper background see `README.md` and `CLAUDE.md` (Chinese + English).

## Project purpose

Celery Todo — an Electron desktop todo app (React 18 + TypeScript + Tailwind).
All data is stored locally via SQLite compiled to WASM (`sql.js`) and persisted
to IndexedDB. Multi-project, drag-and-drop, recycle bin, system tray, themes.

## Major directories

```
electron/        # Main process (main.ts, preload.ts, tray.ts, types.ts)
src/components/  # React UI grouped by domain: common, filters, layout,
                 # projects, recycle, settings, stats, todos
src/hooks/       # Custom hooks that wrap stores for components
src/store/       # Zustand stores: useTodoStore, useProjectStore,
                 # useSettingsStore, useNotificationStore
src/utils/       # database.ts (SQLite layer), export.ts, helpers.ts
src/types/       # Shared TS types
src/test/        # Vitest specs + setup
e2e/             # Playwright Electron E2E specs + helpers + fixtures
public/          # Static assets incl. sql-wasm.wasm
scripts/         # Build helpers (fix-electron-cjs.mjs, verify-render.mjs)
```

## Commands

Package manager is **bun** (declared via `packageManager` in package.json).

```bash
bun install                 # install deps
bun dev                     # Vite dev server only (web), http://localhost:5173
bun run electron:dev        # build electron TS + run Vite + launch Electron
bun run build               # tsc -b && vite build (React only)
bun run build:electron      # add Electron TS build + fix-electron-cjs
bun run electron:build      # full installable build (electron-builder → release/)
bun run lint                # eslint, --max-warnings 0
bun run format              # prettier on src/**/*.{ts,tsx,css}
bun test                    # vitest watch
bun run test:run            # vitest run once
bun run test:coverage       # vitest + coverage
bun run e2e                 # Playwright Electron E2E (full suite)
bun run e2e:headed          # ...with visible Electron window
bun run e2e:debug           # step-through debug
bun run e2e:report          # open HTML report
bun run e2e:install         # install Playwright chromium
```

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

When in doubt about blast radius (e.g. touching `database.ts`, a Zustand store,
`App.tsx`, or shared types), 根据改动涉及的功能域选 3-4 个最相关的 spec，
不要跑全量套件（参见禁止完整套件的规定）。

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
- `public/sql-wasm.wasm` must ship with the app — it's loaded at runtime by
  sql.js. Don't remove it from `public/`.
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
- `electron/updater.ts` — auto-update (electron-updater) integration: events
  broadcast to the renderer, `app.isPackaged` short-circuit for dev, and
  IPC channels consumed by `src/hooks/useAutoUpdate.ts`. Touching the
  updater = mirror changes in main, preload, and `src/types/global.d.ts`.
- `e2e/helpers.ts` — `launchApp`/`closeApp`, the `CELERY_TODO_USERDATA` env
  hook contract with `electron/main.ts`, and shared selector/interaction
  helpers that every spec depends on.
- `vite.config.ts` — dev server, alias, plugin setup, and the vitest
  include/exclude that keeps E2E specs out of unit-test runs.
