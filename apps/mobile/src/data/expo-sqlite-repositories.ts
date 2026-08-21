/**
 * @file expo-sqlite 适配器
 * @description @celery/data Repository 契约在移动端的实现。
 *              SQL 语义与 crates/celery-db 对齐（同一 v3 schema、游标分页、
 *              单事务批量写、归档快照）；差异点：
 *              - 搜索用 LIKE（expo-sqlite 不保证编入 FTS5，命中集与契约一致）；
 *              - 游标为本实现内部的 base64(JSON)，与桌面端互不透传。
 *
 *              契约测试需真机/模拟器（expo-sqlite 是原生模块），在 Expo CI
 *              （EAS Maestro 里程碑）挂载；本文件的类型正确性由 tsc 保证。
 */

import * as SQLite from 'expo-sqlite';
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

const RANK_GAP = 65_536;

const nowIso = (): string => new Date().toISOString();

/**
 * 把 SQL 中的 null/undefined 占位符改写为字面 NULL、其余参数前移。
 * 占位符识别跳过单引号字符串字面量（含 '' 转义），并在改写后校验占位符
 * 与参数数量一致——数量不匹配时原生绑定会抛错，这里自行动了 SQL 就必须
 * 自己把住这道关，否则会静默错位绑定（写错列）而非报错。
 */
export function rewriteNullBinds(
  sql: string,
  params: SQLite.SQLiteBindValue[],
): { sql: string; params: SQLite.SQLiteBindValue[] } {
  const kept: SQLite.SQLiteBindValue[] = [];
  let inLiteral = false;
  let out = '';
  let consumed = 0;
  for (let pos = 0; pos < sql.length; pos += 1) {
    const ch = sql[pos];
    if (ch === "'") {
      // '' 是字面量内的转义单引号，不结束字面量
      if (inLiteral && sql[pos + 1] === "'") {
        out += "''";
        pos += 1;
        continue;
      }
      inLiteral = !inLiteral;
      out += ch;
    } else if (ch === '?' && !inLiteral) {
      const p = params[consumed];
      consumed += 1;
      if (p === null || p === undefined) {
        out += 'NULL';
      } else {
        kept.push(p);
        out += '?';
      }
    } else {
      out += ch;
    }
  }
  if (consumed !== params.length) {
    throw new Error(`SQL 占位符 ${consumed} 个与参数 ${params.length} 个不一致: ${sql}`);
  }
  return { sql: out, params: kept };
}

/**
 * expo-sqlite 15（SDK 54）Android 桥不透传 null 绑定值：runSync 直接抛
 * "Cannot convert '[object Object]' to a Kotlin type"（含 null 参数的
 * INSERT/UPDATE 全部静默失败）。经 rewriteNullBinds 改写后绑定值不含
 * null，其余行为与 runSync 一致（数量不匹配同样抛错）。
 */
function runSafe(
  db: SQLite.SQLiteDatabase,
  sql: string,
  params: SQLite.SQLiteBindValue[] = [],
): SQLite.SQLiteRunResult {
  if (!params.some((p) => p === null || p === undefined)) {
    return db.runSync(sql, params);
  }
  const rewritten = rewriteNullBinds(sql, params);
  return db.runSync(rewritten.sql, rewritten.params);
}

const priorityWeightSql = "CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END";

const clampLimit = (limit: number | undefined): number => Math.min(Math.max(limit ?? 50, 1), 200);

interface CursorPayload {
  sort: string;
  keys: (string | number)[];
}

