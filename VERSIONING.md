# 版本号管理策略

本项目同时维护**三类版本号**，语义相互独立，互不替代。本文档定义它们的职责、变更时机与发版流程。

---

## 1. 三类版本号

| 版本号 | 类型 | 单一源 | 用途 |
| --- | --- | --- | --- |
| **App 版本** | SemVer 字符串（`MAJOR.MINOR.PATCH`） | `package.json` 的 `version` 字段 | 用户可见的发行版本。打 git tag、写入安装包、展示在「设置 → 关于」与系统托盘 tooltip。 |
| **DB schema 版本** | 单调递增正整数 | `src/utils/database.ts` 的 `DB_VERSION` | SQLite 表结构迁移门控。持久化在 `settings.dataVersion`，应用启动时据此决定是否跑迁移。 |
| **导出格式版本** | 单调递增正整数 | `src/utils/export.ts` 的 `EXPORT_FORMAT_VERSION` | JSON 导入/导出文件的兼容性标识。导出时写入 `version` 字段；导入时据此决定能否解析。 |

> **关键区分**：DB schema 版本与导出格式版本**不共用**一个数值。
> 一个描述「数据库表怎么建」，另一个描述「磁盘上的 JSON 长什么样」。
> 修改 schema 不必动导出格式，反之亦然。早期代码曾把 `DB_VERSION` 直接写进导出元数据，
> 这层耦合已在引入 `EXPORT_FORMAT_VERSION` 时拆开。

---

## 2. App 版本号（SemVer）

格式遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

```
MAJOR.MINOR.PATCH
   1     .  2  .  3
```

### 触发条件

| 递增 | 何时使用 |
| --- | --- |
| **MAJOR** | 数据格式不兼容（旧版本无法读取新导出文件）；DB schema 不可逆迁移；快捷键、UI 模型出现大面积重构，需要用户重新学习。 |
| **MINOR** | 向后兼容的新功能：新增数据库列并带默认值、新增组件/设置项、新增导出字段（旧解析器可忽略）。 |
| **PATCH** | Bug 修复、UI 微调、文案修改、性能优化、依赖升级。 |

判据一句话：**「老用户的数据库与导出文件，新版本还能不能打开？」**
- 不能打开 → MAJOR。
- 能打开但语义有变化 → MINOR。
- 完全无关 → PATCH。

### 单一源

`package.json` 的 `version` 是 App 版本号的唯一可信源。三处消费方各取所需：

- **Renderer 进程**：`vite.config.ts` 在构建期通过 `define` 把版本号注入为 `__APP_VERSION__` 全局常量，再由 `src/utils/version.ts` 统一对外暴露为 `APP_VERSION`。业务代码一律 `import { APP_VERSION } from '@/utils/version'`，**不要直接引用全局变量**。
- **Electron 主进程**：通过 `app.getVersion()` 读取（Electron 自动读 `package.json`）。当前用于 `electron/tray.ts` 的 tooltip。
- **打包脚本**：`electron-builder` 自动用 `package.json:version` 命名安装包。

### git tag

