//! Todo 仓储：分页查询、搜索、批量写、移动、稀疏排序、归档/恢复/永久删除。

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter};

use super::dto::*;
use super::CeleryDb;
use crate::clock::now_iso;
use crate::cursor::{self, CursorPayload};
use crate::error::{CeleryDbError, Result};

// ============================================
// 行映射
// ============================================

fn parse_priority(s: &str) -> rusqlite::Result<TodoPriority> {
    match s {
        "high" => Ok(TodoPriority::High),
        "medium" => Ok(TodoPriority::Medium),
        "low" => Ok(TodoPriority::Low),
        _ => Err(rusqlite::Error::FromSqlConversionFailure(
            0,
            rusqlite::types::Type::Text,
            format!("未知优先级: {s}").into(),
        )),
    }
}

fn priority_str(p: TodoPriority) -> &'static str {
    match p {
        TodoPriority::High => "high",
        TodoPriority::Medium => "medium",
        TodoPriority::Low => "low",
    }
}

fn todo_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TodoDto> {
    let priority = parse_priority(&row.get::<_, String>("priority")?)?;
    Ok(TodoDto {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        completed: row.get::<_, i64>("completed")? != 0,
        priority,
        planned_date: row.get("planned_date")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        rank: row.get("rank")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
    })
}

fn archived_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ArchivedTodoDto> {
    let priority = parse_priority(&row.get::<_, String>("priority")?)?;
    Ok(ArchivedTodoDto {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        description: row.get("description")?,
        completed: row.get::<_, i64>("completed")? != 0,
        priority,
        planned_date: row.get("planned_date")?,
        pinned: row.get::<_, i64>("pinned")? != 0,
        rank: row.get("rank")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        completed_at: row.get("completed_at")?,
        archived_at: row.get("archived_at")?,
        project_name: row.get("project_name")?,
    })
}

// ============================================
// 查询构造
// ============================================

fn clamp_limit(limit: u32) -> usize {
    limit.clamp(1, MAX_PAGE_LIMIT) as usize
}

fn cursor_sort_str(sort: TodoSort) -> &'static str {
    match sort {
        TodoSort::CreatedDesc => "created-desc",
        TodoSort::Priority => "priority",
        TodoSort::Manual => "manual",
    }
}

/// 优先级排序权重（high > medium > low，与 @celery/core 的 sortTodos 一致）
const PRIORITY_WEIGHT_SQL: &str =
    "CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END";

fn priority_weight(p: TodoPriority) -> i64 {
    match p {
        TodoPriority::High => 3,
        TodoPriority::Medium => 2,
        TodoPriority::Low => 1,
    }
}

/// WHERE 片段（不含游标）+ 绑定值。
fn base_conditions(query: &TodoQuery) -> (Vec<String>, Vec<SqlValue>) {
    let mut wheres = Vec::new();
    let mut vals = Vec::new();
    if let Some(pid) = &query.project_id {
        wheres.push("t.project_id = ?".into());
        vals.push(SqlValue::Text(pid.clone()));
    }
    match query.filter {
        TodoFilter::All => {}
        TodoFilter::Active => wheres.push("t.completed = 0".into()),
        TodoFilter::Completed => wheres.push("t.completed = 1".into()),
    }
    if let Some(p) = query.priority {
        wheres.push("t.priority = ?".into());
        vals.push(SqlValue::Text(priority_str(p).into()));
    }
    if let Some(from) = &query.planned_from {
        wheres.push("t.planned_date >= ?".into());
        vals.push(SqlValue::Text(from.clone()));
    }
    if let Some(to) = &query.planned_to {
        wheres.push("t.planned_date <= ?".into());
        vals.push(SqlValue::Text(to.clone()));
    }
    (wheres, vals)
}

