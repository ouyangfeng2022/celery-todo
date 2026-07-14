/**
 * @file better-sqlite3 数据访问层
 * @description 直接读写 Celery Todo 的 SQLite 文件（与 App 同一份库）。
 *
 * 设计要点：
 * - **只读 schema 不迁移**：假设 DB 已被 App 至少启动一次并初始化完成。
 *   启动时校验核心表存在；缺失则报错提示「先启动一次 App」。
 * - better-sqlite3 是同步 API，每次写立即落盘（无 App 的 500ms 防抖），
 *   因此 CLI 退出后数据立刻可见。代价是与运行中的 App 并发写存在覆盖风险，
 *   由 process-check.ts 在写操作前做 best-effort 检测。
 * - row mapper 复刻 src/utils/database.ts 的 rowToTodo/rowToProject，保持
 *   snake_case → camelCase 一致，避免类型错位。
 * - 所有写操作走统一的 exec()，集中开启外键约束与异常处理。
 */

import Database from 'better-sqlite3';
import type { Database as DbConnection, Statement } from 'better-sqlite3';
import * as crypto from 'node:crypto';
import type { DeletedTodo, Priority, Project, Todo } from './types';

/** 数据库行原始类型（snake_case） */
interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
}

interface TodoRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  completed: number;
  priority: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  sort_order: number;
}

interface DeletedTodoRow extends TodoRow {
  deleted_at: string;
  expires_at: string;
}

// ============================================
// row mapper
// ============================================

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.sort_order,
  };
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    completed: row.completed === 1,
    priority: row.priority as Priority,
    dueDate: row.due_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    order: row.sort_order,
  };
}

function rowToDeletedTodo(row: DeletedTodoRow): DeletedTodo {
  return {
    ...rowToTodo(row),
    deletedAt: row.deleted_at,
    expiresAt: row.expires_at,
  };
}

// ============================================
// 连接管理
// ============================================

let connection: DbConnection | null = null;

/** 预编译语句缓存（better-sqlite3 推荐复用 Statement） */
const stmtCache = new Map<string, Statement>();

function prepare(sql: string): Statement {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    if (!connection) throw new Error('数据库未打开');
    stmt = connection.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

/** 当前连接的打开模式（用于判定 reopen 是否必要） */
let currentReadOnly: boolean | null = null;
let currentPath: string | null = null;

/**
 * 打开数据库文件（只读模式可选）。
 * @param filePath 数据库绝对路径
 * @param readOnly true 时以只读模式打开，写操作会抛错（用于纯查询命令）
 *
 * 幂等语义：若已用相同 path + 相同模式打开，则直接返回；若模式不同，先关闭再重开。
 * 这样「先 openReadOnly 预览 → 再 openReadWrite 提交」的命令模式可行。
 */
export function openDatabase(filePath: string, readOnly = false): void {
  if (connection && currentPath === filePath && currentReadOnly === readOnly) return;
  if (connection) closeDatabase();
  connection = new Database(filePath, {
    readonly: readOnly,
    fileMustExist: true,
  });
  currentPath = filePath;
  currentReadOnly = readOnly;
  connection.pragma('foreign_keys = ON');
  validateSchema(connection);
}

/**
 * 校验核心表存在。
 * 不做迁移：CLI 只对已初始化的库操作，缺失表说明用户从未启动 App。
 */
function validateSchema(db: DbConnection): void {
  const required = ['projects', 'todos', 'deleted_todos', 'settings'];
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string;
  }[];
  const existing = new Set(row.map((r) => r.name));
  const missing = required.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    throw new Error(
      `数据库缺少表 [${missing.join(', ')}]。\n` +
        '这通常意味着你还没有启动过 Celery Todo 桌面应用。\n' +
        '请先启动一次应用以完成初始化，再使用 CLI。',
    );
  }
}

/** 关闭连接（进程退出时自动处理；测试与显式 reset 用） */
export function closeDatabase(): void {
  if (connection) {
    // better-sqlite3 写操作同步落盘，无需额外 checkpoint；直接关闭即可。
    connection.close();
    connection = null;
    currentReadOnly = null;
    currentPath = null;
    stmtCache.clear();
  }
}

// ============================================
// 通用查询
// ============================================

function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  return prepare(sql).all(...params) as T[];
}

function queryOne<T>(sql: string, params: unknown[] = []): T | null {
  return (prepare(sql).get(...params) as T) ?? null;
}

/** 执行写语句；better-sqlite3 同步落盘 */
function exec(sql: string, params: unknown[] = []): void {
  prepare(sql).run(...params);
}

// ============================================
// ID 生成（与 src/utils/helpers.ts generateId 一致）
// ============================================

export function generateId(): string {
  return crypto.randomUUID();
}

// ============================================
// Projects 数据访问
// ============================================

