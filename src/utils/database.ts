/**
 * @file SQLite 数据库服务
 * @description 使用 sql.js (WebAssembly SQLite) 实现数据持久化
 *              桌面端 (Electron) 通过 IPC 将数据库二进制保存为真实文件，
 *              存储位置可在设置中自定义；Web 端兜底使用 IndexedDB。
 *              数据结构包含: projects, todos, deleted_todos, settings, notifications
 */

// sql.js 浏览器 WASM 构建（Vite 预构建）
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { EXPORT_FORMAT_VERSION } from './export';

// ============================================
// 类型定义
// ============================================

/** 数据库行记录（通用） */
type DbRow = Record<string, unknown>;

// ============================================
// 常量
// ============================================

const DB_STORAGE_KEY = 'celery-todo-sqlite-db';
const DB_VERSION = 2;

/**
 * Schema 迁移表。
 *
 * 每个条目描述「从 version-1 升到 version」要做的事。
 * - 版本 1 是初始 schema（由 createTables 建立），无前置迁移。
 * - 版本 2 给 projects 表加 sort_order 列，并按现有 created_at 顺序回填，
 *   使升级后侧边栏顺序与升级前视觉一致。
 * - 新增/修改列时：把 DB_VERSION 递增，并在此处追加一条 entry，例如：
 *     {
 *       version: 3,
 *       description: 'todos 增加 tags 列',
 *       run: (db) => addColumnIfMissing(db, 'todos', 'tags', 'TEXT'),
 *     }
 *   createTables() 持有的是「最终 schema」，所以新库 / 导入库可能已经具备
 *   该列；迁移体内务必用 hasColumn / addColumnIfMissing 之类的判断保证幂等。
 * - 不可逆迁移（删列/改类型）须配套 App MAJOR 版本号 bump，并在 CHANGELOG 写手动恢复步骤。
 * - migrateDatabase() 会按 version 升序对当前 dataVersion < version 的条目执行。
 *
 * 详见仓库根目录 VERSIONING.md 第 3 节。
 */
interface SchemaMigration {
  version: number;
  description: string;
  /**
   * 单条迁移的执行体。由 migrateDatabase() 在事务中调用。
   * 设计成函数而非纯 SQL 字符串：createTables() 持有的是「最终 schema」，
   * 新建库 / 导入库 / 升级库三种路径下，某列可能已经存在，迁移需要自行
   * 通过 PRAGMA table_info 判断后再决定是否改，才能做到真正幂等。
   */
  run: (database: Database) => void;
}
const MIGRATIONS: SchemaMigration[] = [
  {
    version: 2,
    description: 'projects 表增加 sort_order 列，并按 created_at 顺序回填',
    run: (database) => {
      // createTables() 的 projects 定义里已包含 sort_order（最终 schema），
      // 因此首次建库 / 导入库后该列可能已存在；只有老库升级时才需要 ADD。
      // addColumnIfMissing 内部用 PRAGMA table_info 做幂等判断。
      addColumnIfMissing(database, 'projects', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
      // 老库升级或列虽存在但值为 0 时，按 created_at 回填一个稳定顺序。
      // COALESCE 兜底：无更早项目时取 0，避免 NULL/异常。
      database.run(`UPDATE projects
         SET sort_order = COALESCE(
           (SELECT COUNT(*) FROM projects p2
             WHERE p2.created_at < projects.created_at),
           0
         )`);
    },
  },
];

// ============================================
// 模块级状态
// ============================================

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;
let initPromise: Promise<Database> | null = null;

/** 当前持久化模式：Electron 文件 / Web IndexedDB。首次加载时确定。 */
let currentStorageMode: 'electron' | 'web' | null = null;

// ============================================
// IndexedDB 辅助函数（用于存储 SQLite 二进制数据）
// ============================================

/**
 * 打开 IndexedDB
 */
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('celery-todo-db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains('kv')) {
        database.createObjectStore('kv');
      }
    };
  });
}

/**
 * 从 IndexedDB 读取数据
 */
async function idbGet(key: string): Promise<Uint8Array | null> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

/**
 * 向 IndexedDB 写入数据
 */
async function idbSet(key: string, value: Uint8Array): Promise<void> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    store.put(value, key);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

