/**
 * @file 内存适配器
 * @description Repository 契约的纯内存实现 —— 用例测试基准与 UI 原型数据源。
 *              语义严格对齐 crates/celery-db 的 SQLite 实现，
 *              由 @celery/test-contracts 契约测试对两端同时约束。
 */

import type {
  ArchivedQuery,
  ArchivedTodoDto,
  ArchivedTodoPage,
  BatchTodoPatch,
  MoveTodos,
  NewProject,
  NewTodo,
  ProjectDto,
  ProjectPatch,
  ReorderProjects,
  ReorderTodos,
  SearchQuery,
  SettingsKv,
  TodoCounts,
  TodoDto,
  TodoFilter,
  TodoPage,
  TodoPatch,
  TodoPriority,
  TodoQuery,
  TodoSort,
} from '../generated';
import {
  RepositoryError,
  type Repositories,
  type RepositoryChangeEvent,
  type RepositoryChangeFeed,
} from '../repository';
import { base64Decode, base64Encode } from './base64';

const RANK_GAP = 65_536;

const nowIso = (): string => new Date().toISOString();

/** 优先级权重（与 core sortTodos / Rust PRIORITY_WEIGHT 一致） */
const priorityWeight = (p: TodoPriority): number =>
  p === 'high' ? 3 : p === 'medium' ? 2 : 1;

const clampLimit = (limit: number | undefined): number =>
  Math.min(Math.max(limit ?? 50, 1), 200);

/** 不透明游标：base64(JSON{sort, keys})，与 Rust 侧同构（仅本实现内部使用）。 */
function encodeCursor(sort: string, keys: (string | number)[]): string {
  return base64Encode(JSON.stringify({ sort, keys }));
}

function decodeCursor(sort: string, cursor: string): (string | number)[] {
  try {
    const parsed = JSON.parse(base64Decode(cursor)) as { sort: string; keys?: unknown };
    if (parsed.sort !== sort || !Array.isArray(parsed.keys)) throw new Error();
    return parsed.keys as (string | number)[];
  } catch {
    throw new RepositoryError('bad-cursor', '游标无效或不属于当前查询');
  }
}

export interface MemoryRepositories extends Repositories {
  /** 内存实现的变更事件源（测试 / 原型 UI 可订阅）。 */
  feed: RepositoryChangeFeed;
  /** 内部快照（测试断言用）。 */
  snapshot(): {
    projects: ProjectDto[];
    todos: TodoDto[];
    archivedTodos: ArchivedTodoDto[];
    settings: SettingsKv[];
  };
}