export function getAllProjects(): Project[] {
  return queryAll<ProjectRow>('SELECT * FROM projects ORDER BY sort_order ASC, created_at ASC').map(
    rowToProject,
  );
}

export function getProjectById(id: string): Project | null {
  const row = queryOne<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
  return row ? rowToProject(row) : null;
}

/**
 * 解析项目参数：支持完整 id、id 前缀、唯一名称（或名称前缀）。
 * @param input 用户输入的项目标识
 * @returns 命中的项目；不唯一或未命中时抛错
 */
export function resolveProject(input: string): Project {
  const projects = getAllProjects();
  // 1. 完整 id
  const byId = projects.find((p) => p.id === input);
  if (byId) return byId;
  // 2. id 前缀（仅当唯一匹配）
  const idPrefixMatches = projects.filter((p) => p.id.startsWith(input));
  if (idPrefixMatches.length === 1) return idPrefixMatches[0];
  if (idPrefixMatches.length > 1) {
    throw new Error(`项目标识 "${input}" 匹配到多个 id 前缀，请提供更长的前缀`);
  }
  // 3. 名称完全相等（忽略大小写）
  const lower = input.toLowerCase();
  const byName = projects.filter((p) => p.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(`存在多个名为 "${input}" 的项目，请改用 id`);
  }
  // 4. 名称前缀（唯一）
  const namePrefixMatches = projects.filter((p) => p.name.toLowerCase().startsWith(lower));
  if (namePrefixMatches.length === 1) return namePrefixMatches[0];
  if (namePrefixMatches.length > 1) {
    throw new Error(`项目名 "${input}" 匹配到多个项目，请提供更完整名称`);
  }
  throw new Error(`未找到项目 "${input}"。运行 \`celery projects\` 查看所有项目`);
}

export function insertProject(project: Project): void {
  // 与 src/utils/database.ts insertProject 一致：未指定 order 时取 MAX+1
  exec(
    `INSERT INTO projects (id, name, color, created_at, updated_at, sort_order)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects)))`,
    [
      project.id,
      project.name,
      project.color ?? null,
      project.createdAt,
      project.updatedAt,
      project.order ?? null,
    ],
  );
}

export function deleteProject(id: string): void {
  // 与 App 一致：先删 todos 和归档，再删项目（外键 ON DELETE CASCADE 也兜底）
  exec('DELETE FROM todos WHERE project_id = ?', [id]);
  exec('DELETE FROM deleted_todos WHERE project_id = ?', [id]);
  exec('DELETE FROM projects WHERE id = ?', [id]);
}

// ============================================
// Todos 数据访问
// ============================================

export function getTodosByProject(projectId: string): Todo[] {
  return queryAll<TodoRow>(
    'SELECT * FROM todos WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC',
    [projectId],
  ).map(rowToTodo);
}

export function getAllTodos(): Todo[] {
  return queryAll<TodoRow>('SELECT * FROM todos ORDER BY created_at DESC').map(rowToTodo);
}

export function getTodoById(id: string): Todo | null {
  const row = queryOne<TodoRow>('SELECT * FROM todos WHERE id = ?', [id]);
  return row ? rowToTodo(row) : null;
}

/**
 * 解析 todo id：支持完整 id 与唯一前缀。
 * @param input 用户输入的 id 标识
 * @returns 命中的 todo；不唯一或未命中时抛错
 */
export function resolveTodo(input: string): Todo {
  // 1. 完整 id（todos 表）
  const exact = getTodoById(input);
  if (exact) return exact;
  // 2. id 前缀
  const rows = queryAll<TodoRow>(
    `SELECT * FROM todos WHERE id LIKE ? ESCAPE '\\' ORDER BY created_at DESC`,
    [escapeLikePrefix(input)],
  );
  const matches = rows.map(rowToTodo);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const list = matches.map((m) => `  ${m.id.slice(0, 8)}  ${m.title}`).join('\n');
    throw new Error(`标识 "${input}" 匹配到多个待办：\n${list}\n请提供更长的前缀`);
  }
  throw new Error(`未找到待办 "${input}"`);
}

/** 把 LIKE 的前缀转义：仅允许 _ 与 % 作为通配，这里用户输入视作字面量前缀 */
function escapeLikePrefix(input: string): string {
  const escaped = input.replace(/[%_\\]/g, (m) => `\\${m}`);
  return `${escaped}%`;
}