// ============================================
// 持久化抽象层（桌面端走 IPC 文件读写，Web 端兜底 IndexedDB）
// ============================================

/**
 * 加载数据库二进制。
 * 桌面端：通过 IPC 从当前存储路径读取真实文件。
 * Web 端：从 IndexedDB 读取（兜底）。
 * 首次调用会锁定本会话的存储模式。
 */
async function loadDbBinary(): Promise<Uint8Array | null> {
  if (window.electronAPI?.storageLoad) {
    currentStorageMode = 'electron';
    return (await window.electronAPI.storageLoad()) ?? null;
  }
  currentStorageMode = 'web';
  return idbGet(DB_STORAGE_KEY);
}

/**
 * 写入数据库二进制到当前持久化目标。
 */
async function saveDbBinary(data: Uint8Array): Promise<void> {
  if (currentStorageMode === 'electron' && window.electronAPI?.storageSave) {
    await window.electronAPI.storageSave(data);
    return;
  }
  await idbSet(DB_STORAGE_KEY, data);
}

// ============================================
// 数据库初始化
// ============================================

/**
 * 初始化数据库表结构
 */
function createTables(database: Database): void {
  database.run(`
    -- 项目表
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- Todo 事项表
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 回收站表
    CREATE TABLE IF NOT EXISTS deleted_todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- 设置表（单行）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 通知表
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      todo_id TEXT,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_todos_project ON todos(project_id);
    CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
    CREATE INDEX IF NOT EXISTS idx_deleted_project ON deleted_todos(project_id);
    CREATE INDEX IF NOT EXISTS idx_deleted_expires ON deleted_todos(expires_at);
  `);
}

/**
 * 判断某表是否存在指定列（基于 PRAGMA table_info）。
 * 供迁移逻辑做幂等判断：createTables() 持有的是最终 schema，
 * 新建 / 导入的库可能已经具备较新的列，迁移要据此跳过 ALTER。
 */
function hasColumn(database: Database, table: string, column: string): boolean {
  const stmt = database.prepare(`PRAGMA table_info(${table})`);
  let exists = false;
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name?: unknown };
    if (row.name === column) {
      exists = true;
      break;
    }
  }
  stmt.free();
  return exists;
}

/**
 * 仅当列不存在时执行 ADD COLUMN，等价于 SQLite 缺失的
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`。供 MIGRATIONS 使用，保证幂等。
 */
