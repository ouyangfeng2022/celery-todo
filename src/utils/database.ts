/**
 * @file SQLite 数据库服务
 * @description 使用 sql.js (WebAssembly SQLite) 实现数据持久化
 *              桌面端 (Electron) 通过 IPC 将数据库二进制保存为真实文件，
 *              存储位置可在设置中自定义；Web 端兜底使用 IndexedDB。
 *              数据结构包含: projects, todos, deleted_todos(归档), settings
 */

// sql.js 浏览器 WASM 构建（Vite 预构建）
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { Database, SqlJsStatic } from 'sql.js';
import { EXPORT_FORMAT_VERSION } from './export';
import { DEFAULT_SETTINGS, STICKER_PRESET_VALUES, type StickerPreset } from '../types';
import { measureAsync, measureSync } from './performance';
import type { DataSyncPatch, ProjectSyncSnapshot } from '../types/sync';

// ============================================
// 类型定义
// ============================================

/** 数据库行记录（通用） */
type DbRow = Record<string, unknown>;

// ============================================
// 常量
// ============================================

const DB_STORAGE_KEY = 'celery-todo-sqlite-db';
const DB_VERSION = 9;
/** 稀疏排序的相邻 rank 间隔；普通拖拽只改动被移动的一行。 */
const SORT_RANK_STEP = 1024;

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
  {
    version: 3,
    description: 'todos / deleted_todos 增加 pinned 列（置顶功能）',
    run: (database) => {
      // createTables() 已包含 pinned（最终 schema），新建/导入库可能已有该列；
      // 仅老库升级时执行 ADD。addColumnIfMissing 内部幂等。
      addColumnIfMissing(database, 'todos', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(database, 'deleted_todos', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
    },
  },
  {
    version: 4,
    description:
      'todos / deleted_todos 移除 due_date 列（截止日期/提醒功能废弃；不可逆，配套 App v2.0.0 MAJOR bump）',
    run: (database) => {
      // createTables() 持有的是最终 schema（无 due_date），新建/导入库已无该列；
      // 仅老库升级时需要重建表删除该列。rebuildTableWithoutDueDate 内部幂等。
      rebuildTableWithoutDueDate(database, 'todos');
      rebuildTableWithoutDueDate(database, 'deleted_todos');
    },
  },
  {
    version: 5,
    description: '以复合索引覆盖事项列表、未完成计数和历史记录分页查询',
    run: (database) => {
      createPerformanceIndexes(database);
      // v1 的单列索引已被复合索引的左前缀覆盖；移除后可降低新增、更新和归档时的写放大。
      database.run('DROP INDEX IF EXISTS idx_todos_project');
      database.run('DROP INDEX IF EXISTS idx_todos_completed');
      database.run('DROP INDEX IF EXISTS idx_deleted_project');
      database.run('DROP INDEX IF EXISTS idx_deleted_expires');
    },
  },
  {
    version: 6,
    description: '归档历史分页索引补充 id，使 (deleted_at, id) 游标查询保持索引顺序扫描',
    run: (database) => {
      createPerformanceIndexes(database);
      // v6 的复合索引以 deleted_at 为左前缀，替代 v5 的单列索引。
      database.run('DROP INDEX IF EXISTS idx_deleted_deleted_at');
    },
  },
  {
    version: 7,
    description: '项目与事项排序改为稀疏 rank，降低拖拽重排写放大',
    run: (database) => {
      normalizeProjectRanks(database);
      const projectRows = queryAllFromDatabase<{ id: string }>(
        database,
        'SELECT id FROM projects ORDER BY sort_order ASC, created_at ASC',
      );
      projectRows.forEach(({ id }) => normalizeTodoRanks(database, id));
    },
  },
  {
    version: 8,
    description: '增加计划日期与按需创建的系统收集箱项目类型',
    run: (database) => {
      addColumnIfMissing(database, 'projects', 'kind', "TEXT NOT NULL DEFAULT 'user'");
      addColumnIfMissing(database, 'todos', 'planned_date', 'TEXT');
      addColumnIfMissing(database, 'deleted_todos', 'planned_date', 'TEXT');
      createPerformanceIndexes(database);
    },
  },
  {
    version: 9,
    description: '归档事项增加项目名快照，项目归档后仍可显示原名称',
    run: (database) => {
      addColumnIfMissing(database, 'deleted_todos', 'project_name', 'TEXT');
      // 仍存在的项目可在迁移时补齐；已被旧版本删除的项目已无法恢复名称。
      database.run(`UPDATE deleted_todos
        SET project_name = (
          SELECT name FROM projects WHERE projects.id = deleted_todos.project_id
        )
        WHERE project_name IS NULL`);
    },
  },
];

// ============================================
// 模块级状态
// ============================================

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * 持久化必须串行执行。SQLite 导出是内存快照，而 Electron/IndexedDB 写入是异步的；
 * 若两个写入并发完成，较旧的快照可能在较新的快照之后落盘，造成数据回退。
 */
let saveQueue: Promise<void> = Promise.resolve();
/** 当前事务深度；事务内的多次 execute 在提交后只触发一次保存。 */
let transactionDepth = 0;
let transactionDirty = false;
let isInitialized = false;
let initPromise: Promise<Database> | null = null;
/** 尚未持久化的 Todo 变更所属项目；用于生成跨窗口增量补丁。 */
const pendingSyncProjectIds = new Set<string>();
/** 项目/设置/导入等无法安全局部合并的写入，接收方回退整库重载。 */
let pendingFullSync = false;
/** 应用远端补丁时不应再次自动保存或产生同步回声。 */
let applyingRemotePatch = false;
let dataRevision = 0;
const DATA_REVISION_EVENT = 'celery:data-revision';

/** 仅给已打开的统计页发出失效信号；此处不做任何全量统计计算。 */
function publishDataRevision(): void {
  dataRevision += 1;
  window.dispatchEvent(new CustomEvent<number>(DATA_REVISION_EVENT, { detail: dataRevision }));
}

export function getDataRevision(): number {
  return dataRevision;
}

export function subscribeDataRevision(callback: (revision: number) => void): () => void {
  const listener = (event: Event): void => callback((event as CustomEvent<number>).detail);
  window.addEventListener(DATA_REVISION_EVENT, listener);
  return () => window.removeEventListener(DATA_REVISION_EVENT, listener);
}

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
  return measureAsync('database.load', async () => {
    if (window.electronAPI?.storageLoad) {
      currentStorageMode = 'electron';
      return (await window.electronAPI.storageLoad()) ?? null;
    }
    currentStorageMode = 'web';
    return idbGet(DB_STORAGE_KEY);
  });
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'user'
    );

    -- Todo 事项表
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      planned_date TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 归档表（原回收站，现作为「历史记录」永久保留，仅在历史记录页手动删除）
    -- expires_at 列保留以兼容旧数据 / 导入导出，但不再用于自动清除
    CREATE TABLE IF NOT EXISTS deleted_todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      planned_date TEXT,
      project_name TEXT,
      deleted_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- 设置表（单行）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

  `);

  // 旧库会先走 createTables()、再跑 v3 的 pinned 列迁移；列尚不存在时不能创建
  // 依赖它的索引。v5 迁移会在升级完成后补齐，已是最新版的库则在这里自修复索引。
  if (
    hasColumn(database, 'todos', 'pinned') &&
    hasColumn(database, 'deleted_todos', 'pinned') &&
    hasColumn(database, 'projects', 'kind') &&
    hasColumn(database, 'todos', 'planned_date') &&
    hasColumn(database, 'deleted_todos', 'planned_date')
  ) {
    createPerformanceIndexes(database);
  }
}

/** 为既有数据库补齐高频查询的复合索引（迁移可重复执行）。 */
function createPerformanceIndexes(database: Database): void {
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_todos_project_order
      ON todos(project_id, pinned DESC, sort_order ASC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_todos_completed_project
      ON todos(completed, project_id);
    CREATE INDEX IF NOT EXISTS idx_deleted_project_deleted_at
      ON deleted_todos(project_id, deleted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_deleted_deleted_at_id
      ON deleted_todos(deleted_at DESC, id DESC);
  `);
  if (hasColumn(database, 'todos', 'planned_date')) {
    database.run(`CREATE INDEX IF NOT EXISTS idx_todos_planned_completed
      ON todos(planned_date, completed, project_id)`);
  }
  if (hasColumn(database, 'projects', 'kind')) {
    database.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_single_inbox
      ON projects(kind) WHERE kind = 'inbox'`);
  }
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
 * 重建表以移除 due_date 列（v4 迁移专用）。
 *
 * SQLite（sql.js）不支持 `ALTER TABLE ... DROP COLUMN`，因此采用
 * 标准 12 步表重建流程：建临时新表 → 复制保留列 → 删除旧表 → 重命名。
 *
 * 幂等性：若 due_date 列已不存在（新建库 / 已迁移库），直接返回。
 *
 * 注意两张表的列结构不同（deleted_todos 多 deleted_at / expires_at），
 * 因此分别给出列清单，不强行抽象。
 */
function rebuildTableWithoutDueDate(database: Database, table: 'todos' | 'deleted_todos'): void {
  if (!hasColumn(database, table, 'due_date')) return;

  if (table === 'todos') {
    // 列顺序与 createTables() 的 todos 定义保持一致（去掉 due_date）
    database.run(`
      CREATE TABLE todos_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    database.run(`
      INSERT INTO todos_new (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned)
      SELECT id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned
      FROM todos;
    `);
    database.run('DROP TABLE todos');
    database.run('ALTER TABLE todos_new RENAME TO todos');
    // 恢复索引（DROP TABLE 会带走索引）
    createPerformanceIndexes(database);
  } else {
    // deleted_todos：多 deleted_at / expires_at 列
    database.run(`
      CREATE TABLE deleted_todos_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
    database.run(`
      INSERT INTO deleted_todos_new (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, deleted_at, expires_at)
      SELECT id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, deleted_at, expires_at
      FROM deleted_todos;
    `);
    database.run('DROP TABLE deleted_todos');
    database.run('ALTER TABLE deleted_todos_new RENAME TO deleted_todos');
    createPerformanceIndexes(database);
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
        // 始终引用与当前 sql.js JS 胶水层同版本的 WASM，避免 public/ 中手工复制的
        // 文件与依赖升级后不匹配。Vite 会在开发和生产构建中生成正确的资源 URL。
        locateFile: () => sqlWasmUrl,
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
 * 从磁盘重新加载内存数据库。
 *
 * 用途：本窗口是独立 renderer，sql.js 内存库是磁盘文件的一份私有副本。
 * 其它窗口（主窗口 ↔ 贴图窗口）写盘后，本窗口不会自动感知，必须显式重读
 * 才能看到对方的修改。收到主进程 `data:changed` 广播时调用此函数。
 *
 * 实现要点：必须替换 `db` 实例本身（而不是清空再插入），因为对方可能改了
 * schema / 走过 migration；用 `loadDbBinary` 拿到最新二进制再 new 一个全新实例
 * 是最稳的做法。SQL / currentStorageMode 复用首次 init 时锁定的值。
 */
export async function reloadDatabase(): Promise<void> {
  if (!SQL) return; // 尚未初始化过，没有重载的必要
  const data = await loadDbBinary();
  if (!data) return; // 磁盘空文件，交由 initDatabase 兜底
  // 关闭旧实例，避免 sql.js 内部资源泄漏
  db?.close();
  db = new SQL.Database(data);
  createTables(db);
  migrateDatabase();
  isInitialized = true;
  initPromise = Promise.resolve(db);
  publishDataRevision();
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
  const syncPatch = takePendingSyncPatch();
  const data = measureSync('database.export', () => db!.export());
  await measureAsync('database.save', () => saveDbBinary(data));
  // 通知主进程：磁盘数据已变更；Todo 局部变更附带项目快照供其它 renderer 增量合并。
  // 这是单一广播点 —— store action / import / reset / 贴图 toggle 全部经
  // execute() → scheduleSave()（debounce 500ms 合并）或 flushSave() 汇聚到这里，
  // 自动覆盖所有写路径，无需在每处 mutate action 手动加广播。
  // Web 端无 electronAPI，可选链安全跳过。catch 兜底：旧版主进程未注册
  // 'data:changed' handler 时 invoke 会 reject，此时不应让写盘点失败。
  void window.electronAPI?.notifyDataChanged?.(syncPatch).catch(() => {});
}

/** 将一次持久化排到前一次完成之后，保证快照写入顺序。 */
function queuePersist(): Promise<void> {
  const save = saveQueue.then(() => persistDatabase());
  // 队列自身始终可继续工作；调用 flushSave 的路径仍会收到本次写入的错误。
  saveQueue = save.catch(() => {});
  return save;
}

/**
 * 触发自动保存（debounce 500ms）
 */
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void queuePersist();
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
  await queuePersist();
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

/** 在迁移期间对指定连接查询，避免依赖尚未完成初始化的全局 db。 */
function queryAllFromDatabase<T = DbRow>(
  database: Database,
  sql: string,
  params: unknown[] = [],
): T[] {
  const stmt = database.prepare(sql);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stmt.bind(params as any);
  const results: T[] = [];
  while (stmt.step()) results.push(stmt.getAsObject() as unknown as T);
  stmt.free();
  return results;
}

function normalizeProjectRanks(database: Database): void {
  queryAllFromDatabase<{ id: string }>(
    database,
    'SELECT id FROM projects ORDER BY sort_order ASC, created_at ASC',
  ).forEach(({ id }, index) => {
    database.run('UPDATE projects SET sort_order = ? WHERE id = ?', [
      (index + 1) * SORT_RANK_STEP,
      id,
    ]);
  });
}

function normalizeTodoRanks(database: Database, projectId: string): void {
  queryAllFromDatabase<{ id: string }>(
    database,
    'SELECT id FROM todos WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC',
    [projectId],
  ).forEach(({ id }, index) => {
    database.run('UPDATE todos SET sort_order = ? WHERE id = ?', [
      (index + 1) * SORT_RANK_STEP,
      id,
    ]);
  });
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
type SyncScope = 'full' | { projectIds: readonly string[] };

function recordSyncScope(scope: SyncScope): void {
  if (scope === 'full') {
    pendingFullSync = true;
    pendingSyncProjectIds.clear();
    return;
  }
  if (!pendingFullSync) {
    scope.projectIds.forEach((id) => pendingSyncProjectIds.add(id));
  }
}

/** 取走本次落盘对应的同步信息，避免后续编辑混入已导出的快照。 */
function takePendingSyncPatch(): DataSyncPatch | undefined {
  if (pendingFullSync) {
    pendingFullSync = false;
    pendingSyncProjectIds.clear();
    return undefined;
  }
  if (pendingSyncProjectIds.size === 0) return undefined;

  const snapshots: ProjectSyncSnapshot[] = [...pendingSyncProjectIds].map((projectId) => ({
    projectId,
    todos: getTodosByProject(projectId),
    deletedTodos: getDeletedTodosByProject(projectId),
  }));
  pendingSyncProjectIds.clear();
  return { projectSnapshots: snapshots };
}

function execute(sql: string, params: unknown[] = [], syncScope: SyncScope = 'full'): void {
  if (!db) throw new Error('Database not initialized');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.run(sql, params as any);
  if (applyingRemotePatch) return;
  recordSyncScope(syncScope);
  if (transactionDepth > 0) {
    transactionDirty = true;
  } else {
    scheduleSave();
    publishDataRevision();
  }
}

/**
 * 将其它 renderer 送来的项目快照合并到当前 sql.js 内存库。
 * 不触发保存/广播：该快照已由来源窗口成功落盘，避免形成同步回声。
 */
export function applyRemoteSyncPatch(patch: DataSyncPatch): void {
  if (!db) return;
  applyingRemotePatch = true;
  try {
    runTransaction(() => {
      for (const snapshot of patch.projectSnapshots) {
        execute('DELETE FROM todos WHERE project_id = ?', [snapshot.projectId]);
        execute('DELETE FROM deleted_todos WHERE project_id = ?', [snapshot.projectId]);
        snapshot.todos.forEach(insertTodo);
        snapshot.deletedTodos.forEach(insertDeletedTodo);
      }
    });
  } finally {
    applyingRemotePatch = false;
  }
  publishDataRevision();
}

/**
 * 执行一组必须同时成功或失败的写操作。
 *
 * 归档/恢复、批量重排和全量导入都涉及多条 SQL。统一由此处包裹，既避免
 * 中途异常留下半完成数据，也把多次 execute 合并为一次 debounce 保存。
 */
function runTransaction<T>(operation: () => T): T {
  if (!db) throw new Error('Database not initialized');
  const isOutermost = transactionDepth === 0;
  if (isOutermost) {
    transactionDirty = false;
    db.run('BEGIN');
  }

  transactionDepth += 1;
  try {
    const result = operation();
    if (isOutermost) {
      db.run('COMMIT');
      if (transactionDirty) {
        scheduleSave();
        publishDataRevision();
      }
    }
    return result;
  } catch (error) {
    if (isOutermost) {
      db.run('ROLLBACK');
      transactionDirty = false;
    }
    throw error;
  } finally {
    // COMMIT 本身抛错时也必须平衡深度；否则后续写入会被误判在事务中。
    transactionDepth -= 1;
  }
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
  kind: string;
}

/** 将数据库行转换为 Project 对象 */
function rowToProject(row: ProjectRow): import('../types').Project {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === 'inbox' ? 'inbox' : row.kind === 'weekly' ? 'weekly' : 'user',
    color: row.color ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    order: row.sort_order,
  };
}

/** 获取所有项目（按 sort_order 排序，created_at 仅作兜底次序） */
export function getAllProjects(): import('../types').Project[] {
  return queryAll<ProjectRow>(
    "SELECT * FROM projects ORDER BY CASE kind WHEN 'inbox' THEN 0 ELSE 1 END, sort_order ASC, created_at ASC",
  ).map(rowToProject);
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
    `INSERT INTO projects (id, name, color, created_at, updated_at, sort_order, kind)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort_order), 0) + ${SORT_RANK_STEP} FROM projects)), ?)`,
    [
      project.id,
      project.name,
      project.color ?? null,
      project.createdAt,
      project.updatedAt,
      project.order ?? null,
      project.kind === 'inbox' ? 'inbox' : project.kind === 'weekly' ? 'weekly' : 'user',
    ],
  );
}

/** 更新项目 */
export function updateProject(project: import('../types').Project): void {
  if (getProjectById(project.id)?.kind === 'inbox') throw new Error('收集箱不能重命名或修改');
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
  // 切换到用户指定的完整顺序时才规范化；普通拖拽使用 moveProjectRank。
  runTransaction(() => {
    ids.forEach((id, idx) => {
      execute('UPDATE projects SET sort_order = ? WHERE id = ?', [(idx + 1) * SORT_RANK_STEP, id]);
    });
  });
}

/** 移动项目时只写被移动项目；间隔耗尽才在一次事务内规范化。 */
export function moveProjectRank(sourceId: string, targetId: string): import('../types').Project[] {
  const projects = getAllProjects();
  if (
    projects.some(
      (project) => project.kind === 'inbox' && (project.id === sourceId || project.id === targetId),
    )
  ) {
    throw new Error('收集箱不能参与项目排序');
  }
  const sourceIndex = projects.findIndex((project) => project.id === sourceId);
  const targetIndex = projects.findIndex((project) => project.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return projects;

  const next = [...projects];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  const index = next.findIndex((project) => project.id === sourceId);
  const before = next[index - 1]?.order;
  const after = next[index + 1]?.order;
  const rank =
    before === undefined
      ? (after ?? SORT_RANK_STEP) - SORT_RANK_STEP
      : after === undefined
        ? before + SORT_RANK_STEP
        : (before + after) / 2;

  runTransaction(() => {
    if (after !== undefined && before !== undefined && after - before < 0.001) {
      next.forEach((project, position) => {
        execute('UPDATE projects SET sort_order = ? WHERE id = ?', [
          (position + 1) * SORT_RANK_STEP,
          project.id,
        ]);
      });
    } else {
      execute('UPDATE projects SET sort_order = ? WHERE id = ?', [rank, sourceId]);
    }
  });
  return getAllProjects();
}

/**
 * 归档项目：其下所有 todos 移入归档（历史记录），再删除项目本身。
 * 项目原先的已归档行保留在 deleted_todos 中（历史记录不丢）。
 * 归档后事项仍可在历史记录页恢复或永久删除。
 */
export function deleteProject(id: string): void {
  const project = getProjectById(id);
  if (project?.kind === 'inbox') throw new Error('收集箱不能删除');
  if (!project) return;
  runTransaction(() => {
    // 先把当前 todos 移入归档（同批次共用时间戳），再删项目。
    // archiveTodos 内部会删除 todos 表对应行，不触碰 deleted_todos。
    archiveTodos(getTodosByProject(id));
    // 既有归档行也统一更新为项目删除前的最终名称，避免同组出现过期名称。
    execute('UPDATE deleted_todos SET project_name = ? WHERE project_id = ?', [project.name, id], {
      projectIds: [id],
    });
    execute('DELETE FROM projects WHERE id = ?', [id]);
  });
}

/** 按需创建唯一系统收集箱；仅直接新增未指定项目事项时调用。 */
export function ensureInboxProject(): import('../types').Project {
  const existing = getAllProjects().find((project) => project.kind === 'inbox');
  if (existing) return existing;
  const now = new Date().toISOString();
  const project: import('../types').Project = {
    id: crypto.randomUUID(),
    name: '收集箱',
    kind: 'inbox',
    createdAt: now,
    updatedAt: now,
    order: 0,
  };
  insertProject(project);
  return getProjectById(project.id) ?? project;
}

/** 在同一事务中确保收集箱存在并写入事项，避免失败时留下空收集箱。 */
export function insertTodosIntoInbox(todos: import('../types').Todo[]): import('../types').Project {
  let inbox: import('../types').Project | undefined;
  runTransaction(() => {
    inbox = ensureInboxProject();
    // 收集箱的 sort_order 由数据库权威计算，忽略调用方传入的 order。
    // 时间视图在「未选项目」分支拿不到收集箱已有事项，连续添加会都从
    // SORT_RANK_STEP 起，导致 sort_order 冲突。
    const existing = getTodosByProject(inbox.id);
    let order = existing.length ? Math.max(...existing.map((item) => item.order)) : 0;
    todos.forEach((todo) => {
      order += SORT_RANK_STEP;
      insertTodo({ ...todo, projectId: inbox!.id, order });
    });
  });
  return inbox!;
}

/** 从模板原子创建项目及其事项；同时兼容旧版本的 weekly 项目类型。 */
export function createProjectWithTodos(
  project: import('../types').Project,
  todos: import('../types').Todo[],
): import('../types').Project {
  runTransaction(() => {
    insertProject({ ...project, kind: project.kind === 'weekly' ? 'weekly' : 'user' });
    todos.forEach(insertTodo);
  });
  return getProjectById(project.id) ?? project;
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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  sort_order: number;
  pinned: number;
  planned_date: string | null;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    order: row.sort_order,
    pinned: row.pinned === 1,
    plannedDate: row.planned_date ?? undefined,
  };
}

/** 获取指定项目的所有 Todo */
export function getTodosByProject(projectId: string): import('../types').Todo[] {
  return queryAll<TodoRow>(
    'SELECT * FROM todos WHERE project_id = ? ORDER BY pinned DESC, sort_order ASC, created_at ASC',
    [projectId],
  ).map(rowToTodo);
}

/** 获取所有 Todo（跨项目） */
export function getAllTodos(): import('../types').Todo[] {
  return queryAll<TodoRow>('SELECT * FROM todos ORDER BY created_at DESC').map(rowToTodo);
}

/** 按项目汇总未完成事项数，供侧边栏一次性读取，避免把全部事项拉到 JS 再计数。 */
export function getIncompleteCountsByProject(): Record<string, number> {
  const rows = queryAll<{ project_id: string; count: number }>(
    'SELECT project_id, COUNT(*) AS count FROM todos WHERE completed = 0 GROUP BY project_id',
  );
  return Object.fromEntries(rows.map((row) => [row.project_id, row.count]));
}

/**
 * 跨项目关键词搜索：标题或描述命中即返回，结果按 created_at 倒序取前 limit 条。
 * 直接在 SQL 层做 LIKE + LIMIT，避免拉全表后在 JS 侧过滤（全局搜索每次按键触发）。
 * 关键词左右已加 %，调用方负责 trim / 转义特殊字符交给 LIKE 的 ESCAPE 规则处理。
 */
export function searchTodos(keyword: string, limit = 20): import('../types').Todo[] {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  // LIKE 转义：把 % _ \ 当字面量。开启 ESCAPE '\' 后反斜杠为转义符。
  const escaped = trimmed.replace(/[%_\\]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return queryAll<TodoRow>(
    `SELECT * FROM todos
     WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
     ORDER BY created_at DESC
     LIMIT ?`,
    [pattern, pattern, limit],
  ).map(rowToTodo);
}

/** 根据 ID 获取 Todo */
export function getTodoById(id: string): import('../types').Todo | null {
  const row = queryOne<TodoRow>('SELECT * FROM todos WHERE id = ?', [id]);
  return row ? rowToTodo(row) : null;
}

/** 插入 Todo */
export function insertTodo(todo: import('../types').Todo): void {
  execute(
    `INSERT INTO todos (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, planned_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ],
    { projectIds: [todo.projectId] },
  );
}

