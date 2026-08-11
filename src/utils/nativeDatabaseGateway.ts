/** Electron 主进程 SQLite 的异步、受限网关。renderer 不会通过它执行任意 SQL。 */
import type { DeletedTodo, Priority, Project, Todo } from '../types';

type Row = Record<string, unknown>;
type DataChangedListener = (event: {
  revision: number;
  projectIds: string[];
  projectsChanged: boolean;
  settingsChanged: boolean;
  archiveChanged: boolean;
  fullRefresh: boolean;
}) => void;

const api = (): NonNullable<Window['electronAPI']> => {
  if (!window.electronAPI?.dataQuery || !window.electronAPI?.dataCommand) {
    throw new Error('主进程数据网关不可用');
  }
  return window.electronAPI;
};

function project(row: Row): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    color: (row.color as string | null) ?? undefined,
    kind: row.kind === 'inbox' ? 'inbox' : row.kind === 'weekly' ? 'weekly' : 'user',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    order: Number(row.sort_order),
  };
}

function todo(row: Row): Todo {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    title: String(row.title),
    description: (row.description as string | null) ?? undefined,
    completed: Number(row.completed) === 1,
    priority: row.priority as Priority,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: (row.completed_at as string | null) ?? undefined,
    order: Number(row.sort_order),
    pinned: Number(row.pinned) === 1,
    plannedDate: (row.planned_date as string | null) ?? undefined,
  };
}

function deletedTodo(row: Row): DeletedTodo {
  return {
    ...todo(row),
    projectName: (row.project_name as string | null) ?? undefined,
    deletedAt: String(row.deleted_at),
    expiresAt: String(row.expires_at),
  };
}

export const nativeDatabaseGateway = {
  isAvailable: (): boolean =>
    Boolean(window.electronAPI?.dataQuery && window.electronAPI?.dataCommand),
  getProjects: async (): Promise<Project[]> =>
    ((await api().dataQuery('projects')) as Row[]).map(project),
  getTodosByProject: async (projectId: string): Promise<Todo[]> =>
    ((await api().dataQuery('todosByProject', { projectId })) as Row[]).map(todo),
  getDeletedByProject: async (projectId: string): Promise<DeletedTodo[]> =>
    ((await api().dataQuery('deletedByProject', { projectId })) as Row[]).map(deletedTodo),
  getSettings: async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      ((await api().dataQuery('settings')) as Row[]).map((row) => [
        String(row.key),
        String(row.value),
      ]),
    ),
  getAllTodos: async (): Promise<Todo[]> =>
    ((await api().dataQuery('allTodos')) as Row[]).map(todo),
  getAllDeletedTodos: async (): Promise<DeletedTodo[]> =>
    ((await api().dataQuery('allDeleted')) as Row[]).map(deletedTodo),
  getDeletedCount: async (): Promise<number> => Number(await api().dataQuery('deletedCount')),
  getDeletedPage: async (
    limit: number,
    cursor?: { deletedAt: string; id: string },
  ): Promise<DeletedTodo[]> =>
    ((await api().dataQuery('deletedPage', { limit, cursor })) as Row[]).map(deletedTodo),
  searchTodos: async (keyword: string): Promise<Todo[]> =>
    ((await api().dataQuery('search', { keyword })) as Row[]).map(todo),
  getIncompleteCounts: async (): Promise<Record<string, number>> =>
    Object.fromEntries(
      ((await api().dataQuery('incompleteCounts')) as Row[]).map((row) => [
        String(row.project_id),
        Number(row.count),
      ]),
    ),
  moveTodoRank: async (projectId: string, sourceId: string, targetId: string): Promise<Todo[]> =>
    ((await api().dataCommand('moveTodoRank', { projectId, sourceId, targetId })) as Row[]).map(
      todo,
    ),
  moveProjectRank: async (sourceId: string, targetId: string): Promise<Project[]> =>
    ((await api().dataCommand('moveProjectRank', { sourceId, targetId })) as Row[]).map(project),
  ensureInboxProject: async (): Promise<Project> =>
    project((await api().dataCommand('ensureInboxProject')) as Row),
  insertTodosIntoInbox: async (todos: Todo[]): Promise<Project> =>
    project((await api().dataCommand('insertTodosIntoInbox', { todos })) as Row),
  moveTodoToProject: async (id: string, targetProjectId: string): Promise<Todo> =>
    todo((await api().dataCommand('moveTodoToProject', { id, targetProjectId })) as Row),
  command: (name: string, params?: Record<string, unknown>): Promise<unknown> =>
    api().dataCommand(name, params),
  onChanged: (callback: DataChangedListener): (() => void) =>
    api().onRepositoryDataChanged(callback),
};
