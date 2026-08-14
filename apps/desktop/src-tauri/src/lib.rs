//! Celery Todo 3.0 桌面端宿主。
//!
//! - 数据层：启动时在 appData 下打开（或创建并迁移）v3 数据库 `celery-v3.db`。
//!   与 2.x Electron 的数据目录不同，升级不会覆盖旧数据。
//! - 命令面：`commands.rs` 里的强类型命令一一对应 @celery/data 的 Repository 契约，
//!   renderer 通过 `createTauriRepositories()` 调用，无任意 SQL / invoke 通道。
//! - 平台能力（阶段 B）：托盘（tray.rs）、多贴图窗口（stickers.rs）、窗口状态
//!   持久化（window_state.rs）、开机自启（tauri-plugin-autostart）、单实例、
//!   原生导出保存（tauri-plugin-dialog + 直接写文件）。

mod cli_notify;
mod commands;
mod stickers;
mod tray;
mod window_state;

use celery_db::CeleryDb;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use window_state::WindowStateStore;

const DB_FILE: &str = "celery-v3.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 二次启动：唤起已有主窗口（数据由首个实例持有）
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.unminimize();
                let _ = main.show();
                let _ = main.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // 应用内更新：端点/公钥在 tauri.conf plugins.updater；
        // 构建期由 TAURI_SIGNING_PRIVATE_KEY 签名（见 desktop-release.yml）。
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| match event {
            // 关闭主窗口 = 最小化到托盘（设置可关）；托盘菜单「退出」走 exit。
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() != "main" {
                    return;
                }
                let minimize_to_tray = window
                    .app_handle()
                    .try_state::<CeleryDb>()
                    .and_then(|db| db.get_setting("minimizeToTray").ok().flatten())
                    .map(|v| v != "false")
                    .unwrap_or(true);
                if minimize_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    if let Some(store) = window.app_handle().try_state::<WindowStateStore>() {
                        store.flush();
                    }
                    // 允许默认关闭；全部窗口退出后应用结束
                }
            }
            // 主窗口位置/尺寸 → 持久化（debounce 合并）
            tauri::WindowEvent::Moved(pos) => {
                if window.label() == "main" {
                    if let Some(store) = window.app_handle().try_state::<WindowStateStore>() {
                        let size = window.inner_size().ok();
                        store.update(|s| {
                            s.main = Some(window_state::WindowRect {
                                x: pos.x,
                                y: pos.y,
                                width: size.map(|sz| sz.width).unwrap_or(1100),
                                height: size.map(|sz| sz.height).unwrap_or(750),
                            });
                        });
                    }
                }
            }
            tauri::WindowEvent::Resized(size) => {
                if window.label() == "main" {
                    if let (Some(store), Ok(pos)) = (
                        window.app_handle().try_state::<WindowStateStore>(),
                        window.outer_position(),
                    ) {
                        store.update(|s| {
                            s.main = Some(window_state::WindowRect {
                                x: pos.x,
                                y: pos.y,
                                width: size.width,
                                height: size.height,
                            });
                        });
                    }
                }
            }
            _ => {}
        })
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            // E2E / 测试注入：覆盖数据库路径，避免污染真实用户数据
            //（tauri-driver 经 wdio:tauriOptions.env 传入）。
            let db_path = std::env::var("CELERY_DB_PATH")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| dir.join(DB_FILE));
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let db = CeleryDb::open(&db_path)?;
            app.manage(db);

            let store = WindowStateStore::new(app.handle());
            // 恢复主窗口位置（conf 中 visible=false 防止默认位置闪现）
            let saved = store.get();
            if let Some(main) = app.get_webview_window("main") {
                if let Some(rect) = saved.main.clone() {
                    let _ = main.set_position(tauri::PhysicalPosition::new(rect.x, rect.y));
                    let _ = main.set_size(tauri::PhysicalSize::new(rect.width, rect.height));
                }
                let _ = main.show();
            }
            app.manage(store);

            tray::create_tray(app.handle())?;
            // 重建上次会话的贴图窗口（主窗口已显示后再叠加，避免启动白屏误判）
            stickers::restore_stickers(app.handle());
            // CLI 写入通知服务（发现文件随 db 同目录；失败不阻断启动）
            cli_notify::start(app.handle());
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
            // ===== 平台能力（阶段 B） =====
            commands::set_auto_start,
            commands::export_save_file,
            commands::open_in_folder,
            stickers::sticker_create,
            stickers::sticker_duplicate,
            stickers::sticker_set_project,
            stickers::sticker_close,
            stickers::sticker_return_main,
            stickers::sticker_style_changed,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 退出前清理：CLI 通知发现文件 + 窗口状态落盘（debounce 可能还有尾部）
            if let tauri::RunEvent::Exit = event {
                cli_notify::stop(app_handle);
                if let Some(store) = app_handle.try_state::<WindowStateStore>() {
                    store.flush();
                }
            }
        });
}