/** 批量插入事项：单个事务提交，避免多行导入时产生大量隐式 SQLite 提交。 */
export function insertTodos(todos: import('../types').Todo[]): void {
  if (todos.length === 0) return;
  runTransaction(() => {
    todos.forEach(insertTodo);
  });
}

/** 更新 Todo */
export function updateTodo(todo: import('../types').Todo): void {
  execute(
    `UPDATE todos SET title = ?, description = ?, completed = ?, priority = ?, updated_at = ?, completed_at = ?, sort_order = ?, pinned = ?, planned_date = ?
     WHERE id = ?`,
    [
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
    ],
    { projectIds: [todo.projectId] },
  );
}

/** 批量更新事项：调用方已生成完整的新对象时，用单个事务持久化。 */
export function updateTodos(todos: import('../types').Todo[]): void {
  if (todos.length === 0) return;
  runTransaction(() => {
    todos.forEach(updateTodo);
  });
}

/** 仅更新手动排序字段，避免拖拽重排时写入每条事项的全部列。 */
export function updateTodoOrders(
  items: ReadonlyArray<Pick<import('../types').Todo, 'id' | 'order'>>,
  projectId: string,
): void {
  if (items.length === 0) return;
  runTransaction(() => {
    items.forEach(({ id, order }) => {
      // 调用方已持有项目上下文；不要为每一行再 SELECT 一次 project_id。
      execute('UPDATE todos SET sort_order = ? WHERE id = ?', [order, id], {
        projectIds: [projectId],
      });
    });
  });
}