每次 release 创建 annotated tag：`v<MAJOR>.<MINOR>.<PATCH>`（如 `v1.2.3`）。

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
```

`bump-version.mjs` 会自动完成。

---

## 3. DB schema 版本

定义在 `src/utils/database.ts` 顶部：

```ts
const DB_VERSION = 1;
```

### 变更流程（修改 schema 时强制执行）

1. 在 `database.ts` 的迁移表里追加 `MIGRATIONS[<新版本号>] = [...]`。
2. 把 `DB_VERSION` 递增到对应数值。
3. 应用启动时 `migrateDatabase()` 会比对 `settings.dataVersion` 与 `DB_VERSION`，
   依次执行未应用的迁移，并把 `dataVersion` 写回。
4. **不可逆迁移（删列、改类型）必须配 MAJOR 版本号 App bump**，并在 CHANGELOG 的
   ⚠️ Breaking 段写明手动恢复步骤。

> 注意：`dataVersion` 字段只是迁移门控的「水位线」，**不是**导出文件的版本号。

---

## 4. 导出格式版本

定义在 `src/utils/export.ts` 顶部：

```ts
export const EXPORT_FORMAT_VERSION = 1;
```

写入 `ProjectExportData.version` 与 `AppExportData.version`。导入侧的 `parseImportData()`
应据此判断能否解析；目前实现仅做「字段存在性」校验，未来若引入多版本兼容层，在此扩展。

### 何时递增

- ✅ 增加/删除/重命名导出字段、改变序列化形态（如 JSON → MessagePack）。
- ❌ 仅仅增删 UI 组件、调整列默认值（这些属于 schema/业务变更，与文件格式无关）。

**不可逆的导出格式变更必须配 MAJOR 版本号 App bump。**

---

## 5. 发版流程

### 5.1 准备 release commit

```bash
# 在 main 分支、工作区干净的状态下
bun run bump -- <patch|minor|major>
```

脚本会做这些事：

1. 按 SemVer 计算新版本号，写回 `package.json`。
2. 校验工作区干净（`--force` 可跳过；风险自负）。
3. 把 `CHANGELOG.md` 顶部的 `## [Unreleased]` 段落收敛为
   `## [vX.Y.Z] - YYYY-MM-DD`，并补一个新的空 `## [Unreleased]` 占位段。
   条目内容从 `git log <上一 tag>..HEAD` 按 Conventional Commits 前缀自动归类：
   - `break:` / `<type>!:` → ⚠️ Breaking
   - `feat:` / `perf:` → Added
   - `fix:` → Fixed
   - `refactor:` / `chore:` / `docs:` / `style:` / `test:` / `build:` / `ci:` → Internal（默认省略，`--verbose` 显示）
4. `git add package.json CHANGELOG.md` → `git commit -m "chore(release): vX.Y.Z"` → `git tag -a vX.Y.Z -m "Release vX.Y.Z"`。
5. 任意 git 步骤失败**不会自动 reset**，仅打印手动恢复指引。

预演模式（不写盘、不 commit）：

```bash
bun run bump -- patch --dry-run
```

### 5.2 推送 tag

```bash
git push origin main
git push origin vX.Y.Z
```

或者直接在 bump 时一并推送：

```bash
bun run bump -- <patch|minor|major> --push
```

`--push` 会推送当前分支与 tag，**tag 推送后自动触发 GitHub Actions release.yml**（见下方第 8 节）。

---

## 6. CHANGELOG 纪律

- 格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)。
- 任何**影响用户可见行为**的 commit 都应在合并前用 Conventional Commits 前缀打头
  （`feat:` / `fix:` / `break:` 等），`bump` 脚本据此归类。
- 纯内部重构（`refactor:`、`chore:`）默认不会出现在 CHANGELOG 里。
- ⚠️ Breaking 段必须写明**用户需要做什么**（删库重导？清空配置？回滚版本？）。

---

## 7. 索引：版本号在代码里的位置速查

| 角色 | 位置 |
| --- | --- |
| App 版本号单一源 | `package.json` `version` |
| Renderer 注入 | `vite.config.ts` `define.__APP_VERSION__` |
| Renderer 出口 | `src/utils/version.ts` `APP_VERSION` |
| 全局类型声明 | `src/vite-env.d.ts` |
| Electron 主进程出口 | `app.getVersion()`（标准 API） |
| DB schema 版本 | `src/utils/database.ts` `DB_VERSION` |
| 持久化水位线 | `settings` 表 `dataVersion`（经 `AppSettings.dataVersion`） |
| 导出格式版本 | `src/utils/export.ts` `EXPORT_FORMAT_VERSION` |
| 发版脚本 | `scripts/bump-version.mjs`（`bun run bump`） |
| CHANGELOG 抽取 | `scripts/extract-changelog.mjs`（`bun run extract-changelog`） |
| 发版工作流 | `.github/workflows/release.yml` |
| 变更日志 | `CHANGELOG.md` |

