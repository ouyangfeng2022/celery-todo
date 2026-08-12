/**
 * Electron 主进程的唯一 SQLite 所有者。
 *
 * 本模块不暴露 SQL：renderer/CLI 只能调用固定 query/command 名称。它在 renderer
 * 网关切换完成前不会注册 IPC，避免与旧 sql.js 写入同一文件。
 */
import Database from 'better-sqlite3';
import type { Database as DatabaseConnection } from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { ipcMain } from 'electron';
import { getCurrentDatabasePath } from './storage';
import { requireAuthorizedSender, type IpcSenderValidator } from './ipc-auth';

const DB_VERSION = 9;
const RANK_STEP = 1024;

export interface DataChangedEvent {
  revision: number;
  projectIds: string[];
  projectsChanged: boolean;
  settingsChanged: boolean;
  archiveChanged: boolean;
  fullRefresh: boolean;
  /** 仅主进程内部使用；广播到 renderer 前会被剥离。 */
  originWebContentsId?: number;
}

type ChangeScope = Partial<Omit<DataChangedEvent, 'revision'>>;
type Row = Record<string, unknown>;

let connection: DatabaseConnection | null = null;
let connectionPath: string | null = null;
let revision = 0;
let onChanged: ((event: DataChangedEvent) => void) | null = null;
let commandOriginWebContentsId: number | undefined;