/// 游标续页条件。置顶恒居顶（pinned DESC 是所有排序的第一键），
/// 故 keyset 元组为 (pinned, <排序键...>)，按 ASC/DESC 逐键展开。
fn cursor_condition(sort: TodoSort, cur: &CursorPayload, vals: &mut Vec<SqlValue>) -> Option<String> {
    let keys = &cur.keys;
    let pin = keys.first()?.clone();
    match sort {
        TodoSort::CreatedDesc => {
            // (pinned DESC, created_at DESC, id DESC) → 元组严格"更小"
            let (c, i) = (keys.get(1)?.clone(), keys.get(2)?.clone());
            vals.extend([
                SqlValue::Text(pin.clone()),
                SqlValue::Text(pin),
                SqlValue::Text(c.clone()),
                SqlValue::Text(c),
                SqlValue::Text(i),
            ]);
            Some("(t.pinned < ? OR (t.pinned = ? AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))))".into())
        }
        TodoSort::Priority => {
            let (w, c, i) = (
                keys.get(1)?.clone(),
                keys.get(2)?.clone(),
                keys.get(3)?.clone(),
            );
            let w: i64 = w.parse().ok()?;
            vals.extend([
                SqlValue::Text(pin.clone()),
                SqlValue::Text(pin),
                SqlValue::Integer(w),
                SqlValue::Integer(w),
                SqlValue::Text(c.clone()),
                SqlValue::Text(c),
                SqlValue::Text(i),
            ]);
            Some(format!(
                "(t.pinned < ? OR (t.pinned = ? AND ({PRIORITY_WEIGHT_SQL} < ? OR \
                 ({PRIORITY_WEIGHT_SQL} = ? AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))))))"
            ))
        }
        TodoSort::Manual => {
            // (pinned DESC, rank ASC, id ASC) → 元组严格"更大"
            let (r, i) = (keys.get(1)?.clone(), keys.get(2)?.clone());
            let r: f64 = r.parse().ok()?;
            vals.extend([
                SqlValue::Text(pin.clone()),
                SqlValue::Text(pin),
                SqlValue::Real(r),
                SqlValue::Real(r),
                SqlValue::Text(i),
            ]);
            Some("(t.pinned < ? OR (t.pinned = ? AND (t.rank > ? OR (t.rank = ? AND t.id > ?))))".into())
        }
    }
}

fn order_clause(sort: TodoSort) -> &'static str {
    match sort {
        TodoSort::CreatedDesc => "t.pinned DESC, t.created_at DESC, t.id DESC",
        TodoSort::Priority => {
            "t.pinned DESC, CASE t.priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, t.created_at DESC, t.id DESC"
        }
        TodoSort::Manual => "t.pinned DESC, t.rank ASC, t.id ASC",
    }
}

fn todo_cursor(sort: TodoSort, t: &TodoDto) -> Option<String> {
    let keys = match sort {
        TodoSort::CreatedDesc => vec![
            (t.pinned as i8).to_string(),
            t.created_at.clone(),
            t.id.clone(),
        ],
        TodoSort::Priority => vec![
            (t.pinned as i8).to_string(),
            priority_weight(t.priority).to_string(),
            t.created_at.clone(),
            t.id.clone(),
        ],
        TodoSort::Manual => vec![
            (t.pinned as i8).to_string(),
            format!("{:?}", t.rank),
            t.id.clone(),
        ],
    };
    cursor::encode(&CursorPayload {
        sort: cursor_sort_str(sort).into(),
        keys,
    })
    .ok()
}

// ============================================
// CeleryDb impl
// ============================================

impl CeleryDb {
    // ---------- 读取 ----------

    /// 分页查询 todo 列表（首屏只取首页 + todo_counts 聚合，不整库加载）。
    pub fn todo_page(&self, query: &TodoQuery) -> Result<TodoPage> {
        let conn = self.lock_conn()?;
        let sort = query.sort;
        let (mut wheres, mut vals) = base_conditions(query);
        if let Some(cur_str) = &query.cursor {
            let cur = cursor::decode(cursor_sort_str(sort), cur_str)?;
            if let Some(cond) = cursor_condition(sort, &cur, &mut vals) {
                wheres.push(cond);
            }
        }
        let where_sql = if wheres.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", wheres.join(" AND "))
        };
        let limit = clamp_limit(query.limit);
        let sql = format!(
            "SELECT t.* FROM todos t {where_sql} ORDER BY {} LIMIT {}",
            order_clause(sort),
            limit + 1
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<TodoDto> = stmt
            .query_map(params_from_iter(vals.iter()), todo_from_row)?
            .collect::<rusqlite::Result<_>>()?;
        let page = finalize_page(rows, limit, |t| todo_cursor(sort, t));
        Ok(TodoPage {
            items: page.items,
            next_cursor: page.next_cursor,
        })
    }

    pub fn get_todo(&self, id: &str) -> Result<TodoDto> {
        let conn = self.lock_conn()?;
        conn.query_row("SELECT t.* FROM todos t WHERE t.id = ?1", params![id], todo_from_row)
            .map_err(|e| map_missing(e, format!("todo {id}")))
    }