function addColumnIfMissing(
  database: Database,
  table: string,
  column: string,
  definition: string,
): void {
  if (!hasColumn(database, table, column)) {
    database.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * 按 {@link MIGRATIONS} 阶梯对当前数据库做幂等迁移。
 *
 * 规则：
 * - 读 settings.dataVersion（缺失视为 0），按 version 升序跑所有 version > 当前 的迁移。
 * - 每条迁移用事务包起来，单步失败时回滚并抛出，避免留下半迁移状态。
 * - 全部跑完后把 dataVersion 写为 DB_VERSION。
 * - 必须在 createTables 之后调用：新表由 createTables 建，列变更由本函数改。
 *
 * 该函数幂等：dataVersion 已等于 DB_VERSION 时直接返回，无副作用。
 * 即便某次迁移因 dataVersion 缺失被重复触发，迁移体内也应通过 hasColumn
 * 等手段保证重复执行不报错（createTables 已是最终 schema，列可能已存在）。
 */
function migrateDatabase(): void {
  if (!db) throw new Error('migrateDatabase: 数据库未初始化');

  const raw = getSetting('dataVersion');
  const current = raw === null ? 0 : Number.parseInt(raw, 10);
  if (Number.isNaN(current)) {
    throw new Error(`migrateDatabase: dataVersion 值非法 "${raw}"`);
  }

  // 按 version 升序应用所有未跑过的迁移。
  const pending = MIGRATIONS.filter((m) => m.version > current).sort(
    (a, b) => a.version - b.version,
  );
  for (const m of pending) {
    db.run('BEGIN');
    try {
      m.run(db);
      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      throw new Error(
        `迁移到 v${m.version}（${m.description}）失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 写回水位线。即便 pending 为空（首次初始化或已是最新），也确保 dataVersion = DB_VERSION。
  if (pending.length > 0 || current !== DB_VERSION) {
    setSetting('dataVersion', String(DB_VERSION));
  }
}

/**
 * 初始化 SQLite 数据库
 * @returns Promise<Database> 已初始化的数据库实例
 */
export async function initDatabase(): Promise<Database> {
  if (isInitialized && db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 加载 sql.js WASM
    if (!SQL) {
      SQL = await initSqlJs({
        // sql.js 默认请求 sql-wasm.wasm，恰好与 public/ 下的文件同名，无需改名。
        // 必须用相对路径：dev 下相对 http://localhost:5173 解析，
        // 生产 Electron 下 loadFile 让文档运行在 file:// 协议，
        // 此时 window.location.origin 是字符串 "null"，用 origin 拼 URL 会得到
        // "null/sql-wasm.wasm" 导致加载失败 —— 应用卡在初始化界面。
        // 相对路径在 file:// 下基于文档目录解析，能正确定位到 dist/sql-wasm.wasm。
        locateFile: () => './sql-wasm.wasm',
      });
    }

    // 尝试从当前持久化目标加载已有数据库
    const savedData = await loadDbBinary();
    if (savedData) {
      db = new SQL.Database(savedData);
    } else {
      // 桌面端首次启动：可能存在旧版本 IndexedDB 数据，需一次性迁移到文件
      const legacyData = await migrateFromIndexedDbIfNeeded();
      if (legacyData) {
        db = new SQL.Database(legacyData);
        createTables(db);
      } else {
        db = new SQL.Database();
        createTables(db);
        // 插入默认设置
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('dataVersion', ?)`, [
          String(DB_VERSION),
        ]);
      }
      await persistDatabase();
    }

    // 确保表存在（兼容旧数据）
    createTables(db);
    // 按 MIGRATIONS 阶梯做列变更迁移；首次启动或已是最新时为空操作。
    migrateDatabase();
    isInitialized = true;
    return db;
  })();

  return initPromise;
}

/**
 * 一次性迁移：把旧版本存放在 IndexedDB 中的数据库迁移到 Electron 文件存储。
 * 仅在桌面端、当前文件路径尚无数据、IndexedDB 仍有旧数据时执行。
 * 迁移完成后在 IndexedDB 写入 'migrated' 标记，避免重复迁移。
 */
async function migrateFromIndexedDbIfNeeded(): Promise<Uint8Array | null> {
  // 只有桌面端且当前模式确实是 electron 时才需要迁移
  if (currentStorageMode !== 'electron') return null;
  try {
    const migrated = await idbGet('migrated');
    if (migrated && migrated.length > 0) return null;
    const legacy = await idbGet(DB_STORAGE_KEY);
    if (!legacy) return null;
    // 标记为已迁移，避免后续重复读取
    await idbSet('migrated', new Uint8Array([1]));
    return legacy;
  } catch {
    // IndexedDB 读取失败时静默回退（不影响主流程）
    return null;
  }
}

/**
 * 持久化数据库到当前存储目标（桌面端文件 / Web IndexedDB）
 */
async function persistDatabase(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await saveDbBinary(data);
}

/**
 * 触发自动保存（debounce 500ms）
 */
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void persistDatabase();
  }, 500);
}

/**
 * 立即保存数据库
 */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await persistDatabase();
}

// ============================================
// 通用查询辅助函数
// ============================================

/**
 * 执行查询并返回所有结果行
 */
function queryAll<T = DbRow>(sql: string, params: unknown[] = []): T[] {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stmt.bind(params as any);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as T);
  }
  stmt.free();
  return results;
}

/**
 * 执行单条查询
 */
function queryOne<T = DbRow>(sql: string, params: unknown[] = []): T | null {
  const results = queryAll<T>(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE）
 */
function execute(sql: string, params: unknown[] = []): void {
  if (!db) throw new Error('Database not initialized');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params as any);
  scheduleSave();
}

// ============================================
// Projects 数据访问
// ============================================

/** 数据库行映射到 Project */
interface ProjectRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
}

/** 将数据库行转换为 Project 对象 */
function rowToProject(row: ProjectRow): import('../types').Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.sort_order,
  };
}

