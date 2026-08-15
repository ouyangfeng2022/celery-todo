//! 系统托盘：右键菜单（快速添加 / 新建·显示贴图 / 显示·隐藏主窗口 / 退出），
//! 单击切换主窗口可见性。行为对齐 2.x electron/tray.ts。

use crate::stickers;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

/// 真正退出（绕过「关闭即最小化到托盘」的拦截）。
pub fn quit_app(app: &AppHandle) {
    // 先落盘窗口状态再退出
    if let Some(store) = app.try_state::<crate::window_state::WindowStateStore>() {
        store.flush();
    }
    app.exit(0);
}

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let quick_add = MenuItem::with_id(
        app,
        "quick-add",
        "快速添加事项",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let new_sticker = MenuItem::with_id(app, "new-sticker", "新建简洁模式浮窗", true, None::<&str>)?;
    let show_stickers = MenuItem::with_id(app, "show-stickers", "显示所有简洁浮窗", true, None::<&str>)?;
    let show_main = MenuItem::with_id(app, "show-main", "显示主窗口", true, None::<&str>)?;
    let hide_main = MenuItem::with_id(app, "hide-main", "隐藏到托盘", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "exit", "退出", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[&quick_add, &sep, &new_sticker, &show_stickers, &sep, &show_main, &hide_main, &sep, &exit],
    )?;

    let version = app.package_info().version.to_string();
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(format!("Celery Todo v{version}"))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quick-add" => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.unminimize();
                    let _ = main.show();
                    let _ = main.set_focus();
                    let _ = main.emit_to("main", "quick-add", ());
                }
            }
            "new-sticker" => {
                let id = uuid::Uuid::new_v4().to_string();
                if let Err(e) = stickers::create_sticker_window(app, &id, "") {
                    eprintln!("新建贴图失败: {e}");
                }
            }
            "show-stickers" => show_all_stickers(app),
            "show-main" => {
                show_all_stickers(app);
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.unminimize();
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
            "hide-main" => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.hide();
                }
            }
            "exit" => quit_app(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(main) = app.get_webview_window("main") {
                    if main.is_visible().unwrap_or(false) {
                        let _ = main.hide();
                    } else {
                        let _ = main.unminimize();
                        let _ = main.show();
                        let _ = main.set_focus();
                    }
                }
            }
        });

    // 使用打包的应用图标作为托盘图标（Windows 下自动缩放到系统尺寸）
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn show_all_stickers(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with("sticker-") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
