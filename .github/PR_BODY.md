## 概述

把当前的「删除 = 移入回收站（30 天自动清除）」改为「删除 = 归档（永久保留）」，并在设置面板用顶部 Tab 新增「历史记录」子页面管理归档事项（恢复 / 永久删除 / 清空）。

## 改动

### 核心行为
- **删除 = 归档**：复用 `deleted_todos` 表作为归档，移除 30 天自动清除（删除死代码 `cleanupExpiredDeletedTodos`）。`expires_at` 列保留以兼容旧数据 / 导入导出，但不再用于自动清除，新归档项用 `deletedAt` 占位。
- **不 bump DB_VERSION / 导出格式版本**：无 schema 变更，零迁移风险。

### UI
- 设置面板顶部新增 `设置 | 历史记录` Tab，原地切换内容。
- 历史记录页（新组件 `ArchiveHistoryView`）跨项目展示全部归档事项，每行：标题 + 项目名标签 + 「归档于 {相对时间}」，悬浮操作：恢复 / 永久删除（二次确认）+ 顶部「清空归档」。
- 侧边栏「回收站」→「历史记录」（`InboxIcon`，加 `aria-label` 稳定可访问性名），点击直达设置的历史记录 Tab。
- 移除独立 `RecycleBinModal`。

### Store / 类型
- `emptyRecycleBin` → `emptyArchive`；`deleteTodo` / `batchAction('delete')` / `clearCompleted` 不再计算 30 天 `expiresAt`。
- `DeletedTodo.expiresAt` 标 `@deprecated`。

## 验证
- `bun run lint`（`--max-warnings 0`）✅
- `bun run build`（tsc -b 类型门禁 + vite build）✅
- `bun run test:run`（35 个 vitest 单测）✅
- 定向 E2E（非全套，按 AGENTS.md）：`archive.spec.ts`(5) + `settings.spec.ts` + `todos.spec.ts` + `app.spec.ts` = **31 passed / 0 failed** ✅
  - 过程中修了一个 E2E bug：侧边栏历史记录按钮的可访问性名会因计数徽章变成「历史记录 N」，加 `aria-label` 后稳定。

## 设计决策
- 复用 `deleted_todos` 而非新建「归档」表，避免双层概念。
- 历史记录页跨项目展示（`getAllDeletedTodos()`），更贴合「历史记录」语义。
- 顶部 Tab 切换（而非独立全屏页），与应用现有风格一致。

## 备注
- `SettingsPanel.tsx` diff 体积偏大：因 Tab 切换把原有 section 包进三元分支，prettier 对整个文件做了缩进重排；`--ignore-all-space` 下实际仅 89/8 行真实改动，功能与构建均正常。
- 含一个 `chore(release): v1.4.0` 发版提交（package.json + CHANGELOG + 本地 tag）。**v1.4.0 tag 未推送**，按约定合并到 main 后再 `git push origin v1.4.0` 触发正式发版。