---

## 8. GitHub 全链路一致性

发版不是只有本地 commit + tag。要让 GitHub 上的 tag、Release、安装包元数据全部使用同一个版本号，链路如下（**单一源始终是 `package.json` 的 `version`**）：

```
            package.json:version  （单一源）
                      │
       ┌──────────────┼───────────────┐
       │              │               │
   bump 脚本       electron-builder   Vite define
   写入并打 tag    读取后命名产物    注入到 renderer
       │              │               │
       ▼              ▼               ▼
   git tag vX.Y.Z   NSIS 安装包      「关于」/托盘 tooltip
       │             ProductVersion
       │ 持有完全相同的 X.Y.Z
       │
       ▼  (git push origin vX.Y.Z)
   GitHub Actions release.yml
       │
       ├─→ 校验 tag == package.json:version（不一致则 fail）
       ├─→ bun run electron:build
       ├─→ scripts/extract-changelog.mjs vX.Y.Z → release notes
       └─→ gh release create vX.Y.Z \
              --notes-file <抽取的版本块正文> \
              release/*.exe release/latest*.yml
```

### 8.1 各位置版本号来源一览

| 位置 | 版本号来源 | 谁负责 |
| --- | --- | --- |
| 本地 `package.json` | bump 脚本写回 | `bun run bump` |
| git tag `vX.Y.Z` | bump 脚本创建（`git tag -a`） | `bun run bump` |
| `dist-electron` / Electron 主进程 | `app.getVersion()` 读 package.json | Electron 自动 |
| Renderer 「关于」/ tooltip | `vite.config.ts` `define.__APP_VERSION__` 注入 | Vite 自动 |
| NSIS 安装包 `ProductVersion` | electron-builder 读 package.json | `electron:build` 自动 |
| GitHub Tag（远端） | `git push origin vX.Y.Z` | bump `--push` 或手动 |
| GitHub Release 标题 | 取自 tag 名 | Actions `release.yml` |
| GitHub Release 正文 | 从 `CHANGELOG.md` 抽取对应版本块 | Actions + `extract-changelog.mjs` |
| GitHub Release Asset | electron-builder 产出的 `*.exe` / `latest*.yml` | Actions 上传 |

### 8.2 关键防错点

1. **CI 校验 tag 与 package.json 一致**：`release.yml` 的 `Verify package.json version matches tag` 步骤在构建前显式比对，不一致直接 `exit 1`。这样能拦截「手动改了 tag 但忘记改 package.json」这类错误。
2. **Release 幂等**：`gh release create` 前先 `gh release view`，已存在则跳过。重跑 workflow 不会创建重复 Release。
3. **CHANGELOG 抽取失败即终止**：`extract-changelog.mjs` 找不到对应版本块时退出码非零，会让 workflow 在创建空 Release 之前就停下。
4. **不要手动在 GitHub 网页上改 Release 标题/正文**：下次重跑 workflow 会跳过（已存在），不会同步。要修正请 `gh release edit` 或 `gh release delete` 后重跑。

### 8.3 第一次启用前的检查清单

- [ ] `package.json` 已配置 `repository.url`、`build.publish`（已完成于本次改造）。
- [ ] 仓库 Settings → Actions → General → Workflow permissions 设为 **Read and write permissions**（否则 `gh release create` 会因权限不足失败）。
- [ ] 默认分支保护规则允许 `chore(release)` commit 直接推送（或允许 bump 创建的分支绕过 PR）。
- [ ] `bun.lock` 与当前 `package.json` 一致（CI 用 `bun install --frozen-lockfile`，不一致会失败）。

### 8.4 一条完整命令版

在 main 分支、工作区干净的状态下：

```bash
bun run bump -- patch --push
```

这一条命令做完：递增 version → 写 CHANGELOG → commit → 打 tag → 推送分支与 tag → GitHub Actions 自动构建 → 创建 Release。剩余的只是去 GitHub Releases 页面确认产物已上传。
