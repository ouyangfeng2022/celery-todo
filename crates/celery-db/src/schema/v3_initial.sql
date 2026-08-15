-- v3 初始 schema（schema_migrations 版本 1）
--
-- 与 2.x 的差异（3.0 计划约定）：
-- - deleted_todos → archived_todos：删除=归档为历史记录，永久删除仅由用户在历史页触发；
--   不再有 30 天 expires_at 自动清除。
-- - sort_order → rank（REAL 稀疏排序值，手动拖拽时取中点，不再整表重编号）。
-- - settings 只存应用设置（主题/视图/模板/每项目排序偏好），不存 DB 版本。
-- - todos_fts：FTS5 外部内容表 + 触发器同步，trigram 分词器支持子串匹配
--   （含 CJK；<3 字符的词由仓储层回退 LIKE）。

CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('user', 'inbox', 'weekly')),
    color       TEXT,
    rank        REAL NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    archived_at TEXT
);

CREATE INDEX idx_projects_rank ON projects (rank);
CREATE INDEX idx_projects_kind  ON projects (kind);

CREATE TABLE todos (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    completed    INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority     TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    planned_date TEXT,
    pinned       INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    rank         REAL NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT
);

-- 首屏列表 / 分页游标所需的覆盖顺序
CREATE INDEX idx_todos_project_created ON todos (project_id, created_at DESC);
CREATE INDEX idx_todos_project_rank    ON todos (project_id, rank);
CREATE INDEX idx_todos_planned_date   ON todos (planned_date);
CREATE INDEX idx_todos_completed      ON todos (completed);

CREATE TABLE archived_todos (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    completed    INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority     TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
    planned_date TEXT,
    pinned       INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    rank         REAL NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    completed_at TEXT,
    archived_at  TEXT NOT NULL,
    -- 归档时所属项目名快照：项目先于事项被删除后，历史记录仍可读
    project_name TEXT
);

CREATE INDEX idx_archived_archived_at ON archived_todos (archived_at DESC);
CREATE INDEX idx_archived_project     ON archived_todos (project_id);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- FTS5 全文索引（外部内容表，随 todos 触发器同步）
CREATE VIRTUAL TABLE todos_fts USING fts5(
    title,
    description,
    content = 'todos',
    content_rowid = 'rowid',
    tokenize = 'trigram'
);

CREATE TRIGGER todos_fts_insert AFTER INSERT ON todos BEGIN
    INSERT INTO todos_fts (rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;

CREATE TRIGGER todos_fts_delete AFTER DELETE ON todos BEGIN
    INSERT INTO todos_fts (todos_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
END;

CREATE TRIGGER todos_fts_update AFTER UPDATE OF title, description ON todos BEGIN
    INSERT INTO todos_fts (todos_fts, rowid, title, description)
    VALUES ('delete', old.rowid, old.title, old.description);
    INSERT INTO todos_fts (rowid, title, description)
    VALUES (new.rowid, new.title, new.description);
END;