/** RN/Hermes 无 Web crypto/btoa/Buffer 全局，UUID 与游标编码都不能依赖宿主 API。 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // 降级 v4：本地单机 ID，只需唯一性，无加密需求
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function encodeCursor(sort: string, keys: (string | number)[]): string {
  // 游标内容恒为 ASCII（ISO 时间 / uuid / 数字），encodeURIComponent 可逆且无宿主依赖
  return encodeURIComponent(JSON.stringify({ sort, keys }));
}

function decodeCursor(sort: string, cursor: string): (string | number)[] {
  try {
    const parsed = JSON.parse(decodeURIComponent(cursor)) as CursorPayload;
    if (parsed.sort !== sort || !Array.isArray(parsed.keys)) throw new Error();
    return parsed.keys;
  } catch {
    throw new RepositoryError('bad-cursor', '游标无效或不属于当前查询');
  }
}

/** v3 DDL（与 crates/celery-db/src/schema/v3_initial.sql 同步维护；无 FTS5） */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user','inbox','weekly')),
  color TEXT, rank REAL NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_projects_rank ON projects (rank);
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  priority TEXT NOT NULL CHECK (priority IN ('high','medium','low')),
  planned_date TEXT, pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0,1)),
  rank REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_project_created ON todos (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_todos_project_rank ON todos (project_id, rank);
CREATE TABLE IF NOT EXISTS archived_todos (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT,
  completed INTEGER NOT NULL DEFAULT 0, priority TEXT NOT NULL,
  planned_date TEXT, pinned INTEGER NOT NULL DEFAULT 0, rank REAL NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT,
  archived_at TEXT NOT NULL, project_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_archived_archived_at ON archived_todos (archived_at DESC);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

interface TodoRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  completed: number;
  priority: 'high' | 'medium' | 'low';
  planned_date: string | null;
  pinned: number;
  rank: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ArchivedRow extends TodoRow {
  archived_at: string;
  project_name: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  kind: 'user' | 'inbox' | 'weekly';
  color: string | null;
  rank: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const toTodo = (r: TodoRow): TodoDto => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  description: r.description,
  completed: r.completed !== 0,
  priority: r.priority,
  plannedDate: r.planned_date,
  pinned: r.pinned !== 0,
  rank: r.rank,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
});

const toArchived = (r: ArchivedRow): ArchivedTodoDto => ({
  ...toTodo(r),
  archivedAt: r.archived_at,
  projectName: r.project_name,
});

const toProject = (r: ProjectRow): ProjectDto => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  color: r.color,
  rank: r.rank,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  archivedAt: r.archived_at,
});

function fail(message: string, kind: 'invalid' | 'not-found' = 'invalid'): never {
  throw new RepositoryError(kind, message);
}