/**
 * 在同一项目内移动事项。正常路径只更新 moved 行的稀疏 rank；rank 间隔耗尽时
 * 才在单一事务中重编号。返回数据库排序后的列表，供 store 一次性发布。
 */
export function moveTodoRank(
  projectId: string,
  sourceId: string,
  targetId: string,
): import('../types').Todo[] {
  const todos = getTodosByProject(projectId);
  const sourceIndex = todos.findIndex((todo) => todo.id === sourceId);
  const targetIndex = todos.findIndex((todo) => todo.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return todos;

  const next = [...todos];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  const index = next.findIndex((todo) => todo.id === sourceId);
  const before = next[index - 1]?.order;
  const after = next[index + 1]?.order;
  const rank =
    before === undefined
      ? (after ?? SORT_RANK_STEP) - SORT_RANK_STEP
      : after === undefined
        ? before + SORT_RANK_STEP
        : (before + after) / 2;

  runTransaction(() => {
    if (after !== undefined && before !== undefined && after - before < 0.001) {
      next.forEach((todo, position) => {
        execute(
          'UPDATE todos SET sort_order = ? WHERE id = ?',
          [(position + 1) * SORT_RANK_STEP, todo.id],
          {
            projectIds: [projectId],
          },
        );
      });
      return;
    }
    execute('UPDATE todos SET sort_order = ? WHERE id = ?', [rank, sourceId], {
      projectIds: [projectId],
    });
  });
  return getTodosByProject(projectId);
}

/** 跨项目移动事项，并追加到目标项目的末尾。 */
export function moveTodoToProject(id: string, targetProjectId: string): import('../types').Todo {
  const todo = getTodoById(id);
  if (!todo) throw new Error(`事项不存在: ${id}`);
  if (!getProjectById(targetProjectId)) throw new Error('目标项目不存在');
  const targetTodos = getTodosByProject(targetProjectId);
  const nextOrder = targetTodos.length
    ? Math.max(...targetTodos.map((item) => item.order)) + SORT_RANK_STEP
    : SORT_RANK_STEP;
  execute(
    'UPDATE todos SET project_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
    [targetProjectId, nextOrder, new Date().toISOString(), id],
    { projectIds: [...new Set([todo.projectId, targetProjectId])] },
  );
  return getTodoById(id)!;
}

/** 删除 Todo（从 todos 表移除；调用方负责先插入到归档表） */
export function deleteTodo(id: string): void {
  const projectId = getTodoById(id)?.projectId;
  execute('DELETE FROM todos WHERE id = ?', [id], projectId ? { projectIds: [projectId] } : 'full');
}

/** 批量删除 Todo */
export function deleteTodos(ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  const projectIds = ids
    .map((id) => getTodoById(id)?.projectId)
    .filter((id): id is string => id !== undefined);
  execute(`DELETE FROM todos WHERE id IN (${placeholders})`, ids, { projectIds });
}

// ============================================
// 归档数据访问（原回收站；现作为「历史记录」永久保留）
// ============================================

/** 归档行 */
interface DeletedTodoRow extends TodoRow {
  project_name: string | null;
  deleted_at: string;
  expires_at: string;
}

/** 将数据库行转换为 DeletedTodo 对象 */
function rowToDeletedTodo(row: DeletedTodoRow): import('../types').DeletedTodo {
  return {
    ...rowToTodo(row),
    projectName: row.project_name ?? undefined,
    deletedAt: row.deleted_at,
    expiresAt: row.expires_at,
  };
}

/** 获取指定项目的归档事项 */
export function getDeletedTodosByProject(projectId: string): import('../types').DeletedTodo[] {
  return queryAll<DeletedTodoRow>(
    'SELECT * FROM deleted_todos WHERE project_id = ? ORDER BY deleted_at DESC',
    [projectId],
  ).map(rowToDeletedTodo);
}

/** 获取所有归档事项（用于历史记录页跨项目展示） */
export function getAllDeletedTodos(): import('../types').DeletedTodo[] {
  return queryAll<DeletedTodoRow>('SELECT * FROM deleted_todos ORDER BY deleted_at DESC').map(
    rowToDeletedTodo,
  );
}

/** 获取归档总数（用于历史记录页标题显示，避免全量加载） */
export function getArchivedTodosCount(): number {
  const row = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM deleted_todos');
  return row?.count ?? 0;
}

/**
 * 归档历史的稳定分页游标。归档批次会共用 deleted_at，必须同时携带 id，
 * 才能避免同一时间戳下翻页时漏项或重复项。
 */
export interface ArchivedTodoCursor {
  deletedAt: string;
  id: string;
}

/**
 * 以 (deleted_at, id) 游标分页读取归档事项。
 * 相比 OFFSET，深页无需扫描并丢弃此前所有行；排序字段与 idx_deleted_deleted_at_id 一致。
 */
export function getDeletedTodosPage(
  limit: number,
  cursor?: ArchivedTodoCursor,
): import('../types').DeletedTodo[] {
  const query = cursor
    ? `SELECT * FROM deleted_todos
       WHERE deleted_at < ? OR (deleted_at = ? AND id < ?)
       ORDER BY deleted_at DESC, id DESC LIMIT ?`
    : 'SELECT * FROM deleted_todos ORDER BY deleted_at DESC, id DESC LIMIT ?';
  const params = cursor ? [cursor.deletedAt, cursor.deletedAt, cursor.id, limit] : [limit];
  return queryAll<DeletedTodoRow>(query, params).map(rowToDeletedTodo);
}

/** 插入归档事项 */
export function insertDeletedTodo(todo: import('../types').DeletedTodo): void {
  execute(
    `INSERT INTO deleted_todos (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, planned_date, project_name, deleted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      todo.projectName ?? getProjectById(todo.projectId)?.name ?? null,
      todo.deletedAt,
      todo.expiresAt,
    ],
    { projectIds: [todo.projectId] },
  );
}

/**
 * 将事项移入归档。返回写入归档表的对象，供 Zustand 直接更新内存状态。
 * 同一时间戳用于整批归档，使历史记录的排序和批量语义保持一致。
 */
export function archiveTodos(todos: import('../types').Todo[]): import('../types').DeletedTodo[] {
  if (todos.length === 0) return [];
  const archivedAt = new Date().toISOString();
  const archived = todos.map((todo) => ({
    ...todo,
    projectName: getProjectById(todo.projectId)?.name,
    deletedAt: archivedAt,
    expiresAt: archivedAt,
  }));
  runTransaction(() => {
    archived.forEach(insertDeletedTodo);
    deleteTodos(archived.map((todo) => todo.id));
  });
  return archived;
}

/** 从归档永久删除 */
export function permanentlyDeleteTodo(id: string): void {
  const projectId = queryOne<DeletedTodoRow>('SELECT project_id FROM deleted_todos WHERE id = ?', [
    id,
  ])?.project_id;
  execute(
    'DELETE FROM deleted_todos WHERE id = ?',
    [id],
    projectId ? { projectIds: [projectId] } : 'full',
  );
}

/** 从归档恢复（重新插入到 todos 表） */
export function restoreTodo(id: string): void {
  const row = queryOne<DeletedTodoRow>('SELECT * FROM deleted_todos WHERE id = ?', [id]);
  if (!row) return;
  runTransaction(() => {
    // 重新插入到 todos 表（保留归档时的 pinned 状态）
    execute(
      `INSERT INTO todos (id, project_id, title, description, completed, priority, created_at, updated_at, completed_at, sort_order, pinned, planned_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.project_id,
        row.title,
        row.description,
        row.completed,
        row.priority,
        row.created_at,
        new Date().toISOString(),
        row.completed_at,
        row.sort_order,
        row.pinned,
        row.planned_date,
      ],
      { projectIds: [row.project_id] },
    );
    // 从归档删除
    execute('DELETE FROM deleted_todos WHERE id = ?', [id], { projectIds: [row.project_id] });
  });
}

