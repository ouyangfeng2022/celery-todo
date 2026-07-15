/**
 * @file 数据访问统一接口（双模式分派层）
 * @description CLI 所有命令通过本模块访问数据。本模块根据 detectMode() 的结果
 *              在两条路径间分派：
 *
 *   - 'ipc' 模式（GUI 运行中）：经 Unix socket/命名管道调用渲染进程的 store action。
 *     写入经 store → set() → React 实时重渲染 → GUI 即时刷新；读操作返回 GUI
 *     内存中的当前状态。**这是 CLI 与 GUI 同时工作的核心路径。**
 *
 *   - 'direct' 模式（GUI 未运行）：回退到 db-direct.ts，用 better-sqlite3 直接
 *     读写文件。适用于离线场景或 GUI 未安装的环境。
 *
 * 所有函数统一为 async（即使直连模式本身同步），让命令层不必关心模式差异。
 *
 * 模式探测在 detectMode() 内缓存，整个 CLI 进程只探测一次。
 */

import * as direct from './db-direct';
import { detectMode, getMode, ipcCall } from './ipc';
import type { DeletedTodo, Project, Todo } from './types';

// ============================================
// 模式与生命周期
// ============================================

/** 当前模式（detect 后缓存） */
export type Mode = 'ipc' | 'direct';

/**
 * 探测并缓存当前模式。命令层应在首次数据访问前调用一次。
 * 重复调用返回缓存值。
 */
export async function resolveMode(): Promise<Mode> {
  return detectMode();
}

/** 获取已探测的模式（未探测返回 null） */
export function currentMode(): Mode | null {
  return getMode();
}

/**
 * 直连模式：打开数据库文件。IPC 模式下为空操作（数据在 GUI 内存）。
 * @param filePath 数据库路径
 * @param readOnly 只读模式（查询命令用）
 */
export async function openDatabase(filePath: string, readOnly = false): Promise<void> {
  if (getMode() === 'ipc') return;
  direct.openDatabase(filePath, readOnly);
}

/** 直连模式：关闭连接。IPC 模式下为空操作 */
export async function closeDatabase(): Promise<void> {
  direct.closeDatabase();
}

// ============================================
// 通用：generateId（两模式共用，本地生成即可）
// ============================================

export function generateId(): string {
  return direct.generateId();
}

// ============================================
// 只读查询
// ============================================

export async function getAllProjects(): Promise<Project[]> {
  if (getMode() === 'ipc') {
    return ipcCall<Project[]>('getAllProjects');
  }
  return direct.getAllProjects();
}

export async function getProjectById(id: string): Promise<Project | null> {
  if (getMode() === 'ipc') {
    const all = await getAllProjects();
    return all.find((p) => p.id === id) ?? null;
  }
  return direct.getProjectById(id);
}

export async function getAllTodos(): Promise<Todo[]> {
  if (getMode() === 'ipc') {
    return ipcCall<Todo[]>('getAllTodos');
  }
  return direct.getAllTodos();
}

export async function getTodosByProject(projectId: string): Promise<Todo[]> {
  if (getMode() === 'ipc') {
    const all = await getAllTodos();
    return all.filter((t) => t.projectId === projectId);
  }
  return direct.getTodosByProject(projectId);
}

export async function getTodoById(id: string): Promise<Todo | null> {
  if (getMode() === 'ipc') {
    const all = await getAllTodos();
    return all.find((t) => t.id === id) ?? null;
  }
  return direct.getTodoById(id);
}

export async function getAllDeletedTodos(): Promise<DeletedTodo[]> {
  if (getMode() === 'ipc') {
    return ipcCall<DeletedTodo[]>('getAllDeletedTodos');
  }
  return direct.getAllDeletedTodos();
}

export async function getDeletedTodoById(id: string): Promise<DeletedTodo | null> {
  if (getMode() === 'ipc') {
    const all = await getAllDeletedTodos();
    return all.find((t) => t.id === id) ?? null;
  }
  return direct.getDeletedTodoById(id);
}

export async function getSetting(key: string): Promise<string | null> {
  if (getMode() === 'ipc') {
    return ipcCall<string | null>('getSetting', { key });
  }
  return direct.getSetting(key);
}

export async function getDataVersion(): Promise<number | null> {
  if (getMode() === 'ipc') {
    const v = await getSetting('dataVersion');
    if (v === null) return null;
    const n = Number.parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  }
  return direct.getDataVersion();
}

