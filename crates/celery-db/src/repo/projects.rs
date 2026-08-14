//! 项目仓储：CRUD、收集箱、排序、归档与级联删除保护。

use rusqlite::{params, OptionalExtension};

use super::dto::*;
use super::{CeleryDb, RANK_GAP};
use crate::clock::now_iso;
use crate::error::{CeleryDbError, Result};

fn kind_str(k: ProjectKind) -> &'static str {
    match k {
        ProjectKind::User => "user",
        ProjectKind::Inbox => "inbox",
        ProjectKind::Weekly => "weekly",
    }
}

fn parse_kind(s: &str) -> rusqlite::Result<ProjectKind> {
    match s {
        "user" => Ok(ProjectKind::User),
        "inbox" => Ok(ProjectKind::Inbox),
        "weekly" => Ok(ProjectKind::Weekly),
        _ => Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            format!("未知项目类型: {s}").into(),
        )),
    }
}

fn project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectDto> {
    let kind = parse_kind(&row.get::<_, String>("kind")?)?;
    Ok(ProjectDto {
        id: row.get("id")?,
        name: row.get("name")?,
        kind,
        color: row.get("color")?,
        rank: row.get("rank")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
    })
}

impl CeleryDb {
    /// 项目列表（rank 升序）。默认排除已归档项目。
    pub fn list_projects(&self, include_archived: bool) -> Result<Vec<ProjectDto>> {
        let conn = self.lock_conn()?;
        let sql = if include_archived {
            "SELECT * FROM projects ORDER BY rank ASC, id ASC"
        } else {
            "SELECT * FROM projects WHERE archived_at IS NULL ORDER BY rank ASC, id ASC"
        };
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt
            .query_map([], project_from_row)?
            .collect::<rusqlite::Result<_>>()?;
        Ok(rows)
    }

    pub fn get_project(&self, id: &str) -> Result<ProjectDto> {
        let conn = self.lock_conn()?;
        conn.query_row("SELECT * FROM projects WHERE id = ?1", params![id], project_from_row)
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    CeleryDbError::NotFound(format!("项目 {id} 不存在"))
                }
                other => CeleryDbError::Db(other),
            })
    }

    pub fn create_project(&self, new: NewProject) -> Result<ProjectDto> {
        let name = new.name.trim().to_string();
        if name.is_empty() {
            return Err(CeleryDbError::Invalid("项目名不能为空".into()));
        }
        if new.kind == ProjectKind::Inbox {
            return Err(CeleryDbError::Invalid(
                "收集箱只能由 ensure_inbox 创建，且全局唯一".into(),
            ));
        }
        let now = now_iso();
        {
            let conn = self.lock_conn()?;
            let rank = match new.rank {
                Some(r) => r,
                None => next_rank(&conn)?,
            };
            conn.execute(
                "INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                params![new.id, name, kind_str(new.kind), new.color, rank, now],
            )
            .map_err(|e| CeleryDbError::Invalid(format!("创建项目失败: {e}")))?;
        }
        self.get_project(&new.id)
    }

    pub fn update_project(&self, id: &str, patch: &ProjectPatch) -> Result<ProjectDto> {
        let now = now_iso();
        {
            let conn = self.lock_conn()?;
            if let Some(name) = &patch.name {
                let n = name.trim();
                if n.is_empty() {
                    return Err(CeleryDbError::Invalid("项目名不能为空".into()));
                }
                conn.execute(
                    "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
                    params![n, now, id],
                )
                .map_err(|e| CeleryDbError::Invalid(format!("更新项目失败: {e}")))?;
            }
            match &patch.color {
                Some(None) => {
                    conn.execute(
                        "UPDATE projects SET color = NULL, updated_at = ?1 WHERE id = ?2",
                        params![now, id],
                    )?;
                }
                Some(Some(c)) => {
                    conn.execute(
                        "UPDATE projects SET color = ?1, updated_at = ?2 WHERE id = ?3",
                        params![c, now, id],
                    )?;
                }
                None => {}
            }
            if let Some(archived) = patch.archived {
                let stamp: Option<String> = if archived { Some(now_iso()) } else { None };
                conn.execute(
                    "UPDATE projects SET archived_at = ?1, updated_at = ?2 WHERE id = ?3",
                    params![stamp, now, id],
                )?;
            }
        }
        self.get_project(id)
    }

    /// 手动排序：按给定顺序重编稀疏 rank。
    pub fn reorder_projects(&self, ordered_ids: &[String]) -> Result<u64> {
        let conn = self.lock_conn()?;
        let now = now_iso();
        let mut n = 0u64;
        for (i, id) in ordered_ids.iter().enumerate() {
            n += conn.execute(
                "UPDATE projects SET rank = ?1, updated_at = ?2 WHERE id = ?3",
                params![i as f64 * RANK_GAP, now, id],
            )? as u64;
        }
        Ok(n)
    }

    /// 永久删除项目：先将其活跃 todo 归档（快照项目名），
    /// 再删除项目行（外键级联清理残留）。
    pub fn delete_project_permanently(&self, id: &str) -> Result<()> {
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
                params![id],
                |r| r.get(0),
            )?;
        if !exists {
            return Err(CeleryDbError::NotFound(format!("项目 {id} 不存在")));
        }
        tx.execute(
            "INSERT INTO archived_todos \
             (id, project_id, title, description, completed, priority, planned_date, \
              pinned, rank, created_at, updated_at, completed_at, archived_at, project_name) \
             SELECT t.id, t.project_id, t.title, t.description, t.completed, t.priority, \
                    t.planned_date, t.pinned, t.rank, t.created_at, t.updated_at, \
                    t.completed_at, ?1, (SELECT p.name FROM projects p WHERE p.id = ?2) \
             FROM todos t WHERE t.project_id = ?2",
            params![now, id],
        )?;
        tx.execute("DELETE FROM todos WHERE project_id = ?1", params![id])?;
        tx.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        tx.commit()?;
        Ok(())
    }

    /// 确保全局唯一的收集箱存在（首次启动 / 数据导入后调用）。
    pub fn ensure_inbox(&self) -> Result<ProjectDto> {
        {
            let conn = self.lock_conn()?;
            let existing: Option<ProjectDto> = conn
                .query_row(
                    "SELECT * FROM projects WHERE kind = 'inbox' LIMIT 1",
                    [],
                    project_from_row,
                )
                .optional()?;
            if let Some(p) = existing {
                return Ok(p);
            }
            let now = now_iso();
            let rank = next_rank(&conn)?;
            conn.execute(
                "INSERT INTO projects (id, name, kind, color, rank, created_at, updated_at) \
                 VALUES (?1, '收集箱', 'inbox', NULL, ?2, ?3, ?3)",
                params![uuid::Uuid::new_v4().to_string(), rank, now],
            )?;
        }
        self.ensure_inbox()
    }
}

fn next_rank(conn: &rusqlite::Connection) -> Result<f64> {
    // 空表时 MAX 返回 NULL（但恒有一行），映射为 Option<f64>
    let max: Option<f64> = conn
        .query_row("SELECT MAX(rank) FROM projects", [], |r| r.get(0))?;
    Ok(max.map(|m| m + RANK_GAP).unwrap_or(0.0))
}