/** 清空归档（历史记录）。传 projectId 时只清该项目，否则清全部 */
export function emptyArchive(projectId?: string): void {
  if (projectId) {
    execute('DELETE FROM deleted_todos WHERE project_id = ?', [projectId], {
      projectIds: [projectId],
    });
  } else {
    execute('DELETE FROM deleted_todos', []);
  }
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

/** 一次读取全部设置，供启动加载和全量导出复用，减少重复 prepare / 查询。 */
export function getSettings(): Record<string, string> {
  return Object.fromEntries(
    queryAll<{ key: string; value: string }>('SELECT key, value FROM settings').map((row) => [
      row.key,
      row.value,
    ]),
  );
}

/** 设置设置值 */
export function setSetting(key: string, value: string): void {
  execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

/** 删除设置值（不存在时静默忽略） */
export function deleteSetting(key: string): void {
  execute('DELETE FROM settings WHERE key = ?', [key]);
}

// ============================================
// 数据导出/导入
// ============================================

/**
 * 导出完整应用数据
 */
export function exportAllData(): import('../types').AppExportData {
  const settingsMap = getSettings();
  const stickerPreset =
    (settingsMap.stickerPreset as StickerPreset | undefined) ?? DEFAULT_SETTINGS.stickerPreset;
  return {
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    projects: getAllProjects(),
    todos: getAllTodos(),
    deletedTodos: getAllDeletedTodos(),
    settings: {
      theme: (settingsMap.theme as import('../types').ThemeName | undefined) ?? 'default',
      colorMode: (settingsMap.colorMode as import('../types').ThemeMode | undefined) ?? 'system',
      autoStart: settingsMap.autoStart === 'true',
      minimizeToTray: settingsMap.minimizeToTray !== 'false',
      dataVersion: DB_VERSION,
      // 专注模式已废弃；导出中保持当前默认值，避免旧键影响备份内容。
      focusMode: DEFAULT_SETTINGS.focusMode,
      autoUpdateEnabled:
        settingsMap.autoUpdateEnabled === undefined
          ? true
          : settingsMap.autoUpdateEnabled === 'true',
      // 与 useSettingsStore.loadSettings 保持一致：缺失键回退空串
      lastActiveProjectId: settingsMap.lastActiveProjectId ?? '',
      customTemplates: (() => {
        try {
          const parsed: unknown = JSON.parse(settingsMap.customTemplates ?? '[]');
          return Array.isArray(parsed) ? (parsed as import('../types').TodoTemplate[]) : [];
        } catch {
          return [];
        }
      })(),
      todoViewMode: settingsMap.todoViewMode === 'card' ? 'card' : DEFAULT_SETTINGS.todoViewMode,
      showWeeklyProjects: settingsMap.showWeeklyProjects !== 'false',
      // 时间格式：缺失键回退默认相对时间，与 loadSettings 对齐
      timeFormat: settingsMap.timeFormat === 'exact' ? 'exact' : DEFAULT_SETTINGS.timeFormat,
      // ===== 贴图样式（缺失时回退玻璃预设默认值，与 loadSettings 对齐） =====
      stickerPreset,
      stickerRadius: Number(settingsMap.stickerRadius ?? DEFAULT_SETTINGS.stickerRadius),
      stickerBlur: Number(settingsMap.stickerBlur ?? DEFAULT_SETTINGS.stickerBlur),
      // stickerOpacity 由 preset 派生（与 loadSettings 对齐），不直读 DB 旧值
      stickerOpacity: STICKER_PRESET_VALUES[stickerPreset].opacity,
      stickerShadow: settingsMap.stickerShadow !== 'false',
    },
  };
}

/**
 * 导入完整应用数据（替换现有数据）
 */
export async function importAllData(data: import('../types').AppExportData): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  runTransaction(() => {
    // 全量导入是替换语义：连同全局设置一起替换，避免旧项目的筛选/庆祝状态泄漏。
    execute('DELETE FROM todos');
    execute('DELETE FROM deleted_todos');
    execute('DELETE FROM projects');
    execute('DELETE FROM settings');

    // 插入项目
    let hasInbox = false;
    for (const project of data.projects) {
      const kind =
        project.kind === 'inbox' && !hasInbox
          ? 'inbox'
          : project.kind === 'weekly'
            ? 'weekly'
            : 'user';
      if (kind === 'inbox') hasInbox = true;
      insertProject({ ...project, kind });
    }

    // 插入 Todo（旧导出文件可能缺 pinned，兜底为 false 避免写入 NOT NULL 列）
    for (const todo of data.todos) {
      insertTodo({ ...todo, pinned: todo.pinned ?? false });
    }

    // 插入归档（历史记录；同样兜底 pinned）
    for (const deleted of data.deletedTodos) {
      insertDeletedTodo({ ...deleted, pinned: deleted.pinned ?? false });
    }

    // 老备份可能没有 settings（或 settings 为空对象），一律写入完整默认集，
    // 保证导入后不会残留被替换数据的设置。dataVersion 永远使用当前 schema 版本。
    const settings = data.settings ?? DEFAULT_SETTINGS;
    setSetting('theme', settings.theme ?? DEFAULT_SETTINGS.theme);
    setSetting('colorMode', settings.colorMode ?? DEFAULT_SETTINGS.colorMode);
    setSetting('autoStart', String(settings.autoStart ?? DEFAULT_SETTINGS.autoStart));
    setSetting(
      'minimizeToTray',
      String(settings.minimizeToTray ?? DEFAULT_SETTINGS.minimizeToTray),
    );
    setSetting(
      'autoUpdateEnabled',
      String(settings.autoUpdateEnabled ?? DEFAULT_SETTINGS.autoUpdateEnabled),
    );
    setSetting(
      'lastActiveProjectId',
      settings.lastActiveProjectId ?? DEFAULT_SETTINGS.lastActiveProjectId,
    );
    setSetting('customTemplates', JSON.stringify(settings.customTemplates ?? []));
    setSetting('todoViewMode', settings.todoViewMode ?? DEFAULT_SETTINGS.todoViewMode);
    setSetting(
      'showWeeklyProjects',
      String(settings.showWeeklyProjects ?? DEFAULT_SETTINGS.showWeeklyProjects),
    );
    setSetting('stickerPreset', settings.stickerPreset ?? DEFAULT_SETTINGS.stickerPreset);
    setSetting('stickerRadius', String(settings.stickerRadius ?? DEFAULT_SETTINGS.stickerRadius));
    setSetting('stickerBlur', String(settings.stickerBlur ?? DEFAULT_SETTINGS.stickerBlur));
    setSetting(
      'stickerOpacity',
      String(settings.stickerOpacity ?? DEFAULT_SETTINGS.stickerOpacity),
    );
    setSetting('stickerShadow', String(settings.stickerShadow ?? DEFAULT_SETTINGS.stickerShadow));
    setSetting('dataVersion', String(DB_VERSION));
  });

  await flushSave();
}

/**
 * 重置数据库（清空所有数据并重建）
 */
export async function resetDatabase(): Promise<void> {
  if (!db) return;
  runTransaction(() => {
    execute('DROP TABLE IF EXISTS todos');
    execute('DROP TABLE IF EXISTS deleted_todos');
    execute('DROP TABLE IF EXISTS projects');
    execute('DROP TABLE IF EXISTS settings');
    createTables(db!);
    setSetting('dataVersion', String(DB_VERSION));
  });
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
