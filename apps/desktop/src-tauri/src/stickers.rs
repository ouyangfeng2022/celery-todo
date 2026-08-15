//! 多贴图（简洁模式）浮窗管理。
//!
//! 行为对齐 2.x electron/main.ts 的 createStickerWindow + sticker:* IPC：
//! - 无框 / 透明 / 置顶 / 不进任务栏，300–420 × 380–620，新建向左上级联排布；
//! - 状态（id / 项目 / bounds）持久化到 window-state.json，启动时重建；
//! - 复制以源窗口尺寸为准向右下错开 28px；
//! - 「返回主窗口」先唤起主窗口再关闭贴图，避免中间一帧全部不可见。
//!
//! renderer 与主窗口共用同一 bundle，URL 查询参数 `?sticker=<id>&project=<pid>`
//! 区分渲染分支（main.tsx）。

use crate::window_state::{StickerState, WindowRect, WindowStateStore};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const STICKER_MIN_W: f64 = 300.0;
const STICKER_MIN_H: f64 = 380.0;
const STICKER_MAX_W: f64 = 420.0;
const STICKER_MAX_H: f64 = 620.0;

fn sticker_label(id: &str) -> String {
    format!("sticker-{id}")
}

/// 新建（或唤起已有）贴图窗口。
pub fn create_sticker_window(app: &AppHandle, id: &str, project_id: &str) -> tauri::Result<()> {
    let label = sticker_label(id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let store = app.state::<WindowStateStore>();
    let (index, bounds) = {
        let state = store.get();
        let index = state.stickers.len();
        let bounds = state
            .stickers
            .iter()
            .find(|s| s.id == id)
            .and_then(|s| s.bounds.clone());
        (index, bounds)
    };

    // 无保存位置时贴着主显示器右下角向左上级联（与 2.x 一致）
    let (x, y) = match &bounds {
        Some(b) => (b.x, b.y),
        None => {
            // 主显示器工作区：多显示器下取「当前」显示器不便跨平台，退化为primary
            if let Some(monitor) = app.primary_monitor().ok().flatten() {
                let size = monitor.size();
                let pos = monitor.position();
                let scale = monitor.scale_factor();
                let wa_w = size.width as f64 / scale;
                let wa_h = size.height as f64 / scale;
                (
                    pos.x as i32 + (wa_w - 364.0 - (index as f64) * 28.0) as i32,
                    pos.y as i32 + (wa_h - 484.0) as i32,
                )
            } else {
                (80 + (index as i32) * 28, 80 + (index as i32) * 28)
            }
        }
    };
    let (w, h) = match &bounds {
        Some(b) => (b.width as f64, b.height as f64),
        None => (340.0, 460.0),
    };

    store.update(|s| {
        if !s.stickers.iter().any(|item| item.id == id) {
            s.stickers.push(StickerState {
                id: id.to_string(),
                project_id: project_id.to_string(),
                bounds: None,
            });
        }
    });

    let url = format!("index.html?sticker={}&project={}", id, project_id);
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("Celery Todo 简洁模式")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(true)
        .inner_size(w.min(STICKER_MAX_W).max(STICKER_MIN_W), h.min(STICKER_MAX_H).max(STICKER_MIN_H))
        .min_inner_size(STICKER_MIN_W, STICKER_MIN_H)
        .max_inner_size(STICKER_MAX_W, STICKER_MAX_H)
        .position(x as f64, y as f64)
        .build()?;

    // 位置/尺寸变化 → 持久化（debounce 由 store 内部合并）
    let app_handle = app.clone();
    let id_owned = id.to_string();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::Moved(pos) => {
            let (w, h) = current_size(&app_handle, &id_owned);
            persist_bounds(&app_handle, &id_owned, pos.x, pos.y, w, h);
        }
        tauri::WindowEvent::Resized(size) => {
            if let Some(win) = app_handle.get_webview_window(&sticker_label(&id_owned)) {
                if let Ok(pos) = win.outer_position() {
                    persist_bounds(
                        &app_handle,
                        &id_owned,
                        pos.x,
                        pos.y,
                        size.width,
                        size.height,
                    );
                }
            }
        }
        tauri::WindowEvent::Destroyed => {
            let store = app_handle.state::<WindowStateStore>();
            store.update(|s| s.stickers.retain(|item| item.id != id_owned));
        }
        _ => {}
    });
    Ok(())
}

fn current_size(app: &AppHandle, id: &str) -> (u32, u32) {
    app.get_webview_window(&sticker_label(id))
        .and_then(|w| w.inner_size().ok())
        .map(|s| (s.width, s.height))
        .unwrap_or((340, 460))
}

fn persist_bounds(app: &AppHandle, id: &str, x: i32, y: i32, width: u32, height: u32) {
    let store = app.state::<WindowStateStore>();
    store.update(|s| {
        if let Some(sticker) = s.stickers.iter_mut().find(|item| item.id == id) {
            sticker.bounds = Some(WindowRect {
                x,
                y,
                width,
                height,
            });
        }
    });
}