    /// 聚合计数（首屏一次查询，替代整库 COUNT 列表）。
    pub fn todo_counts(&self, project_id: Option<&str>) -> Result<TodoCounts> {
        let conn = self.lock_conn()?;
        let (sql, val): (&str, Option<String>) = match project_id {
            Some(pid) => (
                "SELECT COUNT(*), COALESCE(SUM(completed), 0) FROM todos WHERE project_id = ?1",
                Some(pid.to_string()),
            ),
            None => (
                "SELECT COUNT(*), COALESCE(SUM(completed), 0) FROM todos",
                None,
            ),
        };
        let (total, completed): (i64, i64) = conn.query_row(
            sql,
            params_from_iter([val].into_iter().flatten()),
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok(TodoCounts {
            total: total as u64,
            completed: completed as u64,
            active: (total - completed) as u64,
        })
    }

    /// 全局搜索。trigram FTS5 支持子串匹配（含 CJK）；
    /// <3 字符（trigram 下限）回退 LIKE。
    pub fn search_todos(&self, query: &SearchQuery) -> Result<TodoPage> {
        let term = query.term.trim();
        if term.is_empty() {
            return Err(CeleryDbError::Invalid("搜索词不能为空".into()));
        }
        let conn = self.lock_conn()?;
        let mut wheres: Vec<String> = Vec::new();
        let mut vals: Vec<SqlValue> = Vec::new();

        let use_fts = term.chars().count() >= 3;
        if use_fts {
            wheres.push("todos_fts MATCH ?".into());
            let quoted = format!("\"{}\"", term.replace('"', "\"\""));
            vals.push(SqlValue::Text(quoted));
        } else {
            let pat = format!("%{}%", like_escape(term));
            wheres.push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\')".into());
            vals.push(SqlValue::Text(pat.clone()));
            vals.push(SqlValue::Text(pat));
        }
        if let Some(pid) = &query.project_id {
            wheres.push("t.project_id = ?".into());
            vals.push(SqlValue::Text(pid.clone()));
        }
        if let Some(c) = query.completed {
            wheres.push(if c { "t.completed = 1".into() } else { "t.completed = 0".into() });
        }
        if let Some(cur_str) = &query.cursor {
            let cur = cursor::decode("search", cur_str)?;
            if let Some(cond) = search_cursor_condition(&cur, &mut vals) {
                wheres.push(cond);
            }
        }
        let limit = clamp_limit(query.limit);
        let join = if use_fts {
            "JOIN todos_fts ON todos_fts.rowid = t.rowid"
        } else {
            ""
        };
        let sql = format!(
            "SELECT t.* FROM todos t {join} WHERE {} \
             ORDER BY t.pinned DESC, t.created_at DESC, t.id DESC LIMIT {}",
            wheres.join(" AND "),
            limit + 1
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<TodoDto> = stmt
            .query_map(params_from_iter(vals.iter()), todo_from_row)?
            .collect::<rusqlite::Result<_>>()?;
        let page = finalize_page(rows, limit, |t| {
            cursor::encode(&CursorPayload {
                sort: "search".into(),
                keys: vec![
                    (t.pinned as i8).to_string(),
                    t.created_at.clone(),
                    t.id.clone(),
                ],
            })
            .ok()
        });
        Ok(TodoPage {
            items: page.items,
            next_cursor: page.next_cursor,
        })
    }

    // ---------- 写入 ----------

    pub fn create_todo(&self, new: NewTodo) -> Result<TodoDto> {
        let title = new.title.trim().to_string();
        if title.is_empty() {
            return Err(CeleryDbError::Invalid("标题不能为空".into()));
        }
        let now = now_iso();
        {
            let conn = self.lock_conn()?;
            ensure_project(&conn, &new.project_id)?;
            conn.execute(
                "INSERT INTO todos (id, project_id, title, description, completed, priority, \
                 planned_date, pinned, rank, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![
                    new.id,
                    new.project_id,
                    title,
                    new.description,
                    priority_str(new.priority),
                    new.planned_date,
                    new.pinned as i64,
                    new.rank,
                    now
                ],
            )
            .map_err(|e| CeleryDbError::Invalid(format!("创建 todo 失败: {e}")))?;
        }
        self.get_todo(&new.id)
    }

    /// 批量创建：单事务，任一条失败整体回滚（契约测试覆盖）。
    pub fn create_todos_bulk(&self, items: Vec<NewTodo>) -> Result<u64> {
        if items.is_empty() {
            return Ok(0);
        }
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let mut n = 0u64;
        for new in &items {
            let title = new.title.trim();
            if title.is_empty() {
                return Err(CeleryDbError::Invalid("标题不能为空".into()));
            }
            tx.execute(
                "INSERT INTO todos (id, project_id, title, description, completed, priority, \
                 planned_date, pinned, rank, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?9)",
                params![
                    new.id,
                    new.project_id,
                    title,
                    new.description,
                    priority_str(new.priority),
                    new.planned_date,
                    new.pinned as i64,
                    new.rank,
                    now
                ],
            )
            .map_err(|e| CeleryDbError::Invalid(format!("批量创建失败: {e}")))?;
            n += 1;
        }
        tx.commit()?;
        Ok(n)
    }

    /// 应用补丁并返回更新后的实体。updated_at 恒由仓储维护。
    pub fn update_todo(&self, id: &str, patch: &TodoPatch) -> Result<TodoDto> {
        self.batch_apply_patch(&[id.to_string()], patch)?;
        self.get_todo(id)
    }

    /// 批量补丁：单事务。
    pub fn batch_update_todos(&self, payload: &BatchTodoPatch) -> Result<u64> {
        self.batch_apply_patch(&payload.ids, &payload.patch)
    }

    fn batch_apply_patch(&self, ids: &[String], patch: &TodoPatch) -> Result<u64> {
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let mut sets: Vec<String> = vec!["updated_at = ?".into()];
        let mut vals: Vec<SqlValue> = vec![SqlValue::Text(now)];
        let mut bind = |col: &str, v: SqlValue, sets: &mut Vec<String>, vals: &mut Vec<SqlValue>| {
            sets.push(format!("{col} = ?"));
            vals.push(v);
        };
        if let Some(title) = &patch.title {
            let t = title.trim();
            if t.is_empty() {
                return Err(CeleryDbError::Invalid("标题不能为空".into()));
            }
            bind("title", SqlValue::Text(t.to_string()), &mut sets, &mut vals);
        }
        match &patch.description {
            Some(None) => bind("description", SqlValue::Null, &mut sets, &mut vals),
            Some(Some(d)) => bind("description", SqlValue::Text(d.clone()), &mut sets, &mut vals),
            None => {}
        }
        if let Some(completed) = patch.completed {
            bind(
                "completed",
                SqlValue::Integer(completed as i64),
                &mut sets,
                &mut vals,
            );
            match (&patch.completed_at, completed) {
                // 显式给定完成时间（导入/恢复）
                (Some(Some(ts)), true) => {
                    bind("completed_at", SqlValue::Text(ts.clone()), &mut sets, &mut vals)
                }
                (Some(None), _) => bind("completed_at", SqlValue::Null, &mut sets, &mut vals),
                // 打开完成且未显式给定 → 现在；取消完成 → 清空
                (None, true) => bind("completed_at", SqlValue::Text(now_iso()), &mut sets, &mut vals),
                (None, false) => bind("completed_at", SqlValue::Null, &mut sets, &mut vals),
                // 取消完成却带了完成时间 —— 以 completed 为准，清空
                (Some(Some(_)), false) => bind("completed_at", SqlValue::Null, &mut sets, &mut vals),
            }
        } else if let Some(ca) = &patch.completed_at {
            match ca {
                Some(ts) => bind("completed_at", SqlValue::Text(ts.clone()), &mut sets, &mut vals),
                None => bind("completed_at", SqlValue::Null, &mut sets, &mut vals),
            }
        }
        if let Some(p) = patch.priority {
            bind(
                "priority",
                SqlValue::Text(priority_str(p).into()),
                &mut sets,
                &mut vals,
            );
        }
        match &patch.planned_date {
            Some(None) => bind("planned_date", SqlValue::Null, &mut sets, &mut vals),
            Some(Some(d)) => bind("planned_date", SqlValue::Text(d.clone()), &mut sets, &mut vals),
            None => {}
        }
        if let Some(p) = patch.pinned {
            bind("pinned", SqlValue::Integer(p as i64), &mut sets, &mut vals);
        }

        let mut n = 0u64;
        for id in ids {
            let sql = format!(
                "UPDATE todos SET {} WHERE id = ?",
                sets.join(", ")
            );
            let mut all = vals.clone();
            all.push(SqlValue::Text(id.clone()));
            n += tx
                .execute(&sql, params_from_iter(all.iter()))? as u64;
        }
        tx.commit()?;
        Ok(n)
    }

    /// 移动到目标项目（批量，单事务）。
    pub fn move_todos(&self, payload: &MoveTodos) -> Result<u64> {
        if payload.ids.is_empty() {
            return Ok(0);
        }
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        ensure_project(&tx, &payload.target_project_id)?;
        let now = now_iso();
        let mut n = 0u64;
        for id in &payload.ids {
            n += tx.execute(
                "UPDATE todos SET project_id = ?1, updated_at = ?2 WHERE id = ?3",
                params![payload.target_project_id, now, id],
            )? as u64;
        }
        tx.commit()?;
        Ok(n)
    }

    /// 手动排序：按给定顺序重编稀疏 rank（i × GAP）。
    /// 仅更新属于该项目的 id；混入他项不报错但不生效。
    pub fn reorder_todos(&self, payload: &ReorderTodos) -> Result<u64> {
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let mut n = 0u64;
        for (i, id) in payload.ordered_ids.iter().enumerate() {
            n += tx.execute(
                "UPDATE todos SET rank = ?1, updated_at = ?2 WHERE id = ?3 AND project_id = ?4",
                params![
                    i as f64 * super::RANK_GAP,
                    now,
                    id,
                    payload.project_id
                ],
            )? as u64;
        }
        tx.commit()?;
        Ok(n)
    }

    // ---------- 归档 / 恢复 / 永久删除 ----------

    /// 删除 = 归档：单事务搬入 archived_todos 并快照项目名。
    pub fn archive_todos(&self, ids: &[String]) -> Result<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let mut n = 0u64;
        for id in ids {
            let moved = tx.execute(
                "INSERT INTO archived_todos \
                 (id, project_id, title, description, completed, priority, planned_date, \
                  pinned, rank, created_at, updated_at, completed_at, archived_at, project_name) \
                 SELECT t.id, t.project_id, t.title, t.description, t.completed, t.priority, \
                        t.planned_date, t.pinned, t.rank, t.created_at, t.updated_at, \
                        t.completed_at, ?1, \
                        (SELECT p.name FROM projects p WHERE p.id = t.project_id) \
                 FROM todos t WHERE t.id = ?2",
                params![now, id],
            )? as u64;
            if moved > 0 {
                tx.execute("DELETE FROM todos WHERE id = ?1", params![id])?;
                n += moved;
            }
        }
        tx.commit()?;
        Ok(n)
    }

