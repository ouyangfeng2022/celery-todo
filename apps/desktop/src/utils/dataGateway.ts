/**
 * @file 跨端数据网关（v3）
 * @description 2.x 的 stores/components 依赖本模块的函数面；本实现把它们逐一映射到
 *              @celery/data 的 Repository 契约（Tauri 后端为 crates/celery-db）。
 *
 *              与 2.x 的差异：
 *              - 不再有 sql.js Web 回退 —— 每次写操作都即时提交（Rust 侧单事务），
 *                flush() 退化为 no-op。
 *              - UI 实体的 `order` ↔ v3 DTO 的 `rank`（f64 稀疏值）同名字段映射；
 *                归档实体的 `deletedAt` ↔ `archivedAt`。`expiresAt` 已废弃，
 *                仅按类型兼容合成（30 天偏移），不再有任何自动清除语义。
 *              - replaceAll / reset / incompleteCounts / archivedCount 属于系统级
 *                操作，不在 Repository 契约内，经 DesktopDataSystem 注入
 *                （Tauri 命令实现见 lib/tauri-repositories.ts；测试注入内存实现）。
 */

import type { AppExportData, DeletedTodo, Project, Todo, TodoTemplate } from '../types';
import type {
  ArchivedQuery,
  ArchivedTodoDto,
  NewProject,
  NewTodo,
  ProjectDto,
  Repositories,
  ReplaceAllPayload,
  ReplaceArchivedTodo,
  ReplaceProject,
  ReplaceTodo,
  SearchQuery,
  TodoDto,
  TodoPatch,
  TodoQuery,
} from '@celery/data';
import { DEFAULT_SETTINGS, STICKER_PRESET_VALUES } from '@celery/core';
import { EXPORT_FORMAT_VERSION } from './export';
import { onDataChanged as subscribeDataChanged, type DataChangedHandler } from '../platform';
import { createTauriDataSystem, createTauriRepositories } from '../lib/tauri-repositories';

// ============================================
// 仓储注入（默认 Tauri；测试注入内存适配器）
// ============================================

/** 系统级操作：Repository 契约之外的桌面专属命令。 */
export interface DesktopDataSystem {
  /** 各项目未完成计数（侧边栏徽标） */
  incompleteCounts(): Promise<Record<string, number>>;
  /** 归档总数（历史页标题） */
  archivedCount(projectId?: string): Promise<number>;
  /** 单事务全量替换（v2 JSON 导入 / 恢复备份） */
  replaceAll(payload: ReplaceAllPayload): Promise<void>;
  /** 恢复出厂（清空四表） */
  reset(): Promise<void>;
}

let repositories: Repositories | null = null;
let system: DesktopDataSystem | null = null;

/** 测试入口：注入内存适配器等替身。应用代码不要调用。 */
export function configureDataGateway(repos: Repositories, sys?: DesktopDataSystem): void {
  repositories = repos;
  system = sys ?? createMemoryDataSystem(repos);
}

function r(): Repositories {
  if (!repositories) {
    // 惰性初始化：jsdom 单测里若未注入内存适配器也未触发任何调用，不会碰到 invoke。
    repositories = createTauriRepositories();
    system ??= createTauriDataSystem();
  }
  return repositories;
}

function s(): DesktopDataSystem {
  r();
  return system!;
}

