//! Tauri 命令层：薄封装 celery-db 仓储方法。
//!
//! 命令签名与 @celery/data 的 Repository 接口一一对应；
//! 参数/返回值全部走 DTO（serde + ts-rs 生成的 TS 类型），无松散 JSON。
//! 错误统一映射为可序列化的 ErrorPayload（renderer 侧转 RepositoryError）。

use celery_db::dto::*;
use celery_db::{CeleryDb, CeleryDbError};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{Emitter, Manager, State, WebviewWindow};

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

// ============================================
// 数据变更广播
// ============================================

/// 全局单调递增的变更版本号：renderer 侧用于丢弃乱序/重复事件。
static DATA_REVISION: AtomicU64 = AtomicU64::new(0);

/// 写命令成功后的广播事件。`source` 是发起窗口的 label
/// （后续接入 CLI 后还会有 "cli"）；renderer 过滤掉自发事件。
///
/// 注意：广播发给所有窗口（含发起窗口），与 2.x 的「只发其他窗口」不同 ——
/// 过滤逻辑收敛在 renderer 一侧，Rust 无需枚举窗口。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataChangedEvent {
    pub revision: u64,
    pub source: String,
    /// 任一活跃事项变动（粗粒度；细粒度 projectIds 见下）
    pub todos_changed: bool,
    /// 精确知道受影响项目时的 id 列表（与 todos_changed 并用）
    pub project_ids: Vec<String>,
    pub projects_changed: bool,
    pub settings_changed: bool,
    pub archive_changed: bool,
    pub full_refresh: bool,
}

impl Default for DataChangedEvent {
    fn default() -> Self {
        Self {
            revision: 0,
            source: String::new(),
            todos_changed: false,
            project_ids: Vec::new(),
            projects_changed: false,
            settings_changed: false,
            archive_changed: false,
            full_refresh: false,
        }
    }
}

fn notify(window: &WebviewWindow, mut event: DataChangedEvent) {
    event.revision = DATA_REVISION.fetch_add(1, Ordering::Relaxed) + 1;
    event.source = window.label().to_string();
    // 广播失败不影响写命令本身（窗口可能正在关闭）
    let _ = window.app_handle().emit("data-changed", event);
}

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
pub fn create_todo(
    db: State<CeleryDb>,
    window: WebviewWindow,
    new_todo: NewTodo,
) -> CmdResult<TodoDto> {
    let created = db.create_todo(new_todo).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            project_ids: vec![created.project_id.clone()],
            ..Default::default()
        },
    );
    Ok(created)
}

#[tauri::command]
pub fn create_todos_bulk(
    db: State<CeleryDb>,
    window: WebviewWindow,
    items: Vec<NewTodo>,
) -> CmdResult<u64> {
    let project_ids: Vec<String> = items.iter().map(|t| t.project_id.clone()).collect();
    let n = db.create_todos_bulk(items).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            project_ids,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn update_todo(
    db: State<CeleryDb>,
    window: WebviewWindow,
    id: String,
    patch: TodoPatch,
) -> CmdResult<TodoDto> {
    let updated = db.update_todo(&id, &patch).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            project_ids: vec![updated.project_id.clone()],
            ..Default::default()
        },
    );
    Ok(updated)
}