/** 获取所有项目（按 sort_order 排序，created_at 仅作兜底次序） */
export function getAllProjects(): import('../types').Project[] {
  return queryAll<ProjectRow>('SELECT * FROM projects ORDER BY sort_order ASC, created_at ASC').map(
    rowToProject,
  );
}

/** 根据 ID 获取项目 */
export function getProjectById(id: string): import('../types').Project | null {
  const row = queryOne<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
  return row ? rowToProject(row) : null;
}

/** 插入项目 */
export function insertProject(project: import('../types').Project): void {
  // 新建项目默认追加到末尾：调用方未指定 order（null）时，由 SQL 子查询取
  // MAX(sort_order) + 1 自动计算，避免迁移期/导入路径产生重复序号。
  execute(
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

/** 更新项目 */
export function updateProject(project: import('../types').Project): void {
  execute(`UPDATE projects SET name = ?, color = ?, updated_at = ?, sort_order = ? WHERE id = ?`, [
    project.name,
    project.color ?? null,
    project.updatedAt,
    project.order,
    project.id,
  ]);
}

/**
 * 按给定 id 顺序批量重排项目。
 * @param ids 目标顺序的项目 ID 列表（应包含当前全部项目）
 */
export function reorderProjects(ids: string[]): void {
  // 按数组下标作为新的 sort_order，与 todos 的 reorder 写法一致。
  ids.forEach((id, idx) => {
    execute('UPDATE projects SET sort_order = ? WHERE id = ?', [idx, id]);
  });
}

/** 删除项目（同时删除其下所有 Todo） */
export function deleteProject(id: string): void {
  execute('DELETE FROM todos WHERE project_id = ?', [id]);
  execute('DELETE FROM deleted_todos WHERE project_id = ?', [id]);
  execute('DELETE FROM projects WHERE id = ?', [id]);
}

// ============================================
// Todos 数据访问
// ============================================

/** 数据库行映射到 Todo */
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

/** 将数据库行转换为 Todo 对象 */
function rowToTodo(row: TodoRow): import('../types').Todo {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? undefined,
    completed: row.completed === 1,
    priority: row.priority as import('../types').Priority,
    dueDate: row.due_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    order: row.sort_order,
  };
}

/** 获取指定项目的所有 Todo */
export function getTodosByProject(projectId: string): import('../types').Todo[] {
  return queryAll<TodoRow>(
    'SELECT * FROM todos WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC',
    [projectId],
  ).map(rowToTodo);
}

/** 获取所有 Todo（跨项目） */
export function getAllTodos(): import('../types').Todo[] {
  return queryAll<TodoRow>('SELECT * FROM todos ORDER BY created_at DESC').map(rowToTodo);
}

/** 根据 ID 获取 Todo */
export function getTodoById(id: string): import('../types').Todo | null {
  const row = queryOne<TodoRow>('SELECT * FROM todos WHERE id = ?', [id]);
  return row ? rowToTodo(row) : null;
}

/** 插入 Todo */
export function insertTodo(todo: import('../types').Todo): void {
  execute(
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

/** 更新 Todo */
export function updateTodo(todo: import('../types').Todo): void {
  execute(
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

/** 删除 Todo（移入回收站） */
export function deleteTodo(id: string): void {
  execute('DELETE FROM todos WHERE id = ?', [id]);
}

/** 批量删除 Todo */
export function deleteTodos(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  execute(`DELETE FROM todos WHERE id IN (${placeholders})`, ids);
}

// ============================================
// 回收站数据访问
// ============================================

/** 回收站行 */
interface DeletedTodoRow extends TodoRow {
  deleted_at: string;
  expires_at: string;
}

/** 将数据库行转换为 DeletedTodo 对象 */
function rowToDeletedTodo(row: DeletedTodoRow): import('../types').DeletedTodo {
  return {
    ...rowToTodo(row),
    deletedAt: row.deleted_at,
    expiresAt: row.expires_at,
  };
}

/** 获取指定项目的回收站事项 */
export function getDeletedTodosByProject(projectId: string): import('../types').DeletedTodo[] {
  return queryAll<DeletedTodoRow>(
    'SELECT * FROM deleted_todos WHERE project_id = ? ORDER BY deleted_at DESC',
    [projectId],
  ).map(rowToDeletedTodo);
}

/** 获取所有回收站事项 */
export function getAllDeletedTodos(): import('../types').DeletedTodo[] {
  return queryAll<DeletedTodoRow>('SELECT * FROM deleted_todos ORDER BY deleted_at DESC').map(
    rowToDeletedTodo,
  );
}

/** 插入回收站事项 */
export function insertDeletedTodo(todo: import('../types').DeletedTodo): void {
  execute(
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

/** 从回收站永久删除 */
export function permanentlyDeleteTodo(id: string): void {
  execute('DELETE FROM deleted_todos WHERE id = ?', [id]);
}

/** 从回收站恢复（重新插入到 todos 表） */
export function restoreTodo(id: string): void {
  const row = queryOne<DeletedTodoRow>('SELECT * FROM deleted_todos WHERE id = ?', [id]);
  if (!row) return;
  // 重新插入到 todos 表
  execute(
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
      new Date().toISOString(),
      row.completed_at,
      row.sort_order,
    ],
  );
  // 从回收站删除
  execute('DELETE FROM deleted_todos WHERE id = ?', [id]);
}

/** 清空回收站 */
export function emptyRecycleBin(projectId?: string): void {
  if (projectId) {
    execute('DELETE FROM deleted_todos WHERE project_id = ?', [projectId]);
  } else {
    execute('DELETE FROM deleted_todos', []);
  }
}

/** 清理过期回收站事项（30 天前） */
export function cleanupExpiredDeletedTodos(): number {
  const now = new Date().toISOString();
  const before = queryAll<{ count: number }>(
    'SELECT COUNT(*) as count FROM deleted_todos WHERE expires_at < ?',
    [now],
  );
  execute('DELETE FROM deleted_todos WHERE expires_at < ?', [now]);
  return before[0]?.count ?? 0;
}

// ============================================
// 设置数据访问
// ============================================

/** 获取设置值 */
export function getSetting(key: string): string | null {
  const row = queryOne<{ key: string; value: string }>('SELECT value FROM settings WHERE key = ?', [
    key,
  ]);
  return row?.value ?? null;
}

/** 设置设置值 */
export function setSetting(key: string, value: string): void {
  execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

// ============================================
// 通知数据访问
// ============================================

/** 通知行 */
interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  todo_id: string | null;
  created_at: string;
  read: number;
}

/** 将数据库行转换为通知对象 */
function rowToNotification(row: NotificationRow): import('../types').AppNotification {
  return {
    id: row.id,
    type: row.type as import('../types').AppNotification['type'],
    title: row.title,
    message: row.message,
    todoId: row.todo_id ?? undefined,
    createdAt: row.created_at,
    read: row.read === 1,
  };
}

/** 获取所有通知 */
export function getAllNotifications(): import('../types').AppNotification[] {
  return queryAll<NotificationRow>('SELECT * FROM notifications ORDER BY created_at DESC').map(
    rowToNotification,
  );
}

/** 插入通知 */
export function insertNotification(notification: import('../types').AppNotification): void {
  execute(
    `INSERT INTO notifications (id, type, title, message, todo_id, created_at, read)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      notification.id,
      notification.type,
      notification.title,
      notification.message,
      notification.todoId ?? null,
      notification.createdAt,
      notification.read ? 1 : 0,
    ],
  );
}

/** 标记通知为已读 */
export function markNotificationRead(id: string): void {
  execute('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
}

/** 删除通知 */
export function deleteNotification(id: string): void {
  execute('DELETE FROM notifications WHERE id = ?', [id]);
}

/** 清空所有通知 */
export function clearAllNotifications(): void {
  execute('DELETE FROM notifications', []);
}

// ============================================
// 数据导出/导入
// ============================================

/**
 * 导出完整应用数据
 */
export function exportAllData(): import('../types').AppExportData {
  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    projects: getAllProjects(),
    todos: getAllTodos(),
    deletedTodos: getAllDeletedTodos(),
    settings: {
      theme: (getSetting('theme') as import('../types').ThemeMode) ?? 'system',
      autoStart: getSetting('autoStart') === 'true',
      minimizeToTray: getSetting('minimizeToTray') !== 'false',
      notificationsEnabled: getSetting('notificationsEnabled') !== 'false',
      notificationLeadHours: Number(getSetting('notificationLeadHours') ?? 24),
      dataVersion: DB_VERSION,
      // 与 useSettingsStore.loadSettings 保持一致：未持久化时回退默认值 true
      focusMode: getSetting('focusMode') === null ? true : getSetting('focusMode') === 'true',
      autoUpdateEnabled:
        getSetting('autoUpdateEnabled') === null
          ? true
          : getSetting('autoUpdateEnabled') === 'true',
    },
  };
}

/**
 * 导入完整应用数据（替换现有数据）
 */
export async function importAllData(data: import('../types').AppExportData): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  // 清空所有表
  db.run('DELETE FROM todos');
  db.run('DELETE FROM deleted_todos');
  db.run('DELETE FROM projects');
  db.run('DELETE FROM notifications');

  // 插入项目
  for (const project of data.projects) {
    insertProject(project);
  }

  // 插入 Todo
  for (const todo of data.todos) {
    insertTodo(todo);
  }

  // 插入回收站
  for (const deleted of data.deletedTodos) {
    insertDeletedTodo(deleted);
  }

  await flushSave();
}

/**
 * 重置数据库（清空所有数据并重建）
 */
export async function resetDatabase(): Promise<void> {
  if (!db) return;
  db.run('DROP TABLE IF EXISTS todos');
  db.run('DROP TABLE IF EXISTS deleted_todos');
  db.run('DROP TABLE IF EXISTS projects');
  db.run('DROP TABLE IF EXISTS notifications');
  createTables(db);
  await flushSave();
}

// ============================================
// 存储位置管理（仅桌面端 Electron）
// ============================================

/** 存储位置信息 */
export interface StorageInfo {
  /** 当前持久化模式 */
  mode: 'electron' | 'web';
  /** 当前数据库文件完整路径（仅 Electron 模式有值） */
  filePath: string | null;
  /** 默认数据目录（仅 Electron 模式有值） */
  defaultDir: string | null;
}

/**
 * 获取当前存储位置信息（用于设置面板展示）
 */
export async function getStorageInfo(): Promise<StorageInfo> {
  if (!window.electronAPI?.storageGetConfig) {
    return { mode: 'web', filePath: null, defaultDir: null };
  }
  try {
    const cfg = await window.electronAPI.storageGetConfig();
    return { mode: 'electron', filePath: cfg.filePath, defaultDir: cfg.defaultDir };
  } catch {
    return { mode: 'web', filePath: null, defaultDir: null };
  }
}

/**
 * 弹出原生对话框选择新的存储目录。
 * @returns 选中的目录路径，用户取消时返回 null
 */
export async function chooseStorageDirectory(): Promise<string | null> {
  if (!window.electronAPI?.storageChooseDirectory) return null;
  return window.electronAPI.storageChooseDirectory();
}

/**
 * 切换到新目录并迁移当前数据库文件。
 * 主进程会拷贝旧文件到新位置、更新配置；切换后内存中的 DB 实例不变，
 * 后续 save 会写入新路径。返回新文件路径。
 */
export async function changeStorageDirectory(newDir: string): Promise<string> {
  if (!window.electronAPI?.storageSetPath) {
    throw new Error('当前环境不支持自定义存储位置');
  }
  if (!db) throw new Error('Database not initialized');
  // 1. 主进程切换路径并迁移文件
  const result = await window.electronAPI.storageSetPath(newDir);
  // 2. 把内存中当前的 DB 强制写入新位置（保证两端一致）
  await flushSave();
  return result.filePath;
}

/**
 * 重置到默认存储位置（同时迁移数据）。返回新文件路径。
 */
export async function resetStorageDirectory(): Promise<string> {
  if (!window.electronAPI?.storageResetToDefault) {
    throw new Error('当前环境不支持自定义存储位置');
  }
  if (!db) throw new Error('Database not initialized');
  const result = await window.electronAPI.storageResetToDefault();
  await flushSave();
  return result.filePath;
}

/**
 * 在系统资源管理器中显示数据库文件
 */
export async function openStorageInFolder(): Promise<void> {
  if (!window.electronAPI?.storageOpenInFolder) return;
  await window.electronAPI.storageOpenInFolder();
}
