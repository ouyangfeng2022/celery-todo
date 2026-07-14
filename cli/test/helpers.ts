/**
 * @file 测试夹具：构造一个已初始化（含 App schema + 种子数据）的临时 SQLite 文件
 * @description 用 better-sqlite3 直接执行 App 的建表 SQL（与 src/utils/database.ts
 *              createTables 同源），写入默认 dataVersion，供 db 层与命令测试消费。
 */

import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** 与 src/utils/database.ts createTables 完全一致的 schema */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
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
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  todo_id TEXT,
  created_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
`;

export interface SeedFixture {
  /** 临时 DB 文件绝对路径 */
  filePath: string;
  /** 种子用的 project id（测试用） */
  projectId: string;
  /** 清理：删除临时文件 */
  cleanup(): void;
}

/**
 * 创建带 schema 的临时 DB，可选写入一个默认项目 + dataVersion=2。
 */
export function createSeedDb(opts: { withProject?: boolean } = {}): SeedFixture {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'celery-cli-test-'));
  const filePath = path.join(tmpDir, 'celery-todo.db');
  const db = new Database(filePath);
  db.exec(SCHEMA_SQL);
  db.prepare("INSERT INTO settings (key, value) VALUES ('dataVersion', '2')").run();
  let projectId = 'default-project-id';
  if (opts.withProject !== false) {
    projectId = '11111111-1111-1111-1111-111111111111';
    const now = new Date('2026-01-01T00:00:00Z').toISOString();
    db.prepare(
      `INSERT INTO projects (id, name, color, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(projectId, '默认项目', 'blue', now, now, 0);
  }
  db.close();
  return {
    filePath,
    projectId,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // 忽略
      }
    },
  };
}

/**
 * 直接用 better-sqlite3 读取行（测试断言用，绕过 CLI 的连接）。
 */
export function readAllRows<T = Record<string, unknown>>(filePath: string, table: string): T[] {
  const db = new Database(filePath, { readonly: true });
  const rows = db.prepare(`SELECT * FROM ${table}`).all() as T[];
  db.close();
  return rows;
}
