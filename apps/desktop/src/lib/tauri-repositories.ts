/**
 * @file Tauri 命令桥
 * @description 把 @celery/data 的 Repository 契约映射到 src-tauri 的强类型命令。
 *              UI / 用例层只见 Repositories 接口；这里是与桌面 Rust 侧唯一的边界
 *              （不暴露任意 invoke 名称，不暴露 SQL）。
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  ArchivedQuery,
  ArchivedTodoPage,
  BatchTodoPatch,
  MoveTodos,
  NewProject,
  NewTodo,
  ProjectDto,
  ProjectPatch,
  Repositories,
  ReorderProjects,
  ReorderTodos,
  SearchQuery,
  SettingsKv,
  TodoCounts,
  TodoDto,
  TodoPage,
  TodoPatch,
  TodoQuery,
} from '@celery/data';
import { RepositoryError } from '@celery/data';

/** 把 Tauri IPC 错误（序列化的 ErrorPayload）转成统一 RepositoryError。 */
function toRepositoryError(err: unknown): RepositoryError {
  if (typeof err === 'object' && err !== null && 'kind' in err && 'message' in err) {
    const { kind, message } = err as { kind: string; message: string };
    if (kind === 'not-found' || kind === 'invalid' || kind === 'db' || kind === 'bad-cursor') {
      return new RepositoryError(kind, message);
    }
  }
  return new RepositoryError('db', String(err));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    throw toRepositoryError(err);
  }
}

/** 与 src-tauri/src/commands.rs 的命令一一对应。 */
export function createTauriRepositories(): Repositories {
  return {
    todos: {
      page: (query: TodoQuery) => call<TodoPage>('todo_page', { query }),
      counts: (projectId?: string | null) =>
        call<TodoCounts>('todo_counts', { projectId: projectId ?? null }),
      get: (id: string) => call<TodoDto | null>('get_todo', { id }),
      create: (newTodo: NewTodo) => call<TodoDto>('create_todo', { newTodo }),
      createBulk: (items: NewTodo[]) => call<number>('create_todos_bulk', { items }),
      update: (id: string, patch: TodoPatch) => call<TodoDto>('update_todo', { id, patch }),
      batchUpdate: (payload: BatchTodoPatch) => call<number>('batch_update_todos', { payload }),
      move: (payload: MoveTodos) => call<number>('move_todos', { payload }),
      reorder: (payload: ReorderTodos) => call<number>('reorder_todos', { payload }),
      archive: (ids: string[]) => call<number>('archive_todos', { ids }),
      archivedPage: (query: ArchivedQuery) => call<ArchivedTodoPage>('archived_page', { query }),
      restoreArchived: (ids: string[], fallbackProjectId?: string | null) =>
        call<number>('restore_archived', { ids, fallbackProjectId: fallbackProjectId ?? null }),
      purgeArchived: (ids: string[]) => call<number>('purge_archived', { ids }),
      purgeAllArchived: () => call<number>('purge_all_archived'),
      search: (query: SearchQuery) => call<TodoPage>('search_todos', { query }),
    },
    projects: {
      list: (includeArchived = false) => call<ProjectDto[]>('list_projects', { includeArchived }),
      get: (id: string) => call<ProjectDto | null>('get_project', { id }),
      create: (newProject: NewProject) => call<ProjectDto>('create_project', { newProject }),
      update: (id: string, patch: ProjectPatch) =>
        call<ProjectDto>('update_project', { id, patch }),
      reorder: (payload: ReorderProjects) => call<number>('reorder_projects', { payload }),
      deletePermanently: (id: string) => call<void>('delete_project_permanently', { id }),
      ensureInbox: () => call<ProjectDto>('ensure_inbox'),
    },
    settings: {
      get: (key: string) => call<string | null>('get_setting', { key }),
      set: (key: string, value: string) => call<void>('set_setting', { key, value }),
      setBulk: (entries: SettingsKv[]) => call<void>('set_settings_bulk', { entries }),
      all: () => call<SettingsKv[]>('all_settings'),
      byPrefix: (prefix: string) => call<SettingsKv[]>('settings_by_prefix', { prefix }),
      delete: (key: string) => call<void>('delete_setting', { key }),
    },
  };
}