#[tauri::command]
pub fn batch_update_todos(
    db: State<CeleryDb>,
    window: WebviewWindow,
    payload: BatchTodoPatch,
) -> CmdResult<u64> {
    let n = db
        .batch_update_todos(&payload)
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn move_todos(
    db: State<CeleryDb>,
    window: WebviewWindow,
    payload: MoveTodos,
) -> CmdResult<u64> {
    let n = db.move_todos(&payload).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            project_ids: vec![payload.target_project_id.clone()],
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn reorder_todos(
    db: State<CeleryDb>,
    window: WebviewWindow,
    payload: ReorderTodos,
) -> CmdResult<u64> {
    let n = db.reorder_todos(&payload).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            project_ids: vec![payload.project_id.clone()],
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn archive_todos(
    db: State<CeleryDb>,
    window: WebviewWindow,
    ids: Vec<String>,
) -> CmdResult<u64> {
    let n = db.archive_todos(&ids).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            archive_changed: true,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn archived_page(db: State<CeleryDb>, query: ArchivedQuery) -> CmdResult<ArchivedTodoPage> {
    db.archived_page(&query).map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn restore_archived(
    db: State<CeleryDb>,
    window: WebviewWindow,
    ids: Vec<String>,
    fallback_project_id: Option<String>,
) -> CmdResult<u64> {
    let n = db
        .restore_archived(&ids, fallback_project_id.as_deref())
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            todos_changed: true,
            archive_changed: true,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn purge_archived(
    db: State<CeleryDb>,
    window: WebviewWindow,
    ids: Vec<String>,
) -> CmdResult<u64> {
    let n = db.purge_archived(&ids).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            archive_changed: true,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn purge_all_archived(db: State<CeleryDb>, window: WebviewWindow) -> CmdResult<u64> {
    let n = db.purge_all_archived().map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            archive_changed: true,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn archived_count(db: State<CeleryDb>, project_id: Option<String>) -> CmdResult<u64> {
    db.archived_count(project_id.as_deref())
        .map_err(ErrorPayload::from)
}

#[tauri::command]
pub fn incomplete_counts(
    db: State<CeleryDb>,
) -> CmdResult<std::collections::BTreeMap<String, u64>> {
    db.incomplete_counts().map_err(ErrorPayload::from)
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
pub fn create_project(
    db: State<CeleryDb>,
    window: WebviewWindow,
    new_project: NewProject,
) -> CmdResult<ProjectDto> {
    let created = db.create_project(new_project).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            projects_changed: true,
            ..Default::default()
        },
    );
    Ok(created)
}

#[tauri::command]
pub fn update_project(
    db: State<CeleryDb>,
    window: WebviewWindow,
    id: String,
    patch: ProjectPatch,
) -> CmdResult<ProjectDto> {
    let updated = db
        .update_project(&id, &patch)
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            projects_changed: true,
            ..Default::default()
        },
    );
    Ok(updated)
}

#[tauri::command]
pub fn reorder_projects(
    db: State<CeleryDb>,
    window: WebviewWindow,
    payload: ReorderProjects,
) -> CmdResult<u64> {
    let n = db
        .reorder_projects(&payload.ordered_ids)
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            projects_changed: true,
            ..Default::default()
        },
    );
    Ok(n)
}

#[tauri::command]
pub fn delete_project_permanently(
    db: State<CeleryDb>,
    window: WebviewWindow,
    id: String,
) -> CmdResult<()> {
    db.delete_project_permanently(&id)
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            projects_changed: true,
            archive_changed: true,
            ..Default::default()
        },
    );
    Ok(())
}

#[tauri::command]
pub fn ensure_inbox(db: State<CeleryDb>) -> CmdResult<ProjectDto> {
    // 幂等确保；只有首次创建才值得广播，为省一次查询这里接受重复广播的冗余
    //（renderer 的 loadProjects 幂等）。
    db.ensure_inbox().map_err(ErrorPayload::from)
}

// ---------- 设置 ----------

#[tauri::command]
pub fn get_setting(db: State<CeleryDb>, key: String) -> CmdResult<Option<String>> {
    db.get_setting(&key).map_err(ErrorPayload::from)
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
pub fn set_setting(
    db: State<CeleryDb>,
    window: WebviewWindow,
    key: String,
    value: String,
) -> CmdResult<()> {
    db.set_setting(&key, &value).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            settings_changed: true,
            ..Default::default()
        },
    );
    Ok(())
}

#[tauri::command]
pub fn set_settings_bulk(
    db: State<CeleryDb>,
    window: WebviewWindow,
    entries: Vec<SettingsKv>,
) -> CmdResult<()> {
    db.set_settings_bulk(&entries)
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            settings_changed: true,
            ..Default::default()
        },
    );
    Ok(())
}

#[tauri::command]
pub fn delete_setting(db: State<CeleryDb>, window: WebviewWindow, key: String) -> CmdResult<()> {
    db.delete_setting(&key).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            settings_changed: true,
            ..Default::default()
        },
    );
    Ok(())
}

// ---------- 全量替换 / 恢复出厂（v2 JSON 导入路径） ----------

#[tauri::command]
pub fn replace_all(
    db: State<CeleryDb>,
    window: WebviewWindow,
    payload: ReplaceAllPayload,
) -> CmdResult<()> {
    db.replace_all(&payload).map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            full_refresh: true,
            ..Default::default()
        },
    );
    Ok(())
}

#[tauri::command]
pub fn reset_db(db: State<CeleryDb>, window: WebviewWindow) -> CmdResult<()> {
    db.reset().map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            full_refresh: true,
            ..Default::default()
        },
    );
    Ok(())
}

// ---------- 2.x 旧库导入（首次启动向导） ----------

#[tauri::command]
pub fn legacy_v2_detect() -> Option<String> {
    celery_db::detect_v2_source().map(|p| p.display().to_string())
}

#[tauri::command]
pub fn legacy_v2_inspect(path: Option<String>) -> celery_db::dto::LegacyV2Report {
    // path 为空时自动探测；inspect 永不报错，所有问题都体现在报告里
    let path = path
        .map(std::path::PathBuf::from)
        .or_else(celery_db::detect_v2_source);
    match path {
        Some(p) => celery_db::inspect_v2(&p),
        None => celery_db::dto::LegacyV2Report {
            path: String::new(),
            supported: false,
            data_version: 0,
            integrity_ok: false,
            counts: None,
            warnings: Vec::new(),
            blocker: Some("未找到 2.x 数据库文件".into()),
        },
    }
}

#[tauri::command]
pub fn legacy_v2_import(
    db: State<CeleryDb>,
    window: WebviewWindow,
    path: String,
) -> CmdResult<LegacyV2ImportResult> {
    let result = db
        .import_from_v2(std::path::Path::new(&path))
        .map_err(ErrorPayload::from)?;
    notify(
        &window,
        DataChangedEvent {
            full_refresh: true,
            ..Default::default()
        },
    );
    Ok(result)
}
