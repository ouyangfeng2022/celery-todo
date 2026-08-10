/**
 * @file 跨运行时数据网关
 * @description Electron 只通过主进程仓储访问 SQLite；浏览器按需加载 sql.js 回退。
 */

import {
  DEFAULT_SETTINGS,
  STICKER_PRESET_VALUES,
  type AppExportData,
  type DeletedTodo,
  type Project,
  type Todo,
  type TodoTemplate,
} from '../types';
import { EXPORT_FORMAT_VERSION } from './export';
import { nativeDatabaseGateway } from './nativeDatabaseGateway';

type WebDatabase = typeof import('./database');

async function web(): Promise<WebDatabase> {
  return import('./database');
}

export const isNativeDatabase = (): boolean => nativeDatabaseGateway.isAvailable();

export async function initialize(): Promise<void> {
  if (!isNativeDatabase()) await (await web()).initDatabase();
}

export async function flush(): Promise<void> {
  if (!isNativeDatabase()) await (await web()).flushSave();
}

export async function exportAll(): Promise<AppExportData> {
  if (!isNativeDatabase()) return (await web()).exportAllData();
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
  return isNativeDatabase() ? nativeDatabaseGateway.getProjects() : (await web()).getAllProjects();
}

export async function getProject(id: string): Promise<Project | undefined> {
  if (!isNativeDatabase()) return (await web()).getProjectById(id) ?? undefined;
  return (await nativeDatabaseGateway.getProjects()).find((project) => project.id === id);
}

export async function getTodos(projectId: string): Promise<Todo[]> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.getTodosByProject(projectId)
    : (await web()).getTodosByProject(projectId);
}

export async function getDeletedTodos(projectId: string): Promise<DeletedTodo[]> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.getDeletedByProject(projectId)
    : (await web()).getDeletedTodosByProject(projectId);
}

export async function getSettings(): Promise<Record<string, string>> {
  return isNativeDatabase() ? nativeDatabaseGateway.getSettings() : (await web()).getSettings();
}

export async function searchTodos(keyword: string): Promise<Todo[]> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.searchTodos(keyword)
    : (await web()).searchTodos(keyword);
}

export async function getIncompleteCounts(): Promise<Record<string, number>> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.getIncompleteCounts()
    : (await web()).getIncompleteCountsByProject();
}

export async function getAllTodos(): Promise<Todo[]> {
  return isNativeDatabase() ? nativeDatabaseGateway.getAllTodos() : (await web()).getAllTodos();
}

export async function getAllDeletedTodos(): Promise<DeletedTodo[]> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.getAllDeletedTodos()
    : (await web()).getAllDeletedTodos();
}

export async function getDeletedCount(): Promise<number> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.getDeletedCount()
    : (await web()).getArchivedTodosCount();
}

export async function getDeletedPage(
  limit: number,
  cursor?: { deletedAt: string; id: string },
): Promise<DeletedTodo[]> {
  return isNativeDatabase()
    ? nativeDatabaseGateway.getDeletedPage(limit, cursor)
    : (await web()).getDeletedTodosPage(limit, cursor);
}

export async function getSetting(key: string): Promise<string | null> {
  if (!isNativeDatabase()) return (await web()).getSetting(key);
  const settings = await nativeDatabaseGateway.getSettings();
  return settings[key] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (isNativeDatabase()) {
    await nativeDatabaseGateway.command('setSetting', { key, value });
  } else {
    (await web()).setSetting(key, value);
  }
}

export async function deleteSetting(key: string): Promise<void> {
  if (isNativeDatabase()) {
    await nativeDatabaseGateway.command('deleteSetting', { key });
  } else {
    (await web()).deleteSetting(key);
  }
}

export async function insertTodo(todo: Todo): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('insertTodo', { todo });
  else (await web()).insertTodo(todo);
}

export async function insertTodos(todos: Todo[]): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('insertTodos', { todos });
  else (await web()).insertTodos(todos);
}

export async function updateTodo(todo: Todo): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('updateTodo', { todo });
  else (await web()).updateTodo(todo);
}

export async function updateTodos(todos: Todo[]): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('updateTodos', { todos });
  else (await web()).updateTodos(todos);
}

export async function moveTodoRank(
  projectId: string,
  sourceId: string,
  targetId: string,
): Promise<Todo[]> {
  if (isNativeDatabase()) return nativeDatabaseGateway.moveTodoRank(projectId, sourceId, targetId);
  return (await web()).moveTodoRank(projectId, sourceId, targetId);
}

export async function moveTodoToProject(id: string, targetProjectId: string): Promise<Todo> {
  if (isNativeDatabase()) return nativeDatabaseGateway.moveTodoToProject(id, targetProjectId);
  return (await web()).moveTodoToProject(id, targetProjectId);
}

export async function archiveTodos(todos: Todo[]): Promise<DeletedTodo[]> {
  if (isNativeDatabase()) {
    const now = new Date().toISOString();
    const archived = todos.map((todo) => ({
      ...todo,
      deletedAt: now,
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    }));
    await nativeDatabaseGateway.command('archiveTodos', { todos: archived });
    return archived;
  }
  return (await web()).archiveTodos(todos);
}

export async function restoreTodo(id: string): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('restoreTodo', { id });
  else (await web()).restoreTodo(id);
}

export async function permanentlyDelete(id: string): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('permanentlyDelete', { id });
  else (await web()).permanentlyDeleteTodo(id);
}

export async function emptyArchive(projectId?: string): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('emptyArchive', { projectId });
  else (await web()).emptyArchive(projectId);
}

export async function insertProject(project: Project): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('insertProject', { project });
  else (await web()).insertProject(project);
}

export async function updateProject(project: Project): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('updateProject', { project });
  else (await web()).updateProject(project);
}

export async function deleteProject(id: string): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('deleteProject', { id });
  else (await web()).deleteProject(id);
}

export async function moveProjectRank(sourceId: string, targetId: string): Promise<Project[]> {
  if (isNativeDatabase()) return nativeDatabaseGateway.moveProjectRank(sourceId, targetId);
  return (await web()).moveProjectRank(sourceId, targetId);
}

export async function ensureInboxProject(): Promise<Project> {
  if (isNativeDatabase()) return nativeDatabaseGateway.ensureInboxProject();
  return (await web()).ensureInboxProject();
}

export async function insertTodosIntoInbox(todos: Todo[]): Promise<Project> {
  if (isNativeDatabase()) return nativeDatabaseGateway.insertTodosIntoInbox(todos);
  return (await web()).insertTodosIntoInbox(todos);
}

export async function createProjectWithTodos(project: Project, todos: Todo[]): Promise<Project> {
  if (isNativeDatabase()) {
    await nativeDatabaseGateway.command('createProjectWithTodos', { project, todos });
    return (await getProject(project.id)) ?? project;
  }
  return (await web()).createProjectWithTodos(project, todos);
}

export async function replaceAll(data: Parameters<WebDatabase['importAllData']>[0]): Promise<void> {
  if (isNativeDatabase())
    await nativeDatabaseGateway.command('replaceAll', {
      data: data as unknown as Record<string, unknown>,
    });
  else await (await web()).importAllData(data);
}

export async function reset(): Promise<void> {
  if (isNativeDatabase()) await nativeDatabaseGateway.command('reset');
  else await (await web()).resetDatabase();
}

export function onDataChanged(
  callback: Parameters<typeof nativeDatabaseGateway.onChanged>[0],
): (() => void) | undefined {
  return isNativeDatabase() ? nativeDatabaseGateway.onChanged(callback) : undefined;
}