export function insertTodo(todo: Todo): void {
  exec(
    `INSERT INTO todos (id, project_id, title, description, completed, priority, due_date, created_at, updated_at, completed_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.projectId,
      todo.title,
      todo.description ?? null,
      todo.completed ? 1 : 0,
      todo.priority,
      todo.dueDate ?? null,
      todo.createdAt,
      todo.updatedAt,
      todo.completedAt ?? null,
      todo.order,
    ],
  );
}

export function updateTodo(todo: Todo): void {
  exec(
    `UPDATE todos SET title = ?, description = ?, completed = ?, priority = ?, due_date = ?, updated_at = ?, completed_at = ?, sort_order = ?
     WHERE id = ?`,
    [
      todo.title,
      todo.description ?? null,
      todo.completed ? 1 : 0,
      todo.priority,
      todo.dueDate ?? null,
      todo.updatedAt,
      todo.completedAt ?? null,
      todo.order,
      todo.id,
    ],
  );
}

/** 取项目内最大 sort_order + 1（新 todo 默认追加到末尾） */
export function nextSortOrder(projectId: string): number {
  const row = queryOne<{ m: number | null }>(
    'SELECT MAX(sort_order) AS m FROM todos WHERE project_id = ?',
    [projectId],
  );
  return (row?.m ?? 0) + 1;
}

// ============================================
// 归档数据访问（原回收站 / 历史记录）
// ============================================

export function getAllDeletedTodos(): DeletedTodo[] {
  return queryAll<DeletedTodoRow>('SELECT * FROM deleted_todos ORDER BY deleted_at DESC').map(
    rowToDeletedTodo,
  );
}

export function getDeletedTodoById(id: string): DeletedTodo | null {
  const row = queryOne<DeletedTodoRow>('SELECT * FROM deleted_todos WHERE id = ?', [id]);
  return row ? rowToDeletedTodo(row) : null;
}

/**
 * 解析归档 id（与 resolveTodo 类似，但查 deleted_todos）。
 */
export function resolveDeletedTodo(input: string): DeletedTodo {
  const exact = getDeletedTodoById(input);
  if (exact) return exact;
  const rows = queryAll<DeletedTodoRow>(
    `SELECT * FROM deleted_todos WHERE id LIKE ? ESCAPE '\\' ORDER BY deleted_at DESC`,
    [escapeLikePrefix(input)],
  );
  const matches = rows.map(rowToDeletedTodo);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const list = matches.map((m) => `  ${m.id.slice(0, 8)}  ${m.title}`).join('\n');
    throw new Error(`标识 "${input}" 匹配到多个归档项：\n${list}\n请提供更长的前缀`);
  }
  throw new Error(`未找到归档项 "${input}"`);
}

export function insertDeletedTodo(todo: DeletedTodo): void {
  exec(
    `INSERT INTO deleted_todos (id, project_id, title, description, completed, priority, due_date, created_at, updated_at, completed_at, sort_order, deleted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      todo.id,
      todo.projectId,
      todo.title,
      todo.description ?? null,
      todo.completed ? 1 : 0,
      todo.priority,
      todo.dueDate ?? null,
      todo.createdAt,
      todo.updatedAt,
      todo.completedAt ?? null,
      todo.order,
      todo.deletedAt,
      todo.expiresAt,
    ],
  );
}

/** 软删除：把 todo 搬入 deleted_todos 后从 todos 删除 */
export function softDeleteTodo(todo: Todo, deletedAt: string, expiresAt: string): void {
  insertDeletedTodo({ ...todo, deletedAt, expiresAt });
  exec('DELETE FROM todos WHERE id = ?', [todo.id]);
}

/** 从归档恢复：重新插入 todos 并从 deleted_todos 删除（updated_at 刷新为 now） */
export function restoreFromArchive(id: string, now: string): void {
  const row = queryOne<DeletedTodoRow>('SELECT * FROM deleted_todos WHERE id = ?', [id]);
  if (!row) throw new Error(`归档中不存在 ${id}`);
  exec(
    `INSERT INTO todos (id, project_id, title, description, completed, priority, due_date, created_at, updated_at, completed_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.project_id,
      row.title,
      row.description,
      row.completed,
      row.priority,
      row.due_date,
      row.created_at,
      now,
      row.completed_at,
      row.sort_order,
    ],
  );
  exec('DELETE FROM deleted_todos WHERE id = ?', [id]);
}

/** 清空归档：传 projectId 时只清该项目，否则清全部 */
export function emptyArchive(projectId?: string): void {
  if (projectId) {
    exec('DELETE FROM deleted_todos WHERE project_id = ?', [projectId]);
  } else {
    exec('DELETE FROM deleted_todos', []);
  }
}

/** 永久删除单个归档项 */
export function permanentlyDeleteTodo(id: string): void {
  exec('DELETE FROM deleted_todos WHERE id = ?', [id]);
}

// ============================================
// 设置
// ============================================

export function getSetting(key: string): string | null {
  const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row?.value ?? null;
}

/** 读取 schema 版本（settings.dataVersion），未持久化时返回 null */
export function getDataVersion(): number | null {
  const raw = getSetting('dataVersion');
  if (raw === null) return null;
  const v = Number.parseInt(raw, 10);
  return Number.isNaN(v) ? null : v;
}
