# 版本号管理策略

本项目同时维护**三类版本号**，语义相互独立，互不替代。本文档定义它们的职责、变更时机与发版流程。

---

## 1. 三类版本号

| 版本号 | 类型 | 单一源 | 用途 |
| --- | --- | --- | --- |
| **App 版本** | SemVer 字符串（`MAJOR.MINOR.PATCH`） | `apps/desktop/src-tauri/tauri.conf.json` 的 `version`（与根 `Cargo.toml` 的 `workspace.package.version` 手动保持同步） | 用户可见的发行版本。打 git tag、写入安装包、展示在「设置 → 关于」。 |
| **DB schema 版本** | 单调递增正整数 | `crates/celery-db` 的 `schema_migrations` 表（Rust 侧维护，v1 起） | SQLite 表结构迁移门控。应用启动时按已应用迁移决定是否执行新迁移。 |
| **导出格式版本** | 单调递增正整数 | `packages/data/src/export-format.ts` 的 `V3_EXPORT_FORMAT_VERSION`（格式标识 `celery-todo/v3`） | JSON 导入/导出文件的兼容性标识。导出时写入；导入时据此决定能否解析，旧 2.x JSON 明确拒绝。 |

> **关键区分**：DB schema 版本与导出格式版本**不共用**一个数值。
> 一个描述「数据库表怎么建」，另一个描述「磁盘上的 JSON 长什么样」。
> 修改 schema 不必动导出格式，反之亦然。

---

## 2. App 版本号（SemVer）

格式遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)：

```
MAJOR.MINOR.PATCH
   3  .  4  .  2
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

### 版本号的几处落点（谁读哪里）

- **Renderer**：`apps/desktop/vite.config.ts` 构建期读 `tauri.conf.json:version`，经 `define` 注入 `__APP_VERSION__`，由 `src/utils/version.ts` 暴露为 `APP_VERSION`。
- **Rust 宿主与 CLI**：根 `Cargo.toml` 的 `[workspace.package] version`，`apps/desktop/src-tauri` 与 `apps/cli` 均 `version.workspace = true`。
- **Tauri 打包**：安装包命名与自动更新（updater `latest.json`）均取自 `tauri.conf.json:version`。
- **移动端**：`apps/mobile/app.json` 的 `expo.version` 与 `android.versionCode` 由发版流水线按 tag 自动同步，无需手动改。
- **workspace package.json**（根与各包）的 `version` 仅作展示对齐，不参与构建，随发版手动同步即可。

> `tauri.conf.json` 与根 `Cargo.toml` 两处**没有**自动校验，发版时必须一起改。漏改 Cargo 侧不会阻断构建，但 `cargo tree`/CLI 版本号会与桌面端漂移。

### git tag

每次 release 创建 annotated tag：`v3.<MINOR>.<PATCH>`（如 `v3.4.3`）。
**tag 前缀必须是 `v3`** —— `desktop-release.yml` 按 `v3*` 模式触发。

---

## 3. DB schema 版本

由 `crates/celery-db` 的迁移框架管理（`schema_migrations` 表记录已应用版本，v1 起）。

### 变更流程（修改 schema 时强制执行）

1. 在 `crates/celery-db` 追加新迁移（Rust 侧按版本号顺序执行）。
2. 跑 `cargo test -p celery-db` —— 同时会重新生成 `packages/data/src/generated/` 的 TS 绑定，**必须提交生成物**（CI 有漂移检查）。
3. **不可逆迁移（删列、改类型）必须配 MAJOR 版本号 App bump**，并在 CHANGELOG 的 ⚠️ Breaking 段写明手动恢复步骤。

---

## 4. 导出格式版本

定义在 `packages/data/src/export-format.ts`：

```ts
export const V3_FORMAT_ID = 'celery-todo/v3' as const;
export const V3_EXPORT_FORMAT_VERSION = 1;
```

写入导出文件的 `format` 与 `version` 字段。导入侧据此判断能否解析；2.x 旧 JSON（无 `format` 标识）明确拒绝，需经 2.x 数据导入路径（`legacy_v2`）转换。

### 何时递增

- ✅ 增加/删除/重命名导出字段、改变序列化形态（如 JSON → MessagePack）。
- ❌ 仅仅增删 UI 组件、调整列默认值（这些属于 schema/业务变更，与文件格式无关）。

**不可逆的导出格式变更必须配 MAJOR 版本号 App bump。**

---

## 5. 发版流程（手动，无脚本）

3.x 发版没有自动化 bump 脚本，全部手动完成：

1. **改版本号**：`apps/desktop/src-tauri/tauri.conf.json` 的 `version` + 根 `Cargo.toml` 的 `[workspace.package] version`（两处同步）。
2. **写 CHANGELOG**：把 `CHANGELOG.md` 顶部的 `## [Unreleased]` 收敛为 `## [vX.Y.Z] - YYYY-MM-DD`，并补一个新的空 `## [Unreleased]` 段。
3. **同一 commit 更新 README**：同步「下载」小节的版本号链接与安装包文件名（如 `Celery.Todo_3.4.3_x64-setup.exe`），并全篇扫一遍其它过期的版本/分支引用。
4. 提交（如 `chore(release): publish desktop 3.4.3`），打 annotated tag `v3.4.3`，推送 commit 与 tag。
5. tag 推送自动触发 `.github/workflows/desktop-release.yml`：在 Win/macOS/Linux 构建 Tauri 安装包 + `celery.exe` + Android APK（`expo.version`/`versionCode` 按 tag 自动同步），附到同一 GitHub Release。
6. iOS 走 EAS 手动线（`mobile-release.yml`），与 tag 无关。

发版前质量门由 `ci.yml` 把关（lint + test + build）；desktop-release 自身不重跑测试，**不要在红 CI 上打 tag**。

---

## 6. CHANGELOG 纪律

- 格式遵循 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)。
- 任何**影响用户可见行为**的 commit 都应在合并前用 Conventional Commits 前缀打头（`feat:` / `fix:` 等），人工归类 CHANGELOG 时以此为依据。
- 纯内部重构（`refactor:`、`chore:`）默认不进 CHANGELOG。
- ⚠️ Breaking 段必须写明**用户需要做什么**（删库重导？清空配置？回滚版本？）。

---

## 7. 索引：版本号在代码里的位置速查

| 角色 | 位置 |
| --- | --- |
| App 版本号单一源 | `apps/desktop/src-tauri/tauri.conf.json` `version` |
| Rust workspace 版本 | 根 `Cargo.toml` `[workspace.package] version`（桌面宿主与 CLI 共用） |
| Renderer 注入 | `apps/desktop/vite.config.ts` `define.__APP_VERSION__` |
| Renderer 出口 | `apps/desktop/src/utils/version.ts` `APP_VERSION` |
| 移动端版本 | `apps/mobile/app.json` `expo.version`（发版流水线按 tag 同步） |
| DB schema 版本 | `crates/celery-db` `schema_migrations`（v1 起） |
| 导出格式版本 | `packages/data/src/export-format.ts` `V3_EXPORT_FORMAT_VERSION` |
| 发版工作流 | `.github/workflows/desktop-release.yml`（tag 模式 `v3*`） |
| 变更日志 | `CHANGELOG.md` |
