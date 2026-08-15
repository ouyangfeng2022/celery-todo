//! 全量替换：v2 JSON 全量导入 / 恢复备份。清空四表后在单事务中整体写入。

use super::dto::*;
use super::CeleryDb;
use crate::error::{CeleryDbError, Result};

fn todo_values(t: &ReplaceTodo) -> Vec<rusqlite::types::Value> {
    use rusqlite::types::Value as V;
    vec![
        V::Text(t.id.clone()),
        V::Text(t.project_id.clone()),
        V::Text(t.title.trim().to_string()),
        t.description.clone().map(V::Text).unwrap_or(V::Null),
        V::Integer(t.completed as i64),
        V::Text(priority_str(t.priority).into()),
        t.planned_date.clone().map(V::Text).unwrap_or(V::Null),
        V::Integer(t.pinned as i64),
        V::Real(t.rank),
        V::Text(t.created_at.clone()),
        V::Text(t.updated_at.clone()),
        t.completed_at.clone().map(V::Text).unwrap_or(V::Null),
    ]
}

fn archived_values(a: &ReplaceArchivedTodo) -> Vec<rusqlite::types::Value> {
    use rusqlite::types::Value as V;
    vec![
        V::Text(a.id.clone()),
        V::Text(a.project_id.clone()),
        V::Text(a.title.trim().to_string()),
        a.description.clone().map(V::Text).unwrap_or(V::Null),
        V::Integer(a.completed as i64),
        V::Text(priority_str(a.priority).into()),
        a.planned_date.clone().map(V::Text).unwrap_or(V::Null),
        V::Integer(a.pinned as i64),
        V::Real(a.rank),
        V::Text(a.created_at.clone()),
        V::Text(a.updated_at.clone()),
        a.completed_at.clone().map(V::Text).unwrap_or(V::Null),
        V::Text(a.archived_at.clone()),
        a.project_name.clone().map(V::Text).unwrap_or(V::Null),
    ]
}

fn priority_str(p: TodoPriority) -> &'static str {
    match p {
        TodoPriority::High => "high",
        TodoPriority::Medium => "medium",
        TodoPriority::Low => "low",
    }
}

fn kind_str(k: ProjectKind) -> &'static str {
    match k {
        ProjectKind::User => "user",
        ProjectKind::Inbox => "inbox",
        ProjectKind::Weekly => "weekly",
    }
}

impl CeleryDb {
    /// 单事务全量替换：清空 todos / archived_todos / projects / settings 后整体写入。
    /// 任一行失败整体回滚，数据库保持替换前状态。
    ///
    /// 载荷来自 2.x JSON 导入（parseImportData 校验后），行内 id / 时间戳 /
    /// rank（= 2.x sort_order）按原值保留；空载荷等价于恢复出厂（reset）。
    pub fn replace_all(&self, payload: &ReplaceAllPayload) -> Result<()> {
        // 先在事务外校验，避免清空后才发现载荷非法。
        for p in &payload.projects {
            if p.name.trim().is_empty() {
                return Err(CeleryDbError::Invalid(format!("项目名不能为空: {}", p.id)));
            }
        }
        for t in &payload.todos {
            if t.title.trim().is_empty() {
                return Err(CeleryDbError::Invalid(format!("标题不能为空: {}", t.id)));
            }
        }
        for t in &payload.archived_todos {
            if t.title.trim().is_empty() {
                return Err(CeleryDbError::Invalid(format!("标题不能为空: {}", t.id)));
            }
        }

        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        tx.execute("DELETE FROM todos", [])?;
        tx.execute("DELETE FROM archived_todos", [])?;
        tx.execute("DELETE FROM projects", [])?;
        tx.execute("DELETE FROM settings", [])?;

        for p in &payload.projects {
            let moved = tx.execute(
                "INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at, archived_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)",
                rusqlite::params![
                    p.id,
                    p.name.trim(),
                    kind_str(p.kind),
                    p.color,
                    p.rank,
                    p.created_at,
                    p.updated_at
                ],
            )?;
            if moved == 0 {
                return Err(CeleryDbError::Invalid(format!("项目写入失败: {}", p.id)));
            }
        }
        for t in &payload.todos {
            tx.execute(
                "INSERT INTO todos (id, project_id, title, description, completed, priority, \
                 planned_date, pinned, rank, created_at, updated_at, completed_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                rusqlite::params_from_iter(todo_values(t)),
            )
            .map_err(|e| CeleryDbError::Invalid(format!("写入 todo 失败: {e}")))?;
        }
        for a in &payload.archived_todos {
            tx.execute(
                "INSERT INTO archived_todos (id, project_id, title, description, completed, priority, \
                 planned_date, pinned, rank, created_at, updated_at, completed_at, archived_at, project_name) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                rusqlite::params_from_iter(archived_values(a)),
            )
            .map_err(|e| CeleryDbError::Invalid(format!("写入归档事项失败: {e}")))?;
        }
        for kv in &payload.settings {
            tx.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![kv.key, kv.value],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// 恢复出厂：清空所有业务数据（等价于空载荷 replace_all）。
    pub fn reset(&self) -> Result<()> {
        self.replace_all(&ReplaceAllPayload {
            projects: Vec::new(),
            todos: Vec::new(),
            archived_todos: Vec::new(),
            settings: Vec::new(),
        })
    }
}