    /// 归档分页（按归档时间倒序；可按项目 / 子串过滤）。
    pub fn archived_page(&self, query: &ArchivedQuery) -> Result<ArchivedTodoPage> {
        let conn = self.lock_conn()?;
        let mut wheres: Vec<String> = Vec::new();
        let mut vals: Vec<SqlValue> = Vec::new();
        if let Some(pid) = &query.project_id {
            wheres.push("a.project_id = ?".into());
            vals.push(SqlValue::Text(pid.clone()));
        }
        if let Some(term) = query.term.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            let pat = format!("%{}%", like_escape(term));
            wheres.push("(a.title LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')".into());
            vals.push(SqlValue::Text(pat.clone()));
            vals.push(SqlValue::Text(pat));
        }
        if let Some(cur_str) = &query.cursor {
            let cur = cursor::decode("archived", cur_str)?;
            let at = cur
                .keys
                .first()
                .cloned()
                .ok_or_else(|| CeleryDbError::BadCursor(cur_str.clone()))?;
            let id = cur
                .keys
                .get(1)
                .cloned()
                .ok_or_else(|| CeleryDbError::BadCursor(cur_str.clone()))?;
            vals.extend([
                SqlValue::Text(at.clone()),
                SqlValue::Text(at),
                SqlValue::Text(id),
            ]);
            wheres.push(
                "(a.archived_at < ? OR (a.archived_at = ? AND a.id < ?))".into(),
            );
        }
        let limit = clamp_limit(query.limit);
        let where_sql = if wheres.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", wheres.join(" AND "))
        };
        let sql = format!(
            "SELECT a.* FROM archived_todos a {where_sql} \
             ORDER BY a.archived_at DESC, a.id DESC LIMIT {}",
            limit + 1
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows: Vec<ArchivedTodoDto> = stmt
            .query_map(params_from_iter(vals.iter()), archived_from_row)?
            .collect::<rusqlite::Result<_>>()?;
        let page = finalize_page(rows, limit, |a| {
            cursor::encode(&CursorPayload {
                sort: "archived".into(),
                keys: vec![a.archived_at.clone(), a.id.clone()],
            })
            .ok()
        });
        Ok(ArchivedTodoPage {
            items: page.items,
            next_cursor: page.next_cursor,
        })
    }

    /// 从归档恢复为活跃 todo。原项目已被删除时落到 fallback 项目；
    /// 无 fallback 则报错（不静默丢数据）。
    pub fn restore_archived(&self, ids: &[String], fallback_project_id: Option<&str>) -> Result<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let mut conn = self.lock_conn()?;
        let tx = conn.transaction()?;
        let now = now_iso();
        let mut n = 0u64;
        for id in ids {
            let row = tx.query_row(
                "SELECT project_id FROM archived_todos WHERE id = ?1",
                params![id],
                |r| r.get::<_, String>(0),
            );
            let original_project = match row {
                Ok(p) => p,
                Err(_) => continue, // 该 id 不在归档中，跳过
            };
            let project_exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
                    params![original_project],
                    |r| r.get(0),
                )
                .unwrap_or(false);
            let target = if project_exists {
                original_project
            } else if let Some(fb) = fallback_project_id {
                ensure_project(&tx, fb)?;
                fb.to_string()
            } else {
                return Err(CeleryDbError::Invalid(format!(
                    "归档事项 {id} 的原项目已不存在，且未提供恢复目标项目"
                )));
            };
            let moved = tx.execute(
                "INSERT INTO todos \
                 (id, project_id, title, description, completed, priority, planned_date, \
                  pinned, rank, created_at, updated_at, completed_at) \
                 SELECT a.id, ?1, a.title, a.description, a.completed, a.priority, \
                        a.planned_date, a.pinned, a.rank, a.created_at, ?2, a.completed_at \
                 FROM archived_todos a WHERE a.id = ?3",
                params![target, now, id],
            )? as u64;
            if moved > 0 {
                tx.execute("DELETE FROM archived_todos WHERE id = ?1", params![id])?;
                n += moved;
            }
        }
        tx.commit()?;
        Ok(n)
    }

    /// 永久删除指定归档事项（不可恢复，仅历史页用户主动触发）。
    pub fn purge_archived(&self, ids: &[String]) -> Result<u64> {
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.lock_conn()?;
        let mut n = 0u64;
        for id in ids {
            n += conn.execute("DELETE FROM archived_todos WHERE id = ?1", params![id])? as u64;
        }
        Ok(n)
    }

    /// 清空归档（历史页"清空回收站"语义）。
    pub fn purge_all_archived(&self) -> Result<u64> {
        let conn = self.lock_conn()?;
        Ok(conn.execute("DELETE FROM archived_todos", [])? as u64)
    }
}