/** 内存版系统操作（测试用；非原子，仅保证语义正确）。 */
function createMemoryDataSystem(repos: Repositories): DesktopDataSystem {
  return {
    async incompleteCounts() {
      const counts: Record<string, number> = {};
      for (const project of await repos.projects.list()) {
        const c = await repos.todos.counts(project.id);
        if (c.active > 0) counts[project.id] = c.active;
      }
      return counts;
    },
    async archivedCount(projectId) {
      let cursor: string | null = null;
      let n = 0;
      do {
        const page = await repos.todos.archivedPage({
          projectId: projectId ?? null,
          term: null,
          limit: 200,
          cursor,
        });
        n += page.items.length;
        cursor = page.nextCursor;
      } while (cursor);
      return n;
    },
    async replaceAll(payload) {
      // 逐项重建（内存库无事务需求；数据量 = 测试规模）。
      // NewTodo 不携带完成态 —— 创建后按 (completed, completedAt) 分组补 stamp，
      // 与 Rust replace_all 的显式列写入保持语义一致。
      const stamp = async (
        items: { id: string; completed: boolean; completedAt: string | null }[],
      ) => {
        const groups = new Map<
          string,
          { ids: string[]; completed: boolean; completedAt: string | null }
        >();
        for (const item of items) {
          const key = item.completed + '|' + item.completedAt;
          const g = groups.get(key);
          if (g) g.ids.push(item.id);
          else
            groups.set(key, {
              ids: [item.id],
              completed: item.completed,
              completedAt: item.completedAt,
            });
        }
        for (const g of groups.values()) {
          if (!g.completed && !g.completedAt) continue;
          await repos.todos.batchUpdate({
            ids: g.ids,
            patch: {
              completed: g.completed,
              ...(g.completed && g.completedAt ? { completedAt: g.completedAt } : {}),
            },
          });
        }
      };
      for (const p of await repos.projects.list(true)) {
        await repos.projects.deletePermanently(p.id);
      }
      await repos.todos.purgeAllArchived();
      for (const kv of await repos.settings.all()) {
        await repos.settings.delete(kv.key);
      }
      for (const p of payload.projects) {
        await repos.projects.create({
          id: p.id,
          name: p.name,
          kind: p.kind,
          color: p.color,
          rank: p.rank,
        });
      }
      if (payload.todos.length > 0) {
        await repos.todos.createBulk(toNewTodos(payload.todos));
        await stamp(payload.todos);
      }
      for (const a of payload.archivedTodos) {
        await repos.todos.create(toNewTodo(a));
        await stamp([a]);
        await repos.todos.archive([a.id]);
      }
      if (payload.settings.length > 0) await repos.settings.setBulk(payload.settings);
    },
    async reset() {
      await this.replaceAll({
        projects: [],
        todos: [],
        archivedTodos: [],
        settings: [],
      });
    },
  };
}

// ============================================
// 实体映射（v3 DTO ↔ UI 实体）
// ============================================

function dtoToProject(p: ProjectDto): Project {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    color: p.color ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    order: p.rank,
  };
}

function dtoToTodo(t: TodoDto): Todo {
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? undefined,
    completed: t.completed,
    priority: t.priority,
    plannedDate: t.plannedDate ?? undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt ?? undefined,
    order: t.rank,
    pinned: t.pinned,
  };
}

function dtoToDeleted(a: ArchivedTodoDto): DeletedTodo {
  const archivedAt = a.archivedAt;
  return {
    ...dtoToTodo(a),
    projectName: a.projectName ?? undefined,
    deletedAt: archivedAt,
    // 30 天过期已废弃；合成值仅为满足历史导出格式的类型兼容。
    expiresAt: new Date(new Date(archivedAt).getTime() + 30 * 86400000).toISOString(),
  };
}

function toNewTodo(t: ReplaceTodo | Todo): NewTodo {
  return {
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? null,
    priority: t.priority,
    plannedDate: t.plannedDate ?? null,
    pinned: t.pinned,
    // ReplaceTodo 已是 rank；UI Todo 用 order 字段承载同一语义
    rank: 'rank' in t ? t.rank : t.order,
  };
}

function toNewTodos(items: readonly (ReplaceTodo | Todo)[]): NewTodo[] {
  return items.map(toNewTodo);
}

/** 全字段补丁：UI 端持有完整实体，写入时把可变字段全部显式下发。 */
function toPatch(t: Todo): TodoPatch {
  return {
    title: t.title,
    description: t.description ?? null,
    completed: t.completed,
    priority: t.priority,
    plannedDate: t.plannedDate ?? null,
    pinned: t.pinned,
    completedAt: t.completedAt ?? null,
  };
}

// ============================================
// 分页抽取（UI 一次性消费整表；上限防御海量库）
// ============================================

const DRAIN_PAGE_LIMIT = 200;
const DRAIN_MAX_PAGES = 60; // 1.2 万行；超出按截断处理而非死循环