function ensureSchema(db: DatabaseConnection): void {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      sort_order REAL NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'user'
    );
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium', created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, completed_at TEXT, sort_order REAL NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0, planned_date TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS deleted_todos (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT, completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium', created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, completed_at TEXT, sort_order REAL NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0, planned_date TEXT,
      project_name TEXT,
      deleted_at TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const columns = (table: string): Set<string> =>
    new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((row) => String(row.name)),
    );
  if (!columns('projects').has('sort_order')) {
    db.exec('ALTER TABLE projects ADD COLUMN sort_order REAL NOT NULL DEFAULT 0');
  }
  if (!columns('projects').has('kind')) {
    db.exec("ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'user'");
  }
  for (const table of ['todos', 'deleted_todos']) {
    if (!columns(table).has('sort_order')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN sort_order REAL NOT NULL DEFAULT 0`);
    }
    if (!columns(table).has('pinned')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
    }
    if (!columns(table).has('planned_date')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN planned_date TEXT`);
    }
  }
  if (!columns('deleted_todos').has('project_name')) {
    db.exec('ALTER TABLE deleted_todos ADD COLUMN project_name TEXT');
  }
  // 升级时为仍存在的项目补齐名称；旧版本已删除的项目没有可恢复的名称来源。
  db.exec(`UPDATE deleted_todos
    SET project_name = (
      SELECT name FROM projects WHERE projects.id = deleted_todos.project_id
    )
    WHERE project_name IS NULL`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_todos_project_order
      ON todos(project_id, pinned DESC, sort_order ASC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_todos_completed_project ON todos(completed, project_id);
    CREATE INDEX IF NOT EXISTS idx_todos_planned_completed
      ON todos(planned_date, completed, project_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_single_inbox
      ON projects(kind) WHERE kind = 'inbox';
    CREATE INDEX IF NOT EXISTS idx_deleted_project_deleted_at
      ON deleted_todos(project_id, deleted_at DESC);
  `);

  const version = Number(
    db.prepare("SELECT value FROM settings WHERE key = 'dataVersion'").pluck().get() ?? 0,
  );
  if (version < DB_VERSION) {
    const normalize = db.transaction(() => {
      db.prepare('SELECT id FROM projects ORDER BY sort_order, created_at')
        .all()
        .forEach((row, index) => {
          db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?').run(
            (index + 1) * RANK_STEP,
            (row as Row).id,
          );
        });
      db.prepare('SELECT id FROM projects')
        .all()
        .forEach((row) => {
          db.prepare('SELECT id FROM todos WHERE project_id = ? ORDER BY sort_order, created_at')
            .all((row as Row).id)
            .forEach((todo, index) => {
              db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?').run(
                (index + 1) * RANK_STEP,
                (todo as Row).id,
              );
            });
        });
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('dataVersion', ?)").run(
        String(DB_VERSION),
      );
    });
    normalize();
  }
}

export function getRepository(): DatabaseConnection {
  const filePath = getCurrentDatabasePath();
  if (connection && connectionPath === filePath) return connection;
  connection?.close();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  connection = new Database(filePath);
  connectionPath = filePath;
  ensureSchema(connection);
  return connection;
}

export function closeRepository(): void {
  connection?.close();
  connection = null;
  connectionPath = null;
}

export function setDataChangedListener(listener: ((event: DataChangedEvent) => void) | null): void {
  onChanged = listener;
}

/** 存储文件迁移、导入等替换整库的操作完成后通知所有窗口重新读取。 */
export function notifyRepositoryFullRefresh(): void {
  changed({
    projectsChanged: true,
    settingsChanged: true,
    archiveChanged: true,
    fullRefresh: true,
  });
}

function changed(scope: ChangeScope): void {
  revision += 1;
  onChanged?.({
    revision,
    projectIds: scope.projectIds ?? [],
    projectsChanged: scope.projectsChanged ?? false,
    settingsChanged: scope.settingsChanged ?? false,
    archiveChanged: scope.archiveChanged ?? false,
    fullRefresh: scope.fullRefresh ?? false,
    originWebContentsId: commandOriginWebContentsId,
  });
}

/** 固定的只读查询集。 */
export function queryData(name: string, params: Record<string, unknown> = {}): unknown {
  const db = getRepository();
  switch (name) {
    case 'projects':
      return db
        .prepare(
          "SELECT * FROM projects ORDER BY CASE kind WHEN 'inbox' THEN 0 ELSE 1 END, sort_order, created_at",
        )
        .all();
    case 'project':
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
    case 'todosByProject':
      return db
        .prepare(
          'SELECT * FROM todos WHERE project_id = ? ORDER BY pinned DESC, sort_order, created_at',
        )
        .all(params.projectId);
    case 'allTodos':
      return db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all();
    case 'incompleteCounts':
      return db
        .prepare(
          'SELECT project_id, COUNT(*) AS count FROM todos WHERE completed = 0 GROUP BY project_id',
        )
        .all();
    case 'search': {
      const keyword = String(params.keyword ?? '').trim();
      if (!keyword) return [];
      const escaped = keyword.replace(/[%_\\]/g, '\\$&');
      const pattern = `%${escaped}%`;
      return db
        .prepare(
          `SELECT * FROM todos WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?`,
        )
        .all(pattern, pattern, Number(params.limit ?? 20));
    }
    case 'deletedByProject':
      return db
        .prepare('SELECT * FROM deleted_todos WHERE project_id = ? ORDER BY deleted_at DESC')
        .all(params.projectId);
    case 'allDeleted':
      return db.prepare('SELECT * FROM deleted_todos ORDER BY deleted_at DESC').all();
    case 'deletedCount':
      return Number(db.prepare('SELECT COUNT(*) FROM deleted_todos').pluck().get());
    case 'deletedPage': {
      const cursor = params.cursor as Row | undefined;
      const limit = Number(params.limit ?? 50);
      return cursor
        ? db
            .prepare(
              `SELECT * FROM deleted_todos WHERE deleted_at < ? OR (deleted_at = ? AND id < ?) ORDER BY deleted_at DESC, id DESC LIMIT ?`,
            )
            .all(cursor.deletedAt, cursor.deletedAt, cursor.id, limit)
        : db
            .prepare('SELECT * FROM deleted_todos ORDER BY deleted_at DESC, id DESC LIMIT ?')
            .all(limit);
    }
    case 'settings':
      return db.prepare('SELECT key, value FROM settings').all();
    case 'setting':
      return db.prepare('SELECT value FROM settings WHERE key = ?').pluck().get(params.key);
    default:
      throw new Error(`未知数据查询: ${name}`);
  }
}

function insertTodoRow(db: DatabaseConnection, todo: Row): void {
  db.prepare(
    `INSERT INTO todos (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, planned_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    todo.id,
    todo.projectId,
    todo.title,
    todo.description ?? null,
    todo.completed ? 1 : 0,
    todo.priority,
    todo.createdAt,
    todo.updatedAt,
    todo.completedAt ?? null,
    todo.order,
    todo.pinned ? 1 : 0,
    todo.plannedDate ?? null,
  );
}

function insertDeletedTodoRow(db: DatabaseConnection, todo: Row): void {
  const projectId = String(todo.projectId ?? todo.project_id);
  const projectName =
    todo.projectName ??
    todo.project_name ??
    db.prepare('SELECT name FROM projects WHERE id = ?').pluck().get(projectId) ??
    null;
  db.prepare(
    `INSERT INTO deleted_todos (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, planned_date, project_name, deleted_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    todo.id,
    projectId,
    todo.title,
    todo.description ?? null,
    todo.completed ? 1 : 0,
    todo.priority,
    todo.createdAt,
    todo.updatedAt,
    todo.completedAt ?? null,
    todo.order,
    todo.pinned ? 1 : 0,
    todo.plannedDate ?? todo.planned_date ?? null,
    projectName,
    todo.deletedAt,
    todo.expiresAt,
  );
}

function ensureInboxProjectRow(db: DatabaseConnection): Row {
  const existing = db.prepare("SELECT * FROM projects WHERE kind = 'inbox' LIMIT 1").get() as
    Row | undefined;
  if (existing) return existing;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const order = Number(
    db.prepare('SELECT COALESCE(MAX(sort_order), 0) + ? FROM projects').pluck().get(RANK_STEP),
  );
  db.prepare(
    `INSERT INTO projects (id, name, color, created_at, updated_at, sort_order, kind)
    VALUES (?, '收集箱', NULL, ?, ?, ?, 'inbox')`,
  ).run(id, now, now, order);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row;
}

function scopeForTodos(todos: Row[]): ChangeScope {
  return {
    projectIds: [...new Set(todos.map((todo) => String(todo.projectId)))],
    archiveChanged: true,
  };
}

function normalizeTodoRanks(db: DatabaseConnection, projectId: string): void {
  const update = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');
  (
    db
      .prepare('SELECT id FROM todos WHERE project_id = ? ORDER BY sort_order, created_at')
      .all(projectId) as Row[]
  ).forEach((todo, index) => update.run((index + 1) * RANK_STEP, todo.id));
}

function normalizeProjectRanks(db: DatabaseConnection): void {
  const update = db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
  (db.prepare('SELECT id FROM projects ORDER BY sort_order, created_at').all() as Row[]).forEach(
    (project, index) => update.run((index + 1) * RANK_STEP, project.id),
  );
}

function rankBetween(before: number | undefined, after: number | undefined): number | undefined {
  if (before === undefined && after === undefined) return RANK_STEP;
  if (before === undefined) return after! - RANK_STEP;
  if (after === undefined) return before + RANK_STEP;
  const rank = (before + after) / 2;
  return rank === before || rank === after ? undefined : rank;
}

/** 固定的写命令集；每个命令在单次同步事务内提交并广播影响范围。 */
export function commandData(name: string, params: Record<string, unknown> = {}): unknown {
  const db = getRepository();
  switch (name) {
    case 'setSetting': {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        params.key,
        params.value,
      );
      changed({ settingsChanged: true });
      return null;
    }
    case 'deleteSetting': {
      db.prepare('DELETE FROM settings WHERE key = ?').run(params.key);
      changed({ settingsChanged: true });
      return null;
    }
    case 'insertTodo': {
      const todo = params.todo as Row;
      insertTodoRow(db, todo);
      changed({ projectIds: [String(todo.projectId)] });
      return null;
    }
    case 'insertTodos': {
      const todos = params.todos as Row[];
      db.transaction(() => todos.forEach((todo) => insertTodoRow(db, todo)))();
      changed({ projectIds: [...new Set(todos.map((todo) => String(todo.projectId)))] });
      return null;
    }
    case 'updateTodo': {
      const todo = params.todo as Row;
      db.prepare(
        `UPDATE todos SET title = ?, description = ?, completed = ?, priority = ?, updated_at = ?, completed_at = ?, sort_order = ?, pinned = ?, planned_date = ? WHERE id = ?`,
      ).run(
        todo.title,
        todo.description ?? null,
        todo.completed ? 1 : 0,
        todo.priority,
        todo.updatedAt,
        todo.completedAt ?? null,
        todo.order,
        todo.pinned ? 1 : 0,
        todo.plannedDate ?? null,
        todo.id,
      );
      changed({ projectIds: [String(todo.projectId)] });
      return null;
    }
    case 'updateTodos': {
      const todos = params.todos as Row[];
      const update = db.prepare(
        `UPDATE todos SET title = ?, description = ?, completed = ?, priority = ?, updated_at = ?, completed_at = ?, sort_order = ?, pinned = ?, planned_date = ? WHERE id = ?`,
      );
      db.transaction(() =>
        todos.forEach((todo) =>
          update.run(
            todo.title,
            todo.description ?? null,
            todo.completed ? 1 : 0,
            todo.priority,
            todo.updatedAt,
            todo.completedAt ?? null,
            todo.order,
            todo.pinned ? 1 : 0,
            todo.plannedDate ?? null,
            todo.id,
          ),
        ),
      )();
      changed({ projectIds: [...new Set(todos.map((todo) => String(todo.projectId)))] });
      return null;
    }
    case 'updateTodoOrders': {
      const items = params.items as Row[];
      const projectId = String(params.projectId);
      const update = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');
      db.transaction(() => items.forEach((item) => update.run(item.order, item.id)))();
      changed({ projectIds: [projectId] });
      return null;
    }
    case 'moveTodoRank': {
      const projectId = String(params.projectId);
      const sourceId = String(params.sourceId);
      const targetId = String(params.targetId);
      const move = db.transaction(() => {
        let rows = db
          .prepare(
            'SELECT id, sort_order FROM todos WHERE project_id = ? ORDER BY sort_order, created_at',
          )
          .all(projectId) as Row[];
        const sourceIndex = rows.findIndex((row) => row.id === sourceId);
        const targetIndex = rows.findIndex((row) => row.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [source] = rows.splice(sourceIndex, 1);
        rows.splice(targetIndex, 0, source!);
        const newIndex = rows.findIndex((row) => row.id === sourceId);
        let rank = rankBetween(
          newIndex > 0 ? Number(rows[newIndex - 1]!.sort_order) : undefined,
          newIndex < rows.length - 1 ? Number(rows[newIndex + 1]!.sort_order) : undefined,
        );
        if (rank === undefined) {
          normalizeTodoRanks(db, projectId);
          rows = db
            .prepare(
              'SELECT id, sort_order FROM todos WHERE project_id = ? ORDER BY sort_order, created_at',
            )
            .all(projectId) as Row[];
          const index = rows.findIndex((row) => row.id === sourceId);
          rank = rankBetween(
            index > 0 ? Number(rows[index - 1]!.sort_order) : undefined,
            index < rows.length - 1 ? Number(rows[index + 1]!.sort_order) : undefined,
          )!;
        }
        db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?').run(rank, sourceId);
      });
      move();
      changed({ projectIds: [projectId] });
      return db
        .prepare(
          'SELECT * FROM todos WHERE project_id = ? ORDER BY pinned DESC, sort_order, created_at',
        )
        .all(projectId);
    }
    case 'moveTodoToProject': {
      const id = String(params.id);
      const targetProjectId = String(params.targetProjectId);
      const current = db.prepare('SELECT project_id FROM todos WHERE id = ?').get(id) as
        Row | undefined;
      if (!current) throw new Error(`事项不存在: ${id}`);
      const sourceProjectId = String(current.project_id);
      const targetExists = db.prepare('SELECT 1 FROM projects WHERE id = ?').get(targetProjectId);
      if (!targetExists) throw new Error('目标项目不存在');
      const order = Number(
        db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) + ? FROM todos WHERE project_id = ?')
          .pluck()
          .get(RANK_STEP, targetProjectId),
      );
      db.prepare(
        'UPDATE todos SET project_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
      ).run(targetProjectId, order, new Date().toISOString(), id);
      changed({ projectIds: [...new Set([sourceProjectId, targetProjectId])] });
      return db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    }
    case 'deleteTodos': {
      const ids = params.ids as string[];
      if (ids.length === 0) return null;
      const placeholders = ids.map(() => '?').join(',');
      const projectIds = (
        db
          .prepare(`SELECT DISTINCT project_id FROM todos WHERE id IN (${placeholders})`)
          .all(...ids) as Row[]
      ).map((row) => String(row.project_id));
      db.prepare(`DELETE FROM todos WHERE id IN (${placeholders})`).run(...ids);
      changed({ projectIds });
      return null;
    }
    case 'archiveTodos': {
      const todos = params.todos as Row[];
      db.transaction(() => {
        todos.forEach((todo) => {
          insertDeletedTodoRow(db, todo);
          db.prepare('DELETE FROM todos WHERE id = ?').run(todo.id);
        });
      })();
      changed(scopeForTodos(todos));
      return null;
    }
    case 'restoreTodo': {
      const id = String(params.id);
      const archived = db.prepare('SELECT * FROM deleted_todos WHERE id = ?').get(id) as
        Row | undefined;
      if (!archived) throw new Error(`归档事项不存在: ${id}`);
      db.transaction(() => {
        insertTodoRow(db, {
          ...archived,
          projectId: archived.project_id,
          createdAt: archived.created_at,
          updatedAt: params.updatedAt ?? new Date().toISOString(),
          completedAt: archived.completed_at,
          order: archived.sort_order,
        });
        db.prepare('DELETE FROM deleted_todos WHERE id = ?').run(id);
      })();
      changed({ projectIds: [String(archived.project_id)], archiveChanged: true });
      return null;
    }
    case 'permanentlyDelete': {
      const id = String(params.id);
      const archived = db.prepare('SELECT project_id FROM deleted_todos WHERE id = ?').get(id) as
        Row | undefined;
      db.prepare('DELETE FROM deleted_todos WHERE id = ?').run(id);
      changed({ projectIds: archived ? [String(archived.project_id)] : [], archiveChanged: true });
      return null;
    }
    case 'emptyArchive': {
      const projectId = params.projectId === undefined ? undefined : String(params.projectId);
      if (projectId) db.prepare('DELETE FROM deleted_todos WHERE project_id = ?').run(projectId);
      else db.prepare('DELETE FROM deleted_todos').run();
      changed({
        projectIds: projectId ? [projectId] : [],
        archiveChanged: true,
        fullRefresh: !projectId,
      });
      return null;
    }
    case 'insertProject': {
      const project = params.project as Row;
      db.prepare(
        `INSERT INTO projects (id, name, color, created_at, updated_at, sort_order, kind)
        VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), 0) + ? FROM projects)), ?)`,
      ).run(
        project.id,
        project.name,
        project.color ?? null,
        project.createdAt,
        project.updatedAt,
        project.order ?? null,
        RANK_STEP,
        project.kind === 'inbox' ? 'inbox' : project.kind === 'weekly' ? 'weekly' : 'user',
      );
      changed({ projectsChanged: true });
      return null;
    }
    case 'ensureInboxProject': {
      const before = db.prepare("SELECT id FROM projects WHERE kind = 'inbox'").get();
      const inbox = ensureInboxProjectRow(db);
      if (!before) changed({ projectsChanged: true });
      return inbox;
    }
    case 'insertTodosIntoInbox': {
      const todos = params.todos as Row[];
      const before = db.prepare("SELECT id FROM projects WHERE kind = 'inbox'").get();
      let inbox: Row | undefined;
      db.transaction(() => {
        inbox = ensureInboxProjectRow(db);
        // 收集箱的 sort_order 由主进程权威计算，忽略 renderer 传入的值。
        // 时间视图在「未选项目」分支无法获知收集箱已存在事项的 max order，
        // 若沿用 todo.order 会与已有行冲突（连续添加都从 1024 起）。
        let order = Number(
          db
            .prepare('SELECT COALESCE(MAX(sort_order), 0) FROM todos WHERE project_id = ?')
            .pluck()
            .get(inbox.id),
        );
        todos.forEach((todo) => {
          order += RANK_STEP;
          insertTodoRow(db, { ...todo, projectId: inbox!.id, order });
        });
      })();
      changed({
        projectIds: inbox ? [String(inbox.id)] : [],
        projectsChanged: !before,
      });
      return inbox;
    }
    case 'createProjectWithTodos': {
      const project = params.project as Row;
      const todos = params.todos as Row[];
      db.transaction(() => {
        db.prepare(
          `INSERT INTO projects (id, name, color, created_at, updated_at, sort_order, kind)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), 0) + ? FROM projects)), ?)`,
        ).run(
          project.id,
          project.name,
          project.color ?? null,
          project.createdAt,
          project.updatedAt,
          project.order ?? null,
          RANK_STEP,
          project.kind === 'weekly' ? 'weekly' : 'user',
        );
        todos.forEach((todo) => insertTodoRow(db, todo));
      })();
      changed({ projectsChanged: true, projectIds: [String(project.id)] });
      return db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
    }
    case 'updateProject': {
      const project = params.project as Row;
      const stored = db.prepare('SELECT kind FROM projects WHERE id = ?').get(project.id) as
        Row | undefined;
      if (stored?.kind === 'inbox') throw new Error('收集箱不能重命名或修改');
      db.prepare(
        'UPDATE projects SET name = ?, color = ?, updated_at = ?, sort_order = ? WHERE id = ?',
      ).run(project.name, project.color ?? null, project.updatedAt, project.order, project.id);
      changed({ projectsChanged: true });
      return null;
    }
    case 'updateProjectOrders': {
      const items = params.items as Row[];
      const update = db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?');
      db.transaction(() => items.forEach((item) => update.run(item.order, item.id)))();
      changed({ projectsChanged: true });
      return null;
    }
    case 'moveProjectRank': {
      const sourceId = String(params.sourceId);
      const targetId = String(params.targetId);
      const protectedRow = db
        .prepare("SELECT id FROM projects WHERE kind = 'inbox' AND id IN (?, ?)")
        .get(sourceId, targetId);
      if (protectedRow) throw new Error('收集箱不能参与项目排序');
      const move = db.transaction(() => {
        let rows = db
          .prepare('SELECT id, sort_order FROM projects ORDER BY sort_order, created_at')
          .all() as Row[];
        const sourceIndex = rows.findIndex((row) => row.id === sourceId);
        const targetIndex = rows.findIndex((row) => row.id === targetId);
        if (sourceIndex < 0 || targetIndex < 0) return;
        const [source] = rows.splice(sourceIndex, 1);
        rows.splice(targetIndex, 0, source!);
        const newIndex = rows.findIndex((row) => row.id === sourceId);
        let rank = rankBetween(
          newIndex > 0 ? Number(rows[newIndex - 1]!.sort_order) : undefined,
          newIndex < rows.length - 1 ? Number(rows[newIndex + 1]!.sort_order) : undefined,
        );
        if (rank === undefined) {
          normalizeProjectRanks(db);
          rows = db
            .prepare('SELECT id, sort_order FROM projects ORDER BY sort_order, created_at')
            .all() as Row[];
          const index = rows.findIndex((row) => row.id === sourceId);
          rank = rankBetween(
            index > 0 ? Number(rows[index - 1]!.sort_order) : undefined,
            index < rows.length - 1 ? Number(rows[index + 1]!.sort_order) : undefined,
          )!;
        }
        db.prepare('UPDATE projects SET sort_order = ? WHERE id = ?').run(rank, sourceId);
      });
      move();
      changed({ projectsChanged: true });
      return db
        .prepare(
          "SELECT * FROM projects ORDER BY CASE kind WHEN 'inbox' THEN 0 ELSE 1 END, sort_order, created_at",
        )
        .all();
    }
    case 'deleteProject': {
      const id = String(params.id);
      const project = db.prepare('SELECT kind, name FROM projects WHERE id = ?').get(id) as
        Row | undefined;
      if (project?.kind === 'inbox') throw new Error('收集箱不能删除');
      if (!project) return null;
      const todos = db.prepare('SELECT * FROM todos WHERE project_id = ?').all(id) as Row[];
      const now = new Date().toISOString();
      db.transaction(() => {
        todos.forEach((todo) =>
          insertDeletedTodoRow(db, {
            ...todo,
            projectId: todo.project_id,
            createdAt: todo.created_at,
            updatedAt: todo.updated_at,
            completedAt: todo.completed_at,
            order: todo.sort_order,
            deletedAt: now,
            expiresAt: now,
          }),
        );
        // 既有归档行也记录项目删除前的最终名称。
        db.prepare('UPDATE deleted_todos SET project_name = ? WHERE project_id = ?').run(
          project.name,
          id,
        );
        db.prepare('DELETE FROM todos WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
      })();
      changed({ projectIds: [id], projectsChanged: true, archiveChanged: true });
      return null;
    }
    case 'replaceAll': {
      const data = params.data as Row;
      const projects = (data.projects ?? []) as Row[];
      const todos = (data.todos ?? []) as Row[];
      const deletedTodos = (data.deletedTodos ?? []) as Row[];
      const settings = (data.settings ?? {}) as Row;
      db.transaction(() => {
        db.prepare('DELETE FROM todos').run();
        db.prepare('DELETE FROM deleted_todos').run();
        db.prepare('DELETE FROM projects').run();
        db.prepare('DELETE FROM settings').run();
        const insertProject = db.prepare(
          'INSERT INTO projects (id, name, color, created_at, updated_at, sort_order, kind) VALUES (?, ?, ?, ?, ?, ?, ?)',
        );
        let hasInbox = false;
        projects.forEach((project, index) => {
          const kind =
            project.kind === 'inbox' && !hasInbox
              ? 'inbox'
              : project.kind === 'weekly'
                ? 'weekly'
                : 'user';
          if (kind === 'inbox') hasInbox = true;
          insertProject.run(
            project.id,
            project.name,
            project.color ?? null,
            project.createdAt,
            project.updatedAt,
            project.order ?? (index + 1) * RANK_STEP,
            kind,
          );
        });
        todos.forEach((todo) => insertTodoRow(db, todo));
        deletedTodos.forEach((todo) => insertDeletedTodoRow(db, todo));
        const insertSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        Object.entries(settings)
          .filter(([key]) => key !== 'dataVersion')
          .forEach(([key, value]) =>
            insertSetting.run(key, typeof value === 'string' ? value : JSON.stringify(value)),
          );
        insertSetting.run('dataVersion', String(DB_VERSION));
      })();
      changed({
        fullRefresh: true,
        projectsChanged: true,
        settingsChanged: true,
        archiveChanged: true,
      });
      return null;
    }
    case 'reset': {
      db.transaction(() => {
        db.prepare('DELETE FROM todos').run();
        db.prepare('DELETE FROM deleted_todos').run();
        db.prepare('DELETE FROM projects').run();
        db.prepare('DELETE FROM settings').run();
        db.prepare("INSERT INTO settings (key, value) VALUES ('dataVersion', ?)").run(
          String(DB_VERSION),
        );
      })();
      changed({
        fullRefresh: true,
        projectsChanged: true,
        settingsChanged: true,
        archiveChanged: true,
      });
      return null;
    }
    default:
      throw new Error(`未知数据命令: ${name}`);
  }
}

/** 注册 renderer 可见的受限接口；所有输入均为固定方法名，绝不接收任意 SQL。 */
export function registerRepositoryIpc(isAppWindowSender: IpcSenderValidator): void {
  ipcMain.handle('data:query', (event, name: string, params?: Record<string, unknown>) => {
    requireAuthorizedSender(event, isAppWindowSender);
    return queryData(name, params);
  });
  ipcMain.handle('data:command', (event, name: string, params?: Record<string, unknown>) => {
    requireAuthorizedSender(event, isAppWindowSender);
    const previousOrigin = commandOriginWebContentsId;
    commandOriginWebContentsId = event.sender.id;
    try {
      return commandData(name, params);
    } finally {
      commandOriginWebContentsId = previousOrigin;
    }
  });
}