/** 创建一套内存仓储。可选初始数据（便于用例测试构造场景）。 */
export function createMemoryRepositories(
  initial: {
    projects?: ProjectDto[];
    todos?: TodoDto[];
    archivedTodos?: ArchivedTodoDto[];
    settings?: SettingsKv[];
  } = {},
): MemoryRepositories {
  const projects: ProjectDto[] = [...(initial.projects ?? [])];
  const todos: TodoDto[] = [...(initial.todos ?? [])];
  const archived: ArchivedTodoDto[] = [...(initial.archivedTodos ?? [])];
  const settings = new Map<string, string>(
    (initial.settings ?? []).map((kv) => [kv.key, kv.value]),
  );

  const listeners = new Set<(e: RepositoryChangeEvent) => void>();
  const emit = (e: RepositoryChangeEvent) => {
    for (const l of listeners) l(e);
  };
  const feed: RepositoryChangeFeed = {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const findProject = (id: string) => projects.find((p) => p.id === id);
  const requireProject = (id: string): ProjectDto => {
    const p = findProject(id);
    if (!p) throw new RepositoryError('not-found', `项目 ${id} 不存在`);
    return p;
  };
  const findTodo = (id: string) => todos.find((t) => t.id === id);
  const requireTodo = (id: string): TodoDto => {
    const t = findTodo(id);
    if (!t) throw new RepositoryError('not-found', `事项 ${id} 不存在`);
    return t;
  };
  const nextRank = (): number =>
    projects.reduce((m, p) => Math.max(m, p.rank), -RANK_GAP) + RANK_GAP;

  const validateNewTodo = (n: NewTodo): void => {
    if (!n.title.trim()) throw new RepositoryError('invalid', '标题不能为空');
    requireProject(n.projectId);
  };

  /** 应用补丁（completed_at 语义与 Rust 一致：完成自动盖章，取消清空）。 */
  const applyPatch = (todo: TodoDto, patch: TodoPatch, now: string): void => {
    if (patch.title !== undefined && patch.title !== null) {
      if (!patch.title.trim()) throw new RepositoryError('invalid', '标题不能为空');
      todo.title = patch.title.trim();
    }
    if (patch.description !== undefined) todo.description = patch.description;
    if (patch.priority !== undefined && patch.priority !== null) todo.priority = patch.priority;
    if (patch.plannedDate !== undefined) todo.plannedDate = patch.plannedDate;
    if (patch.pinned !== undefined && patch.pinned !== null) todo.pinned = patch.pinned;
    if (patch.completed !== undefined && patch.completed !== null) {
      todo.completed = patch.completed;
      if (patch.completedAt !== undefined && patch.completedAt !== null && patch.completed) {
        todo.completedAt = patch.completedAt;
      } else if (patch.completedAt === null && !patch.completed) {
        todo.completedAt = null;
      } else {
        todo.completedAt = patch.completed ? now : null;
      }
    } else if (patch.completedAt !== undefined) {
      todo.completedAt = patch.completedAt;
    }
    todo.updatedAt = now;
  };

  /** 排序 + 置顶恒居顶（三种排序与 Rust order_clause 逐键一致）。 */
  const sortTodosBy = (arr: TodoDto[], sort: TodoSort): TodoDto[] => {
    const cmp = (a: TodoDto, b: TodoDto): number => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sort === 'manual') {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      }
      if (sort === 'priority') {
        const w = priorityWeight(b.priority) - priorityWeight(a.priority);
        if (w !== 0) return w;
      }
      if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? -1 : 1;
      return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
    };
    return [...arr].sort(cmp);
  };

  const cursorKeysOf = (sort: TodoSort | 'search', t: TodoDto): (string | number)[] => {
    if (sort === 'manual') return [t.pinned ? 1 : 0, t.rank, t.id];
    if (sort === 'priority')
      return [t.pinned ? 1 : 0, priorityWeight(t.priority), t.createdAt, t.id];
    return [t.pinned ? 1 : 0, t.createdAt, t.id];
  };

  /** 游标之后的元素（键元组与排序方向一致地比较）。 */
  const afterCursor = (sort: TodoSort | 'search', t: TodoDto, keys: (string | number)[]): boolean => {
    const cur = cursorKeysOf(sort, t);
    for (let i = 0; i < keys.length; i++) {
      const a = cur[i] as string | number;
      const b = keys[i] as string | number;
      const descending = sort !== 'manual'; // rank 升序，其余键降序
      if (a === b) continue;
      return descending ? a < b : a > b;
    }
    return false;
  };

  const filterByQuery = (arr: TodoDto[], q: TodoQuery): TodoDto[] =>
    arr.filter((t) => {
      if (q.projectId !== undefined && q.projectId !== null && t.projectId !== q.projectId)
        return false;
      const filter: TodoFilter = q.filter ?? 'all';
      if (filter === 'active' && t.completed) return false;
      if (filter === 'completed' && !t.completed) return false;
      if (q.priority !== undefined && q.priority !== null && t.priority !== q.priority)
        return false;
      if (q.plannedFrom !== undefined && q.plannedFrom !== null) {
        if (!t.plannedDate || t.plannedDate < q.plannedFrom) return false;
      }
      if (q.plannedTo !== undefined && q.plannedTo !== null) {
        if (!t.plannedDate || t.plannedDate > q.plannedTo) return false;
      }
      return true;
    });

  const pageOf = (
    sorted: TodoDto[],
    sort: TodoSort | 'search',
    limit: number,
    cursor: string | undefined | null,
  ): TodoPage => {
    let rows = sorted;
    if (cursor) {
      const keys = decodeCursor(sort, cursor);
      rows = rows.filter((t) => afterCursor(sort, t, keys));
    }
    const items = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const nextCursor = hasMore
      ? encodeCursor(sort, cursorKeysOf(sort, items[items.length - 1]))
      : null;
    return { items, nextCursor: nextCursor ?? null };
  };

  const searchFilter = (t: TodoDto, term: string): boolean => {
    const needle = term.toLowerCase();
    return (
      t.title.toLowerCase().includes(needle) ||
      (t.description?.toLowerCase().includes(needle) ?? false)
    );
  };

  const archiveIds = (ids: string[]): number => {
    const now = nowIso();
    let n = 0;
    for (const id of ids) {
      const idx = todos.findIndex((t) => t.id === id);
      if (idx === -1) continue;
      const t = todos[idx];
      const snapshot = findProject(t.projectId)?.name ?? null;
      archived.push({ ...t, archivedAt: now, projectName: snapshot });
      todos.splice(idx, 1);
      n += 1;
    }
    if (n > 0) emit({ kind: 'todos', projectIds: [] });
    return n;
  };

  return {
    todos: {
      async page(query: TodoQuery): Promise<TodoPage> {
        const sort: TodoSort = query.sort ?? 'created-desc';
        const rows = sortTodosBy(filterByQuery(todos, query), sort);
        return pageOf(rows, sort, clampLimit(query.limit), query.cursor ?? null);
      },
      async counts(projectId?: string | null): Promise<TodoCounts> {
        const scope = projectId ? todos.filter((t) => t.projectId === projectId) : todos;
        const completed = scope.filter((t) => t.completed).length;
        return { total: scope.length, completed, active: scope.length - completed };
      },
      async get(id: string): Promise<TodoDto | null> {
        return findTodo(id) ?? null;
      },
      async create(newTodo: NewTodo): Promise<TodoDto> {
        validateNewTodo(newTodo);
        const now = nowIso();
        const todo: TodoDto = {
          id: newTodo.id,
          projectId: newTodo.projectId,
          title: newTodo.title.trim(),
          description: newTodo.description ?? null,
          completed: false,
          priority: newTodo.priority,
          plannedDate: newTodo.plannedDate ?? null,
          pinned: newTodo.pinned,
          rank: newTodo.rank,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        todos.push(todo);
        emit({ kind: 'todos', projectIds: [todo.projectId] });
        return { ...todo };
      },
      async createBulk(items: NewTodo[]): Promise<number> {
        if (items.length === 0) return 0;
        // 先全部校验再写入：任一条失败整批不生效（对齐 SQLite 单事务）
        for (const item of items) validateNewTodo(item);
        const seen = new Set<string>();
        for (const item of items) {
          if (seen.has(item.id) || findTodo(item.id)) {
            throw new RepositoryError('invalid', `批量创建失败: 主键冲突 ${item.id}`);
          }
          seen.add(item.id);
        }
        const now = nowIso();
        for (const item of items) {
          todos.push({
            id: item.id,
            projectId: item.projectId,
            title: item.title.trim(),
            description: item.description ?? null,
            completed: false,
            priority: item.priority,
            plannedDate: item.plannedDate ?? null,
            pinned: item.pinned,
            rank: item.rank,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          });
        }
        emit({ kind: 'todos', projectIds: [] });
        return items.length;
      },
      async update(id: string, patch: TodoPatch): Promise<TodoDto> {
        const todo = requireTodo(id);
        applyPatch(todo, patch, nowIso());
        emit({ kind: 'todos', projectIds: [todo.projectId] });
        return { ...todo };
      },
      async batchUpdate(payload: BatchTodoPatch): Promise<number> {
        const now = nowIso();
        let n = 0;
        for (const id of payload.ids) {
          const todo = findTodo(id);
          if (!todo) continue;
          applyPatch(todo, payload.patch, now);
          n += 1;
        }
        if (n > 0) emit({ kind: 'todos', projectIds: [] });
        return n;
      },
      async move(payload: MoveTodos): Promise<number> {
        requireProject(payload.targetProjectId);
        const now = nowIso();
        let n = 0;
        for (const id of payload.ids) {
          const todo = findTodo(id);
          if (!todo) continue;
          todo.projectId = payload.targetProjectId;
          todo.updatedAt = now;
          n += 1;
        }
        if (n > 0) emit({ kind: 'todos', projectIds: [payload.targetProjectId] });
        return n;
      },
      async reorder(payload: ReorderTodos): Promise<number> {
        const now = nowIso();
        let n = 0;
        payload.orderedIds.forEach((id, i) => {
          const todo = findTodo(id);
          if (!todo || todo.projectId !== payload.projectId) return;
          todo.rank = i * RANK_GAP;
          todo.updatedAt = now;
          n += 1;
        });
        if (n > 0) emit({ kind: 'todos', projectIds: [payload.projectId] });
        return n;
      },
      async archive(ids: string[]): Promise<number> {
        return archiveIds(ids);
      },
      async archivedPage(query: ArchivedQuery): Promise<ArchivedTodoPage> {
        let rows = [...archived].sort((a, b) => {
          if (a.archivedAt !== b.archivedAt) return a.archivedAt > b.archivedAt ? -1 : 1;
          return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
        });
        if (query.projectId !== undefined && query.projectId !== null) {
          rows = rows.filter((a) => a.projectId === query.projectId);
        }
        const term = query.term?.trim();
        if (term) {
          const needle = term.toLowerCase();
          rows = rows.filter(
            (a) =>
              a.title.toLowerCase().includes(needle) ||
              (a.description?.toLowerCase().includes(needle) ?? false),
          );
        }
        const limit = clampLimit(query.limit);
        let start = 0;
        if (query.cursor) {
          const keys = decodeCursor('archived', query.cursor);
          const at = String(keys[0]);
          const id = String(keys[1]);
          start = rows.findIndex(
            (a) => a.archivedAt === at && a.id === id,
          );
          if (start === -1) start = rows.length;
          else start += 1;
        }
        const items = rows.slice(start, start + limit);
        const hasMore = rows.length > start + limit;
        return {
          items,
          nextCursor: hasMore
            ? encodeCursor('archived', [
                items[items.length - 1].archivedAt,
                items[items.length - 1].id,
              ])
            : null,
        };
      },
      async restoreArchived(
        ids: string[],
        fallbackProjectId?: string | null,
      ): Promise<number> {
        let n = 0;
        for (const id of ids) {
          const idx = archived.findIndex((a) => a.id === id);
          if (idx === -1) continue;
          const a = archived[idx];
          let target = a.projectId;
          if (!findProject(a.projectId)) {
            if (!fallbackProjectId) {
              throw new RepositoryError(
                'invalid',
                `归档事项 ${id} 的原项目已不存在，且未提供恢复目标项目`,
              );
            }
            requireProject(fallbackProjectId);
            target = fallbackProjectId;
          }
          const { archivedAt: _archivedAt, projectName: _projectName, ...todo } = a;
          todos.push({ ...todo, projectId: target, updatedAt: nowIso() });
          archived.splice(idx, 1);
          n += 1;
        }
        if (n > 0) emit({ kind: 'todos', projectIds: [] });
        return n;
      },
      async purgeArchived(ids: string[]): Promise<number> {
        let n = 0;
        for (const id of ids) {
          const idx = archived.findIndex((a) => a.id === id);
          if (idx !== -1) {
            archived.splice(idx, 1);
            n += 1;
          }
        }
        if (n > 0) emit({ kind: 'todos', projectIds: [] });
        return n;
      },
      async purgeAllArchived(): Promise<number> {
        const n = archived.length;
        archived.length = 0;
        if (n > 0) emit({ kind: 'todos', projectIds: [] });
        return n;
      },
      async search(query: SearchQuery): Promise<TodoPage> {
        const term = query.term.trim();
        if (!term) throw new RepositoryError('invalid', '搜索词不能为空');
        let rows = todos.filter((t) => searchFilter(t, term));
        if (query.projectId !== undefined && query.projectId !== null) {
          rows = rows.filter((t) => t.projectId === query.projectId);
        }
        if (query.completed !== undefined && query.completed !== null) {
          rows = rows.filter((t) => t.completed === query.completed);
        }
        rows = sortTodosBy(rows, 'created-desc');
        return pageOf(rows, 'search', clampLimit(query.limit), query.cursor ?? null);
      },
    },

    projects: {
      async list(includeArchived = false): Promise<ProjectDto[]> {
        const rows = includeArchived
          ? [...projects]
          : projects.filter((p) => p.archivedAt === null);
        return rows.sort((a, b) =>
          a.rank !== b.rank ? a.rank - b.rank : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
        );
      },
      async get(id: string): Promise<ProjectDto | null> {
        return findProject(id) ?? null;
      },
      async create(newProject: NewProject): Promise<ProjectDto> {
        const name = newProject.name.trim();
        if (!name) throw new RepositoryError('invalid', '项目名不能为空');
        if (newProject.kind === 'inbox') {
          throw new RepositoryError('invalid', '收集箱只能由 ensureInbox 创建，且全局唯一');
        }
        if (findProject(newProject.id)) {
          throw new RepositoryError('invalid', `创建项目失败: 主键冲突 ${newProject.id}`);
        }
        const now = nowIso();
        const project: ProjectDto = {
          id: newProject.id,
          name,
          kind: newProject.kind,
          color: newProject.color ?? null,
          rank: newProject.rank ?? nextRank(),
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        };
        projects.push(project);
        emit({ kind: 'projects', projectIds: [project.id] });
        return { ...project };
      },
      async update(id: string, patch: ProjectPatch): Promise<ProjectDto> {
        const project = requireProject(id);
        const now = nowIso();
        if (patch.name !== undefined && patch.name !== null) {
          const name = patch.name.trim();
          if (!name) throw new RepositoryError('invalid', '项目名不能为空');
          project.name = name;
        }
        if (patch.color !== undefined) project.color = patch.color;
        if (patch.archived !== undefined && patch.archived !== null) {
          project.archivedAt = patch.archived ? nowIso() : null;
        }
        project.updatedAt = now;
        emit({ kind: 'projects', projectIds: [id] });
        return { ...project };
      },
      async reorder(payload: ReorderProjects): Promise<number> {
        const now = nowIso();
        let n = 0;
        payload.orderedIds.forEach((id, i) => {
          const project = findProject(id);
          if (!project) return;
          project.rank = i * RANK_GAP;
          project.updatedAt = now;
          n += 1;
        });
        if (n > 0) emit({ kind: 'projects', projectIds: [] });
        return n;
      },
      async deletePermanently(id: string): Promise<void> {
        requireProject(id);
        const ids = todos.filter((t) => t.projectId === id).map((t) => t.id);
        archiveIds(ids);
        const idx = projects.findIndex((p) => p.id === id);
        projects.splice(idx, 1);
        emit({ kind: 'projects', projectIds: [id] });
      },
      async ensureInbox(): Promise<ProjectDto> {
        const existing = projects.find((p) => p.kind === 'inbox');
        if (existing) return { ...existing };
        const now = nowIso();
        const inbox: ProjectDto = {
          id: crypto.randomUUID(),
          name: '收集箱',
          kind: 'inbox',
          color: null,
          rank: nextRank(),
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
        };
        projects.push(inbox);
        emit({ kind: 'projects', projectIds: [inbox.id] });
        return { ...inbox };
      },
    },

    settings: {
      async get(key: string): Promise<string | null> {
        return settings.get(key) ?? null;
      },
      async set(key: string, value: string): Promise<void> {
        settings.set(key, value);
        emit({ kind: 'settings', projectIds: [] });
      },
      async setBulk(entries: SettingsKv[]): Promise<void> {
        for (const kv of entries) settings.set(kv.key, kv.value);
        emit({ kind: 'settings', projectIds: [] });
      },
      async all(): Promise<SettingsKv[]> {
        return [...settings.entries()]
          .map(([key, value]) => ({ key, value }))
          .sort((a, b) => (a.key < b.key ? -1 : 1));
      },
      async byPrefix(prefix: string): Promise<SettingsKv[]> {
        const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^${escaped}`);
        return (await this.all()).filter((kv) => re.test(kv.key));
      },
      async delete(key: string): Promise<void> {
        settings.delete(key);
        emit({ kind: 'settings', projectIds: [] });
      },
    },

    feed,

    snapshot() {
      return {
        projects: projects.map((p) => ({ ...p })),
        todos: todos.map((t) => ({ ...t })),
        archivedTodos: archived.map((a) => ({ ...a })),
        settings: [...settings.entries()].map(([key, value]) => ({ key, value })),
      };
    },
  };
}