/// 启动时按持久化状态重建全部贴图窗口。
pub fn restore_stickers(app: &AppHandle) {
    let store = app.state::<WindowStateStore>();
    let stickers = store.get().stickers;
    for sticker in stickers {
        if let Err(e) = create_sticker_window(app, &sticker.id, &sticker.project_id) {
            eprintln!("重建贴图 {} 失败: {e}", sticker.id);
        }
    }
}

// ============================================
// Tauri 命令（renderer 经 src/platform 调用）
// ============================================

/// 新建贴图；与 2.x 一致，从主窗口发起时隐藏主窗口（贴图即轻量替代）。
#[tauri::command]
pub fn sticker_create(app: AppHandle, window: tauri::WebviewWindow, project_id: Option<String>) -> Result<(), String> {
    let sender_is_main = window.label() == "main";
    let id = uuid::Uuid::new_v4().to_string();
    create_sticker_window(&app, &id, project_id.as_deref().unwrap_or(""))
        .map_err(|e| e.to_string())?;
    if sender_is_main {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
    }
    Ok(())
}

/// 复制贴图：以源窗口尺寸为准向右下错开 28px（仅源贴图自身可发起）。
#[tauri::command]
pub fn sticker_duplicate(
    app: AppHandle,
    window: tauri::WebviewWindow,
    source_id: String,
    project_id: String,
) -> Result<(), String> {
    if window.label() != sticker_label(&source_id) {
        return Err("只有贴图自身可以复制".into());
    }
    let source = app
        .get_webview_window(&sticker_label(&source_id))
        .ok_or("源贴图不存在")?;
    let (offset_x, offset_y, w, h) = source
        .outer_position()
        .ok()
        .and_then(|pos| source.inner_size().ok().map(|size| (pos.x, pos.y, size.width, size.height)))
        .unwrap_or((80, 80, 340, 460));

    let store = app.state::<WindowStateStore>();
    let new_id = uuid::Uuid::new_v4().to_string();
    store.update(|s| {
        // 同步源贴图当前项目
        if let Some(src) = s.stickers.iter_mut().find(|item| item.id == source_id) {
            src.project_id = project_id.clone();
        }
        s.stickers.push(StickerState {
            id: new_id.clone(),
            project_id,
            bounds: Some(WindowRect {
                x: offset_x + 28,
                y: offset_y + 28,
                width: w,
                height: h,
            }),
        });
    });
    create_sticker_window(&app, &new_id, &read_sticker_project(&app, &new_id)).map_err(|e| e.to_string())
}

fn read_sticker_project(app: &AppHandle, id: &str) -> String {
    app.state::<WindowStateStore>()
        .get()
        .stickers
        .iter()
        .find(|s| s.id == id)
        .map(|s| s.project_id.clone())
        .unwrap_or_default()
}

/// 记录贴图绑定的项目（仅贴图自身可发起）。
#[tauri::command]
pub fn sticker_set_project(
    app: AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    project_id: String,
) -> Result<(), String> {
    if window.label() != sticker_label(&id) {
        return Err("只有贴图自身可以修改绑定项目".into());
    }
    let store = app.state::<WindowStateStore>();
    store.update(|s| {
        if let Some(sticker) = s.stickers.iter_mut().find(|item| item.id == id) {
            sticker.project_id = project_id;
        }
    });
    Ok(())
}

/// 关闭贴图并移除其持久化状态（仅贴图自身可发起）。
#[tauri::command]
pub fn sticker_close(app: AppHandle, window: tauri::WebviewWindow, id: String) -> Result<(), String> {
    if window.label() != sticker_label(&id) {
        return Err("只有贴图自身可以关闭".into());
    }
    if let Some(win) = app.get_webview_window(&sticker_label(&id)) {
        let _ = win.close();
    }
    Ok(())
}

/// 「返回主窗口」：先唤起主窗口再关闭贴图（仅贴图自身可发起）。
#[tauri::command]
pub fn sticker_return_main(app: AppHandle, window: tauri::WebviewWindow, id: String) -> Result<(), String> {
    if window.label() != sticker_label(&id) {
        return Err("只有贴图自身可以返回主窗口".into());
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(win) = app.get_webview_window(&sticker_label(&id)) {
        let _ = win.close();
    }
    Ok(())
}

/// 主窗口设置页改贴图样式后，向所有贴图窗口广播（不回声主窗口）。
#[tauri::command]
pub fn sticker_style_changed(app: AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("只有主窗口可以广播贴图样式".into());
    }
    for (label, target) in app.webview_windows() {
        if label.starts_with("sticker-") {
            let _ = target.emit_to(label.as_str(), "sticker-style-changed", ());
        }
    }
    Ok(())
}