async function drainTodoPage(base: Omit<TodoQuery, 'limit' | 'cursor'>): Promise<TodoDto[]> {
  const out: TodoDto[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < DRAIN_MAX_PAGES; i++) {
    const page = await r().todos.page({ ...base, limit: DRAIN_PAGE_LIMIT, cursor });
    out.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return out;
}

async function drainArchived(
  base: Omit<ArchivedQuery, 'limit' | 'cursor'>,
): Promise<ArchivedTodoDto[]> {
  const out: ArchivedTodoDto[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < DRAIN_MAX_PAGES; i++) {
    const page = await r().todos.archivedPage({ ...base, limit: DRAIN_PAGE_LIMIT, cursor });
    out.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return out;
}

async function drainSearch(term: string): Promise<TodoDto[]> {
  const out: TodoDto[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const query: SearchQuery = {
      term,
      projectId: null,
      completed: null,
      limit: DRAIN_PAGE_LIMIT,
      cursor,
    };
    const page = await r().todos.search(query);
    out.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return out;
}

// ============================================
// 对外 API（与 2.x dataGateway 同名同义）
// ============================================

/** v3 下数据库由 Rust 打开并迁移，无异步初始化；保留函数以兼容启动流程。 */
export async function initialize(): Promise<void> {}

/** 2.x 兼容：v3 恒为「原生数据库」路径（无 sql.js Web 回退）。 */
export const isNativeDatabase = (): boolean => true;

/** v3 每次写操作即时提交，无防抖持久化；保留 no-op 以兼容 Ctrl+S。 */
export async function flush(): Promise<void> {}

export async function exportAll(): Promise<AppExportData> {
  const [projects, todos, deletedTodos, settings] = await Promise.all([
    getProjects(),
    getAllTodos(),
    getAllDeletedTodos(),
    getSettings(),
  ]);
  const stickerPreset =
    (settings.stickerPreset as keyof typeof STICKER_PRESET_VALUES | undefined) ??
    DEFAULT_SETTINGS.stickerPreset;
  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    todos,
    deletedTodos,
    settings: {
      ...DEFAULT_SETTINGS,
      theme: settings.theme === 'paper' || settings.theme === 'celery' ? settings.theme : 'default',
      colorMode:
        settings.colorMode === 'light' || settings.colorMode === 'dark'
          ? settings.colorMode
          : 'system',
      autoStart: settings.autoStart === 'true',
      minimizeToTray: settings.minimizeToTray !== 'false',
      autoUpdateEnabled: settings.autoUpdateEnabled !== 'false',
      lastActiveProjectId: settings.lastActiveProjectId ?? '',
      customTemplates: parseTemplatesSetting(settings.customTemplates),
      todoViewMode: settings.todoViewMode === 'card' ? 'card' : 'list',
      showWeeklyProjects: settings.showWeeklyProjects !== 'false',
      timeFormat: settings.timeFormat === 'exact' ? 'exact' : 'relative',
      stickerPreset,
      stickerRadius: Number(settings.stickerRadius ?? DEFAULT_SETTINGS.stickerRadius),
      stickerBlur: Number(settings.stickerBlur ?? DEFAULT_SETTINGS.stickerBlur),
      stickerOpacity: STICKER_PRESET_VALUES[stickerPreset].opacity,
      stickerShadow: settings.stickerShadow !== 'false',
      dataVersion: Number(settings.dataVersion ?? DEFAULT_SETTINGS.dataVersion),
    },
  };
}

function parseTemplatesSetting(value: string | undefined): TodoTemplate[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as TodoTemplate[]) : [];
  } catch {
    return [];
  }
}

export async function getProjects(): Promise<Project[]> {
  return (await r().projects.list()).map(dtoToProject);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const dto = await r().projects.get(id);
  return dto ? dtoToProject(dto) : undefined;
}

export async function getTodos(projectId: string): Promise<Todo[]> {
  const items = await drainTodoPage({
    projectId: projectId || null,
    filter: 'all',
    priority: null,
    plannedFrom: null,
    plannedTo: null,
    sort: 'manual',
  });
  return items.map(dtoToTodo);
}

export async function getDeletedTodos(projectId: string): Promise<DeletedTodo[]> {
  const items = await drainArchived({ projectId: projectId || null, term: null });
  return items.map(dtoToDeleted);
}

export async function getSettings(): Promise<Record<string, string>> {
  const entries = await r().settings.all();
  return Object.fromEntries(entries.map((kv) => [kv.key, kv.value]));
}

export async function searchTodos(keyword: string): Promise<Todo[]> {
  const term = keyword.trim();
  if (!term) return [];
  return (await drainSearch(term)).map(dtoToTodo);
}

export async function getIncompleteCounts(): Promise<Record<string, number>> {
  return s().incompleteCounts();
}

export async function getAllTodos(): Promise<Todo[]> {
  const items = await drainTodoPage({
    projectId: null,
    filter: 'all',
    priority: null,
    plannedFrom: null,
    plannedTo: null,
    sort: 'manual',
  });
  return items.map(dtoToTodo);
}