// ============================================
// 内部工具
// ============================================

/// 取 limit+1 行判断是否还有下一页；游标取本页最后一行。
fn finalize_page<T>(rows: Vec<T>, limit: usize, make_cursor: impl Fn(&T) -> Option<String>) -> super::Page<T> {
    let has_more = rows.len() > limit;
    let mut items = rows;
    items.truncate(limit);
    let next_cursor = if has_more {
        items.last().and_then(make_cursor)
    } else {
        None
    };
    super::Page { items, next_cursor }
}

fn search_cursor_condition(cur: &CursorPayload, vals: &mut Vec<SqlValue>) -> Option<String> {
    let pin = cur.keys.first()?.clone();
    let c = cur.keys.get(1)?.clone();
    let i = cur.keys.get(2)?.clone();
    vals.extend([
        SqlValue::Text(pin.clone()),
        SqlValue::Text(pin),
        SqlValue::Text(c.clone()),
        SqlValue::Text(c),
        SqlValue::Text(i),
    ]);
    Some("(t.pinned < ? OR (t.pinned = ? AND (t.created_at < ? OR (t.created_at = ? AND t.id < ?))))".into())
}

fn ensure_project(conn: &rusqlite::Connection, id: &str) -> Result<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
        params![id],
        |r| r.get(0),
    )?;
    if !exists {
        return Err(CeleryDbError::NotFound(format!("项目 {id} 不存在")));
    }
    Ok(())
}

fn map_missing(e: rusqlite::Error, what: String) -> CeleryDbError {
    match e {
        rusqlite::Error::QueryReturnedNoRows => CeleryDbError::NotFound(what),
        other => CeleryDbError::Db(other),
    }
}

fn like_escape(term: &str) -> String {
    term.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
}
