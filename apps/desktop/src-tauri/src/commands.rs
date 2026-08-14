//! Tauri 命令层：薄封装 celery-db 仓储方法。
//!
//! 命令签名与 @celery/data 的 Repository 接口一一对应；
//! 参数/返回值全部走 DTO（serde + ts-rs 生成的 TS 类型），无松散 JSON。
//! 错误统一映射为可序列化的 ErrorPayload（renderer 侧转 RepositoryError）。

use celery_db::dto::*;
use celery_db::{CeleryDb, CeleryDbError};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub kind: &'static str,
    pub message: String,
}

impl From<CeleryDbError> for ErrorPayload {
    fn from(e: CeleryDbError) -> Self {
        let kind = match &e {
            CeleryDbError::NotFound(_) => "not-found",
            CeleryDbError::Invalid(_) => "invalid",
            CeleryDbError::BadCursor(_) => "bad-cursor",
            _ => "db",
        };
        ErrorPayload {
            kind,
            message: e.to_string(),
        }
    }
}

type CmdResult<T> = Result<T, ErrorPayload>;

// ---------- 事项 ----------

#[tauri::command]
pub fn todo_page(db: State<CeleryDb>, query: TodoQuery) -> CmdResult<TodoPage> {
    db.todo_page(&query).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn todo_counts(db: State<CeleryDb>, project_id: Option<String>) -> CmdResult<TodoCounts> {
    db.todo_counts(project_id.as_deref()).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn get_todo(db: State<CeleryDb>, id: String) -> CmdResult<Option<TodoDto>> {
    match db.get_todo(&id) {
        Ok(t) => Ok(Some(t)),
        Err(CeleryDbError::NotFound(_)) => Ok(None),
        Err(e) => Err(ErrorPayload::from(e)),
    }
}

#[tauri::command]
pub fn create_todo(db: State<CeleryDb>, new_todo: NewTodo) -> CmdResult<TodoDto> {
    db.create_todo(new_todo).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn create_todos_bulk(db: State<CeleryDb>, items: Vec<NewTodo>) -> CmdResult<u64> {
    db.create_todos_bulk(items).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn update_todo(db: State<CeleryDb>, id: String, patch: TodoPatch) -> CmdResult<TodoDto> {
    db.update_todo(&id, &patch).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn batch_update_todos(db: State<CeleryDb>, payload: BatchTodoPatch) -> CmdResult<u64> {
    db.batch_update_todos(&payload).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn move_todos(db: State<CeleryDb>, payload: MoveTodos) -> CmdResult<u64> {
    db.move_todos(&payload).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn reorder_todos(db: State<CeleryDb>, payload: ReorderTodos) -> CmdResult<u64> {
    db.reorder_todos(&payload).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn archive_todos(db: State<CeleryDb>, ids: Vec<String>) -> CmdResult<u64> {
    db.archive_todos(&ids).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn archived_page(db: State<CeleryDb>, query: ArchivedQuery) -> CmdResult<ArchivedTodoPage> {
    db.archived_page(&query).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn restore_archived(
    db: State<CeleryDb>,
    ids: Vec<String>,
    fallback_project_id: Option<String>,
) -> CmdResult<u64> {
    db.restore_archived(&ids, fallback_project_id.as_deref())
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn purge_archived(db: State<CeleryDb>, ids: Vec<String>) -> CmdResult<u64> {
    db.purge_archived(&ids).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn purge_all_archived(db: State<CeleryDb>) -> CmdResult<u64> {
    db.purge_all_archived().map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn search_todos(db: State<CeleryDb>, query: SearchQuery) -> CmdResult<TodoPage> {
    db.search_todos(&query).map_err(ErrorPayload::from)
}

// ---------- 项目 ----------

#[tauri::command]
pub fn list_projects(db: State<CeleryDb>, include_archived: bool) -> CmdResult<Vec<ProjectDto>> {
    db.list_projects(include_archived).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn get_project(db: State<CeleryDb>, id: String) -> CmdResult<Option<ProjectDto>> {
    match db.get_project(&id) {
        Ok(p) => Ok(Some(p)),
        Err(CeleryDbError::NotFound(_)) => Ok(None),
        Err(e) => Err(ErrorPayload::from(e)),
    }
}

#[tauri::command]
pub fn create_project(db: State<CeleryDb>, new_project: NewProject) -> CmdResult<ProjectDto> {
    db.create_project(new_project).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn update_project(db: State<CeleryDb>, id: String, patch: ProjectPatch) -> CmdResult<ProjectDto> {
    db.update_project(&id, &patch).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn reorder_projects(db: State<CeleryDb>, payload: ReorderProjects) -> CmdResult<u64> {
    db.reorder_projects(&payload.ordered_ids).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn delete_project_permanently(db: State<CeleryDb>, id: String) -> CmdResult<()> {
    db.delete_project_permanently(&id).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn ensure_inbox(db: State<CeleryDb>) -> CmdResult<ProjectDto> {
    db.ensure_inbox().map_err(ErrorPayload::from)
}

// ---------- 设置 ----------

#[tauri::command]
pub fn get_setting(db: State<CeleryDb>, key: String) -> CmdResult<Option<String>> {
    db.get_setting(&key).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn set_setting(db: State<CeleryDb>, key: String, value: String) -> CmdResult<()> {
    db.set_setting(&key, &value).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn set_settings_bulk(db: State<CeleryDb>, entries: Vec<SettingsKv>) -> CmdResult<()> {
    db.set_settings_bulk(&entries).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn all_settings(db: State<CeleryDb>) -> CmdResult<Vec<SettingsKv>> {
    db.all_settings().map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn settings_by_prefix(db: State<CeleryDb>, prefix: String) -> CmdResult<Vec<SettingsKv>> {
    db.settings_by_prefix(&prefix).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn delete_setting(db: State<CeleryDb>, key: String) -> CmdResult<()> {
    db.delete_setting(&key).map_err(ErrorPayload::from)
}
