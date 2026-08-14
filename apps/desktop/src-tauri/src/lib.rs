//! Celery Todo 3.0 桌面端宿主。
//!
//! - 数据层：启动时在 appData 下打开（或创建并迁移）v3 数据库 `celery-v3.db`。
//!   与 2.x Electron 的数据目录不同，升级不会覆盖旧数据。
//! - 命令面：`commands.rs` 里的强类型命令一一对应 @celery/data 的 Repository 契约，
//!   renderer 通过 `createTauriRepositories()` 调用，无任意 SQL / invoke 通道。

mod commands;

use celery_db::CeleryDb;
use tauri::Manager;

const DB_FILE: &str = "celery-v3.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = CeleryDb::open(&dir.join(DB_FILE))?;
            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::todo_page,
            commands::todo_counts,
            commands::get_todo,
            commands::create_todo,
            commands::create_todos_bulk,
            commands::update_todo,
            commands::batch_update_todos,
            commands::move_todos,
            commands::reorder_todos,
            commands::archive_todos,
            commands::archived_page,
            commands::archived_count,
            commands::incomplete_counts,
            commands::restore_archived,
            commands::purge_archived,
            commands::purge_all_archived,
            commands::search_todos,
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::reorder_projects,
            commands::delete_project_permanently,
            commands::ensure_inbox,
            commands::get_setting,
            commands::set_setting,
            commands::set_settings_bulk,
            commands::all_settings,
            commands::settings_by_prefix,
            commands::delete_setting,
            commands::replace_all,
            commands::reset_db,
            commands::legacy_v2_detect,
            commands::legacy_v2_inspect,
            commands::legacy_v2_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