// ============================================
// 解析（前缀匹配）—— 两模式都本地完成，基于 getAllTodos 结果
// ============================================

/**
 * 按 id 或前缀解析 todo。
 * IPC 模式：拉取全部 todos 后本地匹配（前缀解析本就是 CLI 端逻辑）。
 * 直连模式：走 db-direct 的 SQL LIKE。
 */
export async function resolveTodo(input: string): Promise<Todo> {
  if (getMode() === 'ipc') {
    // 完整 id
    const exact = await getTodoById(input);
    if (exact) return exact;
    // 前缀
    const all = await getAllTodos();
    const matches = all.filter((t) => t.id.startsWith(input));
    return pickUnique(matches, input, '待办');
  }
  return direct.resolveTodo(input);
}

export async function resolveDeletedTodo(input: string): Promise<DeletedTodo> {
  if (getMode() === 'ipc') {
    const exact = await getDeletedTodoById(input);
    if (exact) return exact;
    const all = await getAllDeletedTodos();
    const matches = all.filter((t) => t.id.startsWith(input));
    return pickUnique(matches, input, '归档项');
  }
  return direct.resolveDeletedTodo(input);
}

export async function resolveProject(input: string): Promise<Project> {
  if (getMode() === 'ipc') {
    // 完整 id
    const all = await getAllProjects();
    const byId = all.find((p) => p.id === input);
    if (byId) return byId;
    // id 前缀
    const idPrefix = all.filter((p) => p.id.startsWith(input));
    if (idPrefix.length === 1) return idPrefix[0];
    if (idPrefix.length > 1) {
      throw new Error(`项目标识 "${input}" 匹配到多个 id 前缀，请提供更长的前缀`);
    }
    // 名称（忽略大小写）
    const lower = input.toLowerCase();
    const byName = all.filter((p) => p.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) throw new Error(`存在多个名为 "${input}" 的项目，请改用 id`);
    // 名称前缀
    const namePrefix = all.filter((p) => p.name.toLowerCase().startsWith(lower));
    if (namePrefix.length === 1) return namePrefix[0];
    if (namePrefix.length > 1) {
      throw new Error(`项目名 "${input}" 匹配到多个项目，请提供更完整名称`);
    }
    throw new Error(`未找到项目 "${input}"。运行 \`celery projects\` 查看所有项目`);
  }
  return direct.resolveProject(input);
}

/** 前缀匹配通用收尾：唯一返回，多个抛歧义，零个抛未找到 */
function pickUnique<T extends { id: string; title?: string }>(
  matches: T[],
  input: string,
  label: string,
): T {
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const list = matches.map((m) => `  ${m.id.slice(0, 8)}  ${m.title ?? ''}`).join('\n');
    throw new Error(`标识 "${input}" 匹配到多个${label}：\n${list}\n请提供更长的前缀`);
  }
  throw new Error(`未找到${label} "${input}"`);
}

// ============================================
// 写操作
// ============================================

/**
 * 新增 todo。
 * IPC 模式：调渲染进程 addTodo（经 store，GUI 实时刷新）。
 * 直连模式：走 db-direct.insertTodo。
 */
export async function addTodo(params: {
  projectId: string;
  title: string;
  description?: string;
  priority?: import('./types').Priority;
  dueDate?: string;
}): Promise<{ id: string }> {
  if (getMode() === 'ipc') {
    await ipcCall('addTodo', params);
    // addTodo 在渲染端不返回 id；这里重新拉一次拿最新（按 createdAt 取最大）
    const todos = await getTodosByProject(params.projectId);
    const newest = todos
      .filter((t) => t.title === params.title)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { id: newest?.id ?? '' };
  }
  // 直连：构造完整 Todo 后插入
  const now = new Date().toISOString();
  const order = await nextSortOrder(params.projectId);
  const todo: Todo = {
    id: generateId(),
    projectId: params.projectId,
    title: params.title.trim(),
    description: params.description?.trim() || undefined,
    completed: false,
    priority: params.priority ?? 'medium',
    dueDate: params.dueDate,
    createdAt: now,
    updatedAt: now,
    order,
    pinned: false,
  };
  direct.insertTodo(todo);
  return { id: todo.id };
}

/**
 * 更新 todo 字段。
 * IPC 模式：调渲染进程 updateTodo（Partial 更新，经 store）。
 * 直连模式：先读完整 todo，合并后整行写回。
 */