export async function getAllDeletedTodos(): Promise<DeletedTodo[]> {
  return (await drainArchived({ projectId: null, term: null })).map(dtoToDeleted);
}

export async function getDeletedCount(): Promise<number> {
  return s().archivedCount();
}

/** 归档分页（历史页无限滚动）。返回不透明游标，翻页时原样传回。 */
export async function getDeletedPage(
  limit: number,
  cursor?: string,
): Promise<{ items: DeletedTodo[]; nextCursor: string | null }> {
  const page = await r().todos.archivedPage({
    projectId: null,
    term: null,
    limit: Math.min(Math.max(limit, 1), 200),
    cursor: cursor ?? null,
  });
  return { items: page.items.map(dtoToDeleted), nextCursor: page.nextCursor };
}

export async function getSetting(key: string): Promise<string | null> {
  return r().settings.get(key);
}

export async function setSetting(key: string, value: string): Promise<void> {
  await r().settings.set(key, value);
}

export async function deleteSetting(key: string): Promise<void> {
  await r().settings.delete(key);
}

export async function insertTodo(todo: Todo): Promise<void> {
  await r().todos.create(toNewTodo(todo));
}

export async function insertTodos(todos: Todo[]): Promise<void> {
  if (todos.length === 0) return;
  await r().todos.createBulk(toNewTodos(todos));
}

export async function updateTodo(todo: Todo): Promise<void> {
  await r().todos.update(todo.id, toPatch(todo));
}

/** 批量更新：同形补丁合并为一次 batchUpdate，异构补丁逐条事务写入。 */
export async function updateTodos(todos: Todo[]): Promise<void> {
  if (todos.length === 0) return;
  const groups = new Map<string, { ids: string[]; patch: TodoPatch }>();
  for (const todo of todos) {
    const patch = toPatch(todo);
    const key = JSON.stringify(patch);
    const group = groups.get(key);
    if (group) group.ids.push(todo.id);
    else groups.set(key, { ids: [todo.id], patch });
  }
  for (const { ids, patch } of groups.values()) {
    await r().todos.batchUpdate({ ids, patch });
  }
}

/** 显式按 id 批量打同一补丁（批量完成 / 优先级等 store 快路径）。 */
export async function batchUpdateTodos(ids: string[], patch: TodoPatch): Promise<void> {
  if (ids.length === 0) return;
  await r().todos.batchUpdate({ ids, patch });
}

/**
 * 项目内拖拽重排：拉全量 → 数组移动 → reorder 整组重编 rank（i × GAP）→ 回读。
 * 2.x 的「中点 rank + 挤压重排」优化由服务端整组重编替代，语义等价。
 */
export async function moveTodoRank(
  projectId: string,
  sourceId: string,
  targetId: string,
): Promise<Todo[]> {
  const current = await drainTodoPage({
    projectId,
    filter: 'all',
    priority: null,
    plannedFrom: null,
    plannedTo: null,
    sort: 'manual',
  });
  const sourceIndex = current.findIndex((t) => t.id === sourceId);
  const targetIndex = current.findIndex((t) => t.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return current.map(dtoToTodo);
  }
  const next = [...current];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  await r().todos.reorder({ projectId, orderedIds: next.map((t) => t.id) });
  return next.map(dtoToTodo);
}

/** 供 snapshotOrder 直接下发显示顺序（跳过全字段 diff）。 */
export async function reorderTodos(projectId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  await r().todos.reorder({ projectId, orderedIds });
}

export async function moveTodoToProject(id: string, targetProjectId: string): Promise<Todo> {
  await r().todos.move({ ids: [id], targetProjectId });
  const moved = await r().todos.get(id);
  if (!moved) throw new Error(`事项不存在: ${id}`);
  return dtoToTodo(moved);
}

export async function archiveTodos(todos: Todo[]): Promise<DeletedTodo[]> {
  if (todos.length === 0) return [];
  await r().todos.archive(todos.map((t) => t.id));
  // 归档时间由服务端盖章；本地合成仅用于 store 即时展示（重载后以服务端为准）。
  const now = new Date().toISOString();
  return todos.map((todo) => ({
    ...todo,
    deletedAt: now,
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  }));
}