export function createExpoSqliteRepositories(dbName = 'celery-v3.db'): Repositories {
  const db = SQLite.openDatabaseSync(dbName);
  db.execSync(SCHEMA_SQL);
  runSafe(
    db,
    "INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (1, 'v3-initial', ?)",
    [nowIso()],
  );

  const nextProjectRank = (): number => {
    const row = db.getFirstSync<{ max: number | null }>('SELECT MAX(rank) AS max FROM projects');
    return (row?.max ?? -RANK_GAP) + RANK_GAP;
  };

  const requireProject = (id: string): void => {
    const hit = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM projects WHERE id = ?', [
      id,
    ]);
    if (!hit || hit.n === 0) fail(`项目 ${id} 不存在`, 'not-found');
  };

  const requireTodo = (id: string): void => {
    const hit = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM todos WHERE id = ?', [
      id,
    ]);
    if (!hit || hit.n === 0) fail(`事项 ${id} 不存在`, 'not-found');
  };

  const applyPatchSql = (
    patch: TodoPatch,
    now: string,
  ): { sets: string[]; vals: SQLite.SQLiteBindValue[] } => {
    const sets: string[] = ['updated_at = ?'];
    const vals: SQLite.SQLiteBindValue[] = [now];
    if (patch.title !== undefined && patch.title !== null) {
      if (!patch.title.trim()) fail('标题不能为空');
      sets.push('title = ?');
      vals.push(patch.title.trim());
    }
    if (patch.description !== undefined) {
      sets.push('description = ?');
      vals.push(patch.description);
    }
    if (patch.completed !== undefined && patch.completed !== null) {
      sets.push('completed = ?');
      vals.push(patch.completed ? 1 : 0);
      if (patch.completedAt !== undefined && patch.completedAt !== null && patch.completed) {
        sets.push('completed_at = ?');
        vals.push(patch.completedAt);
      } else if (patch.completed) {
        sets.push('completed_at = ?');
        vals.push(now);
      } else {
        sets.push('completed_at = ?');
        vals.push(null);
      }
    } else if (patch.completedAt !== undefined) {
      sets.push('completed_at = ?');
      vals.push(patch.completedAt);
    }
    if (patch.priority !== undefined && patch.priority !== null) {
      sets.push('priority = ?');
      vals.push(patch.priority);
    }
    if (patch.plannedDate !== undefined) {
      sets.push('planned_date = ?');
      vals.push(patch.plannedDate);
    }
    if (patch.pinned !== undefined && patch.pinned !== null) {
      sets.push('pinned = ?');
      vals.push(patch.pinned ? 1 : 0);
    }
    return { sets, vals };
  };

  const cursorKeysOf = (sort: 'created-desc' | 'priority' | 'manual' | 'search', t: TodoDto) => {
    if (sort === 'manual') return [t.pinned ? 1 : 0, t.rank, t.id];
    if (sort === 'priority') {
      const w = t.priority === 'high' ? 3 : t.priority === 'medium' ? 2 : 1;
      return [t.pinned ? 1 : 0, w, t.createdAt, t.id];
    }
    return [t.pinned ? 1 : 0, t.createdAt, t.id];
  };

  const pageInMemory = (
    rows: TodoDto[],
    sort: 'created-desc' | 'priority' | 'manual' | 'search',
    limit: number,
    cursor: string | null | undefined,
  ): TodoPage => {
    let filtered = rows;
    if (cursor) {
      const keys = decodeCursor(sort, cursor);
      filtered = rows.filter((t) => {
        const cur = cursorKeysOf(sort, t);
        for (let i = 0; i < keys.length; i++) {
          const a = cur[i];
          const b = keys[i];
          if (a === b) continue;
          return sort === 'manual' ? a > b : a < b;
        }
        return false;
      });
    }
    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    return {
      items,
      nextCursor: hasMore ? encodeCursor(sort, cursorKeysOf(sort, items[items.length - 1])) : null,
    };
  };

  const sortSql = (sort: TodoQuery['sort']): string => {
    switch (sort) {
      case 'manual':
        return 't.pinned DESC, t.rank ASC, t.id ASC';
      case 'priority':
        return `t.pinned DESC, ${priorityWeightSql} DESC, t.created_at DESC, t.id DESC`;
      default:
        return 't.pinned DESC, t.created_at DESC, t.id DESC';
    }
  };

  return {
    todos: {
      async page(query) {
        const sort = query.sort ?? 'created-desc';
        const where: string[] = [];
        const vals: SQLite.SQLiteBindValue[] = [];
        if (query.projectId !== undefined && query.projectId !== null) {
          where.push('t.project_id = ?');
          vals.push(query.projectId);
        }
        const filter = query.filter ?? 'all';
        if (filter === 'active') where.push('t.completed = 0');
        if (filter === 'completed') where.push('t.completed = 1');
        if (query.priority !== undefined && query.priority !== null) {
          where.push('t.priority = ?');
          vals.push(query.priority);
        }
        if (query.plannedFrom !== undefined && query.plannedFrom !== null) {
          where.push('t.planned_date >= ?');
          vals.push(query.plannedFrom);
        }
        if (query.plannedTo !== undefined && query.plannedTo !== null) {
          where.push('t.planned_date <= ?');
          vals.push(query.plannedTo);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        // 移动端量级有限：按排序取全量后内存分页（语义与桌面 keyset 一致）
        const rows = db.getAllSync<TodoRow>(
          `SELECT t.* FROM todos t ${whereSql} ORDER BY ${sortSql(sort)}`,
          vals,
        );
        return pageInMemory(rows.map(toTodo), sort, clampLimit(query.limit), query.cursor);
      },
      async counts(projectId) {
        const [row] =
          projectId === undefined || projectId === null
            ? db.getAllSync<{ total: number; done: number }>(
                'SELECT COUNT(*) AS total, COALESCE(SUM(completed),0) AS done FROM todos',
              )
            : db.getAllSync<{ total: number; done: number }>(
                'SELECT COUNT(*) AS total, COALESCE(SUM(completed),0) AS done FROM todos WHERE project_id = ?',
                [projectId],
              );
        return {
          total: row?.total ?? 0,
          completed: row?.done ?? 0,
          active: (row?.total ?? 0) - (row?.done ?? 0),
        };
      },
      async get(id) {
        const row = db.getFirstSync<TodoRow>('SELECT t.* FROM todos t WHERE t.id = ?', [id]);
        return row ? toTodo(row) : null;
      },
      async create(newTodo) {
        const title = newTodo.title.trim();
        if (!title) fail('标题不能为空');
        requireProject(newTodo.projectId);
        const now = nowIso();
        runSafe(
          db,
          `INSERT INTO todos (id, project_id, title, description, completed, priority,
           planned_date, pinned, rank, created_at, updated_at)
           VALUES (?,?,?,?,0,?,?,?,?,?,?)`,
          [
            newTodo.id,
            newTodo.projectId,
            title,
            newTodo.description ?? null,
            newTodo.priority,
            newTodo.plannedDate ?? null,
            newTodo.pinned ? 1 : 0,
            newTodo.rank,
            now,
            now,
          ],
        );
        return (await this.get(newTodo.id))!;
      },
      async createBulk(items) {
        if (items.length === 0) return 0;
        db.withTransactionSync(() => {
          for (const n of items) {
            const title = n.title.trim();
            if (!title) fail('标题不能为空');
            requireProject(n.projectId);
          }
          const now = nowIso();
          for (const n of items) {
            runSafe(
              db,
              `INSERT INTO todos (id, project_id, title, description, completed, priority,
               planned_date, pinned, rank, created_at, updated_at)
               VALUES (?,?,?,?,0,?,?,?,?,?,?)`,
              [
                n.id,
                n.projectId,
                n.title.trim(),
                n.description ?? null,
                n.priority,
                n.plannedDate ?? null,
                n.pinned ? 1 : 0,
                n.rank,
                now,
                now,
              ],
            );
          }
        });
        return items.length;
      },
      async update(id, patch) {
        requireTodo(id);
        const { sets, vals } = applyPatchSql(patch, nowIso());
        runSafe(db, `UPDATE todos SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
        return (await this.get(id))!;
      },
      async batchUpdate(payload) {
        let n = 0;
        db.withTransactionSync(() => {
          const { sets, vals } = applyPatchSql(payload.patch, nowIso());
          for (const id of payload.ids) {
            const res = runSafe(db, `UPDATE todos SET ${sets.join(', ')} WHERE id = ?`, [
              ...vals,
              id,
            ]);
            n += res.changes;
          }
        });
        return n;
      },
      async move(payload) {
        requireProject(payload.targetProjectId);
        let n = 0;
        db.withTransactionSync(() => {
          for (const id of payload.ids) {
            n += runSafe(db, 'UPDATE todos SET project_id = ?, updated_at = ? WHERE id = ?', [
              payload.targetProjectId,
              nowIso(),
              id,
            ]).changes;
          }
        });
        return n;
      },
      async reorder(payload) {
        let n = 0;
        db.withTransactionSync(() => {
          payload.orderedIds.forEach((id, i) => {
            n += runSafe(
              db,
              'UPDATE todos SET rank = ?, updated_at = ? WHERE id = ? AND project_id = ?',
              [i * RANK_GAP, nowIso(), id, payload.projectId],
            ).changes;
          });
        });
        return n;
      },
      async archive(ids) {
        let n = 0;
        db.withTransactionSync(() => {
          for (const id of ids) {
            n += runSafe(
              db,
              `INSERT INTO archived_todos (id, project_id, title, description, completed,
               priority, planned_date, pinned, rank, created_at, updated_at, completed_at,
               archived_at, project_name)
               SELECT t.id, t.project_id, t.title, t.description, t.completed, t.priority,
                      t.planned_date, t.pinned, t.rank, t.created_at, t.updated_at,
                      t.completed_at, ?,
                      (SELECT p.name FROM projects p WHERE p.id = t.project_id)
               FROM todos t WHERE t.id = ?`,
              [nowIso(), id],
            ).changes;
            runSafe(db, 'DELETE FROM todos WHERE id = ?', [id]);
          }
        });
        return n;
      },
      async archivedPage(query) {
        const where: string[] = [];
        const vals: SQLite.SQLiteBindValue[] = [];
        if (query.projectId !== undefined && query.projectId !== null) {
          where.push('a.project_id = ?');
          vals.push(query.projectId);
        }
        const term = query.term?.trim();
        if (term) {
          where.push('(a.title LIKE ? OR a.description LIKE ?)');
          vals.push(`%${term}%`, `%${term}%`);
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const rows = db.getAllSync<ArchivedRow>(
          `SELECT a.* FROM archived_todos a ${whereSql} ORDER BY a.archived_at DESC, a.id DESC`,
          vals,
        );
        const limit = clampLimit(query.limit);
        let start = 0;
        if (query.cursor) {
          const [at, id] = decodeCursor('archived', query.cursor);
          start = rows.findIndex((r) => r.archived_at === at && r.id === id);
          start = start === -1 ? rows.length : start + 1;
        }
        const items = rows.slice(start, start + limit).map(toArchived);
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
      async restoreArchived(ids, fallbackProjectId) {
        let n = 0;
        db.withTransactionSync(() => {
          for (const id of ids) {
            const row = db.getFirstSync<ArchivedRow>('SELECT * FROM archived_todos WHERE id = ?', [
              id,
            ]);
            if (!row) continue;
            const exists = db.getFirstSync<{ n: number }>(
              'SELECT COUNT(*) AS n FROM projects WHERE id = ?',
              [row.project_id],
            );
            let target = row.project_id;
            if (!exists || exists.n === 0) {
              if (!fallbackProjectId) {
                fail(`归档事项 ${id} 的原项目已不存在，且未提供恢复目标项目`);
              }
              requireProject(fallbackProjectId);
              target = fallbackProjectId;
            }
            n += runSafe(
              db,
              `INSERT INTO todos (id, project_id, title, description, completed, priority,
               planned_date, pinned, rank, created_at, updated_at, completed_at)
               SELECT a.id, ?, a.title, a.description, a.completed, a.priority,
                      a.planned_date, a.pinned, a.rank, a.created_at, ?, a.completed_at
               FROM archived_todos a WHERE a.id = ?`,
              [target, nowIso(), id],
            ).changes;
            runSafe(db, 'DELETE FROM archived_todos WHERE id = ?', [id]);
          }
        });
        return n;
      },
      async purgeArchived(ids) {
        let n = 0;
        for (const id of ids) {
          n += runSafe(db, 'DELETE FROM archived_todos WHERE id = ?', [id]).changes;
        }
        return n;
      },
      async purgeAllArchived() {
        return runSafe(db, 'DELETE FROM archived_todos').changes;
      },
      async search(query) {
        const term = query.term.trim();
        if (!term) fail('搜索词不能为空');
        const where = ['(t.title LIKE ? OR t.description LIKE ?)'];
        const vals: SQLite.SQLiteBindValue[] = [`%${term}%`, `%${term}%`];
        if (query.projectId !== undefined && query.projectId !== null) {
          where.push('t.project_id = ?');
          vals.push(query.projectId);
        }
        if (query.completed !== undefined && query.completed !== null) {
          where.push('t.completed = ?');
          vals.push(query.completed ? 1 : 0);
        }
        const rows = db.getAllSync<TodoRow>(
          `SELECT t.* FROM todos t WHERE ${where.join(' AND ')} ORDER BY ${sortSql('created-desc')}`,
          vals,
        );
        return pageInMemory(rows.map(toTodo), 'search', clampLimit(query.limit), query.cursor);
      },
    },

    projects: {
      async list(includeArchived = false) {
        const rows = includeArchived
          ? db.getAllSync<ProjectRow>('SELECT * FROM projects ORDER BY rank ASC, id ASC')
          : db.getAllSync<ProjectRow>(
              'SELECT * FROM projects WHERE archived_at IS NULL ORDER BY rank ASC, id ASC',
            );
        return rows.map(toProject);
      },
      async get(id) {
        const row = db.getFirstSync<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
        return row ? toProject(row) : null;
      },
      async create(newProject) {
        const name = newProject.name.trim();
        if (!name) fail('项目名不能为空');
        if (newProject.kind === 'inbox') fail('收集箱只能由 ensureInbox 创建，且全局唯一');
        if (db.getFirstSync('SELECT 1 FROM projects WHERE id = ?', [newProject.id])) {
          fail(`创建项目失败: 主键冲突 ${newProject.id}`);
        }
        const now = nowIso();
        runSafe(
          db,
          `INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)`,
          [
            newProject.id,
            name,
            newProject.kind,
            newProject.color ?? null,
            newProject.rank ?? nextProjectRank(),
            now,
            now,
          ],
        );
        return (await this.get(newProject.id))!;
      },
      async update(id, patch) {
        requireProject(id);
        const now = nowIso();
        if (patch.name !== undefined && patch.name !== null) {
          const name = patch.name.trim();
          if (!name) fail('项目名不能为空');
          runSafe(db, 'UPDATE projects SET name = ?, updated_at = ? WHERE id = ?', [name, now, id]);
        }
        if (patch.color !== undefined) {
          runSafe(db, 'UPDATE projects SET color = ?, updated_at = ? WHERE id = ?', [
            patch.color,
            now,
            id,
          ]);
        }
        if (patch.archived !== undefined && patch.archived !== null) {
          runSafe(db, 'UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?', [
            patch.archived ? nowIso() : null,
            now,
            id,
          ]);
        }
        return (await this.get(id))!;
      },
      async reorder(payload) {
        let n = 0;
        db.withTransactionSync(() => {
          payload.orderedIds.forEach((id, i) => {
            n += runSafe(db, 'UPDATE projects SET rank = ?, updated_at = ? WHERE id = ?', [
              i * RANK_GAP,
              nowIso(),
              id,
            ]).changes;
          });
        });
        return n;
      },
      async deletePermanently(id) {
        requireProject(id);
        db.withTransactionSync(() => {
          runSafe(
            db,
            `INSERT INTO archived_todos (id, project_id, title, description, completed,
             priority, planned_date, pinned, rank, created_at, updated_at, completed_at,
             archived_at, project_name)
             SELECT t.id, t.project_id, t.title, t.description, t.completed, t.priority,
                    t.planned_date, t.pinned, t.rank, t.created_at, t.updated_at,
                    t.completed_at, ?, (SELECT p.name FROM projects p WHERE p.id = ?)
             FROM todos t WHERE t.project_id = ?`,
            [nowIso(), id, id],
          );
          runSafe(db, 'DELETE FROM todos WHERE project_id = ?', [id]);
          runSafe(db, 'DELETE FROM projects WHERE id = ?', [id]);
        });
      },
      async ensureInbox() {
        const existing = db.getFirstSync<ProjectRow>(
          "SELECT * FROM projects WHERE kind = 'inbox' LIMIT 1",
        );
        if (existing) return toProject(existing);
        const now = nowIso();
        const id = uuid();
        runSafe(
          db,
          `INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at)
           VALUES (?, '收集箱', 'inbox', NULL, ?, ?, ?)`,
          [id, nextProjectRank(), now, now],
        );
        return toProject(db.getFirstSync<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id])!);
      },
    },

    settings: {
      async get(key) {
        const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
          key,
        ]);
        return row?.value ?? null;
      },
      async set(key, value) {
        runSafe(
          db,
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, value],
        );
      },
      async setBulk(entries) {
        db.withTransactionSync(() => {
          for (const kv of entries) {
            runSafe(
              db,
              'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
              [kv.key, kv.value],
            );
          }
        });
      },
      async all() {
        return db.getAllSync<SettingsKv>('SELECT key, value FROM settings ORDER BY key');
      },
      async byPrefix(prefix) {
        const all = await this.all();
        return all.filter((kv) => kv.key.startsWith(prefix));
      },
      async delete(key) {
        runSafe(db, 'DELETE FROM settings WHERE key = ?', [key]);
      },
    },
  };
}