export async function updateTodoFields(
  id: string,
  updates: Partial<
    Pick<Todo, 'title' | 'description' | 'completed' | 'priority' | 'dueDate' | 'completedAt' | 'pinned'>
  >,
): Promise<void> {
  if (getMode() === 'ipc') {
    await ipcCall('updateTodo', { id, updates });
    return;
  }
  const todo = await getTodoById(id);
  if (!todo) throw new Error(`未找到待办 ${id}`);
  direct.updateTodo({ ...todo, ...updates, updatedAt: new Date().toISOString() });
}

/**
 * 切换完成状态。
 * IPC 模式：调 toggleTodo。
 * 直连模式：读 + 翻转 + 写回。
 */
export async function toggleTodo(id: string): Promise<void> {
  if (getMode() === 'ipc') {
    await ipcCall('toggleTodo', { id });
    return;
  }
  const todo = await getTodoById(id);
  if (!todo) throw new Error(`未找到待办 ${id}`);
  const now = new Date().toISOString();
  const completed = !todo.completed;
  direct.updateTodo({
    ...todo,
    completed,
    completedAt: completed ? now : undefined,
    updatedAt: now,
  });
}

/**
 * 软删除（移入归档）。
 * IPC 模式：调 deleteTodo（store 内部处理归档插入 + todos 删除）。
 * 直连模式：softDeleteTodo。
 */
export async function deleteTodo(id: string): Promise<void> {
  if (getMode() === 'ipc') {
    await ipcCall('deleteTodo', { id });
    return;
  }
  const todo = await getTodoById(id);
  if (!todo) throw new Error(`未找到待办 ${id}`);
  const now = new Date().toISOString();
  direct.softDeleteTodo(todo, now, new Date(Date.now() + 30 * 86400000).toISOString());
}

/**
 * 从归档恢复。
 * IPC 模式：调 restoreTodo（store 处理搬移 + 重拉列表）。
 * 直连模式：restoreFromArchive。
 */
export async function restoreTodo(id: string): Promise<void> {
  if (getMode() === 'ipc') {
    await ipcCall('restoreTodo', { id });
    return;
  }
  direct.restoreFromArchive(id, new Date().toISOString());
}

/**
 * 永久删除归档项。
 * IPC 模式：调 permanentlyDelete。
 * 直连模式：permanentlyDeleteTodo。
 */
export async function permanentlyDelete(id: string): Promise<void> {
  if (getMode() === 'ipc') {
    await ipcCall('permanentlyDelete', { id });
    return;
  }
  direct.permanentlyDeleteTodo(id);
}

/**
 * 清空归档。
 * @param scope 'all' 全局清空 | 'currentProject' 仅当前项目
 * @param projectId scope='currentProject' 时指定项目
 */
export async function emptyArchive(
  scope: 'all' | 'currentProject' = 'all',
  projectId?: string,
): Promise<void> {
  if (getMode() === 'ipc') {
    if (scope === 'all') {
      await ipcCall('emptyArchiveAll');
    } else {
      // store.emptyArchive 仅清当前项目；CLI 想清指定项目时，先 setActiveProject
      // 但 setActiveProject 会让 GUI 切项目，副作用大。这里仅支持「全部」与「当前」。
      await ipcCall('emptyArchive');
    }
    return;
  }
  direct.emptyArchive(scope === 'currentProject' ? projectId : undefined);
}

// ============================================
// Project 写操作
// ============================================

/**
 * 新建项目。
 * @returns 新建项目的 id
 */
export async function createProject(name: string, color?: string): Promise<{ id: string }> {
  if (getMode() === 'ipc') {
    return ipcCall<{ id: string }>('createProject', { name, color });
  }
  const now = new Date().toISOString();
  const id = generateId();
  direct.insertProject({ id, name, color, createdAt: now, updatedAt: now });
  return { id };
}

/** 删除项目（级联删除其下 todos 与归档） */
export async function deleteProject(id: string): Promise<void> {
  if (getMode() === 'ipc') {
    await ipcCall('deleteProject', { id });
    return;
  }
  direct.deleteProject(id);
}

// ============================================
// 直连模式专用辅助（IPC 模式下抛错或回退）
// ============================================

/** 取项目内最大 sort_order + 1（仅直连模式用） */
export async function nextSortOrder(projectId: string): Promise<number> {
  // IPC 模式 addTodo 在渲染端自行计算 order，CLI 不需要
  if (getMode() === 'ipc') return 0;
  return direct.nextSortOrder(projectId);
}