export async function restoreTodo(id: string): Promise<void> {
  try {
    await r().todos.restoreArchived([id], null);
  } catch (err) {
    // 原项目已删除（v3 拒绝静默丢数据）→ 落回收集箱，保证事项可找回。
    const message = err instanceof Error ? err.message : String(err);
    if (!/原项目|不存在/.test(message)) throw err;
    const inbox = await r().projects.ensureInbox();
    await r().todos.restoreArchived([id], inbox.id);
  }
}

export async function permanentlyDelete(id: string): Promise<void> {
  await r().todos.purgeArchived([id]);
}

export async function emptyArchive(projectId?: string): Promise<void> {
  if (!projectId) {
    await r().todos.purgeAllArchived();
    return;
  }
  // 按项目清空：抽取该项目全部归档 id 后批量永久删除
  const items = await drainArchived({ projectId, term: null });
  if (items.length > 0) {
    await r().todos.purgeArchived(items.map((a) => a.id));
  }
}

export async function insertProject(project: Project): Promise<void> {
  const newProject: NewProject = {
    id: project.id,
    name: project.name,
    kind: project.kind,
    color: project.color ?? null,
    // 缺省（undefined）追加到末尾（max + GAP）
    rank: undefined,
  };
  await r().projects.create(newProject);
}

export async function updateProject(project: Project): Promise<void> {
  await r().projects.update(project.id, {
    name: project.name,
    color: project.color ?? null,
  });
}

/** 软删除 = 归档项目（默认列表不可见，历史记录保留）。 */
export async function deleteProject(id: string): Promise<void> {
  await r().projects.update(id, { archived: true });
}

export async function permanentlyDeleteProject(id: string): Promise<void> {
  await r().projects.deletePermanently(id);
}

export async function moveProjectRank(sourceId: string, targetId: string): Promise<Project[]> {
  const all = await r().projects.list(true);
  const sourceIndex = all.findIndex((p) => p.id === sourceId);
  const targetIndex = all.findIndex((p) => p.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return (await r().projects.list()).map(dtoToProject);
  }
  const next = [...all];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  await r().projects.reorder({ orderedIds: next.map((p) => p.id) });
  return (await r().projects.list()).map(dtoToProject);
}

export async function ensureInboxProject(): Promise<Project> {
  return dtoToProject(await r().projects.ensureInbox());
}

export async function insertTodosIntoInbox(todos: Todo[]): Promise<Project> {
  const inbox = await r().projects.ensureInbox();
  if (todos.length > 0) {
    await r().todos.createBulk(toNewTodos(todos).map((t) => ({ ...t, projectId: inbox.id })));
  }
  return dtoToProject(inbox);
}

export async function createProjectWithTodos(project: Project, todos: Todo[]): Promise<Project> {
  await insertProject(project);
  if (todos.length > 0) {
    await r().todos.createBulk(toNewTodos(todos));
  }
  return (await getProject(project.id)) ?? project;
}

/** v2 JSON 全量导入：UI 实体 → ReplaceAllPayload，Rust 单事务替换。 */
export async function replaceAll(data: AppExportData): Promise<void> {
  const projects: ReplaceProject[] = data.projects.map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    color: p.color ?? null,
    rank: p.order,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
  const todos: ReplaceTodo[] = data.todos.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? null,
    completed: t.completed,
    priority: t.priority,
    plannedDate: t.plannedDate ?? null,
    pinned: t.pinned,
    rank: t.order,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt ?? null,
  }));
  const archived: ReplaceArchivedTodo[] = data.deletedTodos.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    title: t.title,
    description: t.description ?? null,
    completed: t.completed,
    priority: t.priority,
    plannedDate: t.plannedDate ?? null,
    pinned: t.pinned,
    rank: t.order,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    completedAt: t.completedAt ?? null,
    archivedAt: t.deletedAt,
    projectName: t.projectName ?? null,
  }));
  const settings = Object.entries(data.settings)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value: key === 'customTemplates' ? JSON.stringify(value) : String(value),
    }));
  await s().replaceAll({ projects, todos, archivedTodos: archived, settings });
}

export async function reset(): Promise<void> {
  await s().reset();
}

/**
 * 订阅跨窗口数据变更（贴图窗口 / CLI 写入后刷新本窗口）。
 * 自发事件已在平台层按窗口 label 过滤；返回取消订阅函数。
 */
export function onDataChanged(callback: DataChangedHandler): () => void {
  return subscribeDataChanged(callback);
}
