//! 多贴图（简洁模式）浮窗管理。
//!
//! 行为对齐 2.x electron/main.ts 的 createStickerWindow + sticker:* IPC：
//! - 无框 / 透明 / 置顶 / 不进任务栏，300–420 × 380–620，新建向左级联排布；
//! - 状态（id / 项目 / bounds）持久化到 window-state.json，启动时重建；
//! - 复制以源窗口尺寸为准向右下错开 28px；
//! - 「返回主窗口」先唤起主窗口再关闭贴图，避免中间一帧全部不可见。
//! - 新建贴图回到上次关闭贴图的位置（last_sticker_bounds）；无记忆时贴
//!   主显示器**工作区**右下角（工作区不含任务栏，底边留边距，不再压任务栏）。
//!
//! renderer 与主窗口共用同一 bundle，URL 查询参数 `?sticker=<id>&project=<pid>`
//! 区分渲染分支（main.tsx）。

use crate::window_state::{StickerState, WindowRect, WindowStateStore};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const STICKER_MIN_W: f64 = 300.0;
const STICKER_MIN_H: f64 = 380.0;
const STICKER_MAX_W: f64 = 420.0;
const STICKER_MAX_H: f64 = 620.0;
const STICKER_DEFAULT_W: f64 = 340.0;
const STICKER_DEFAULT_H: f64 = 460.0;

fn sticker_label(id: &str) -> String {
    format!("sticker-{id}")
}

/// 主显示器工作区（不含任务栏），物理像素换算为逻辑坐标。
/// 多显示器下取「当前」显示器不便跨平台，退化为 primary。
fn primary_work_area(app: &AppHandle) -> Option<(f64, f64, f64, f64)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    Some((
        work.position.x as f64 / scale,
        work.position.y as f64 / scale,
        work.size.width as f64 / scale,
        work.size.height as f64 / scale,
    ))
}

/// 工作区右下角默认位置（逻辑坐标）：右边距 24px、底边距 40px，按 index 向左级联 28px。
/// 2.x 按全屏高度摆放，窗口底部会压进任务栏，这里以工作区为界并抬高底边距。
fn workarea_default_origin(work: (f64, f64, f64, f64), index: usize) -> (f64, f64) {
    let (wx, wy, ww, wh) = work;
    (
        wx + ww - STICKER_DEFAULT_W - 24.0 - index as f64 * 28.0,
        wy + wh - STICKER_DEFAULT_H - 40.0,
    )
}

/// 物理坐标所在显示器的缩放（供物理 bounds 换算 builder 逻辑坐标）。
/// 点不在任何显示器上时退化为 primary，再退化 1.0——只影响建窗初始落点的
/// 近似值，build 后的 set_position 按物理坐标精确落位。
fn scale_at_physical(app: &AppHandle, x: f64, y: f64) -> f64 {
    app.monitor_from_point(x, y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
        .map(|m| m.scale_factor())
        .unwrap_or(1.0)
}

/// 物理 bounds → builder 逻辑参数：位置/尺寸除以缩放，尺寸夹取到贴图范围。
/// 不换算尺寸会把物理值当逻辑值传给 inner_size，缩放 ≠100% 时恢复的贴图
/// 每次重启都放大一档，直到撞 max_inner_size 上限。
fn physical_to_builder(x: f64, y: f64, w: f64, h: f64, scale: f64) -> (f64, f64, f64, f64) {
    (
        x / scale,
        y / scale,
        (w / scale).clamp(STICKER_MIN_W, STICKER_MAX_W),
        (h / scale).clamp(STICKER_MIN_H, STICKER_MAX_H),
    )
}

/// 新建（或唤起已有）贴图窗口。
///
/// 线程约束：Windows 下不得在主线程的 IPC 回调 / 菜单事件里同步调用本函数
/// （WebviewWindowBuilder::build() 会死锁，见 wry#583）。合法调用位置：
/// async 命令体（运行时线程）、setup 阶段（restore_stickers）、独立线程。
pub fn create_sticker_window(app: &AppHandle, id: &str, project_id: &str) -> tauri::Result<()> {
    let label = sticker_label(id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let store = app.state::<WindowStateStore>();
    let (index, bounds, last_bounds) = {
        let state = store.get();
        (
            state.stickers.len(),
            state
                .stickers
                .iter()
                .find(|s| s.id == id)
                .and_then(|s| s.bounds.clone()),
            state.last_sticker_bounds.clone(),
        )
    };

    // 初始位置优先级：贴图自身已保存的 bounds（重启恢复/唤起）→ 上次关闭贴图
    // 记住的位置（已有贴图时向左级联错开防重叠）→ 工作区右下角默认。
    // 已保存/记忆的 bounds 是物理像素（Moved/Resized 事件口径），级联偏移在
    // build 后按实际缩放折算物理像素扣除，这里先取未经级联的原始值。
    let cascade = index as f64 * 28.0;
    let had_saved_bounds = bounds.is_some();
    let use_last_bounds = bounds.is_none() && last_bounds.is_some();
    let (x, y, w, h) = match bounds {
        Some(b) => (b.x as f64, b.y as f64, b.width as f64, b.height as f64),
        None => match last_bounds {
            Some(last) => (
                last.x as f64,
                last.y as f64,
                last.width as f64,
                last.height as f64,
            ),
            None => match primary_work_area(app) {
                Some(work) => {
                    let (x, y) = workarea_default_origin(work, index);
                    (x, y, STICKER_DEFAULT_W, STICKER_DEFAULT_H)
                }
                None => (
                    80.0 + cascade,
                    80.0 + cascade,
                    STICKER_DEFAULT_W,
                    STICKER_DEFAULT_H,
                ),
            },
        },
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
    // builder 的 position/inner_size 接受逻辑坐标：物理 bounds 按落点显示器缩放
    // 换算（工作区默认路径本就是逻辑值，scale = 1.0 直通）。
    let scale = if had_saved_bounds || use_last_bounds {
        scale_at_physical(app, x, y)
    } else {
        1.0
    };
    let (bx, by, bw, bh) = physical_to_builder(x, y, w, h, scale);
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(url.into()))
        .title("Celery Todo 简洁模式")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .resizable(true)
        .inner_size(bw, bh)
        .min_inner_size(STICKER_MIN_W, STICKER_MIN_H)
        .max_inner_size(STICKER_MAX_W, STICKER_MAX_H)
        .position(bx, by)
        .build()?;

    // 建窗后按物理坐标精确落位（覆盖按显示器缩放近似换算的初始位置）；
    // last_bounds 路径的级联偏移按窗口实际缩放折算成物理像素扣除，
    // 缩放 ≠100% 时 28 逻辑像素不再变成 28×scale 的视觉错位。
    if had_saved_bounds || use_last_bounds {
        let cascade_phys = if use_last_bounds {
            cascade * window.scale_factor().unwrap_or(1.0)
        } else {
            0.0
        };
        let _ = window.set_position(tauri::PhysicalPosition::new(
            (x - cascade_phys) as i32,
            y as i32,
        ));
    }

    // 新建（无历史 bounds）时立即落一份实际 bounds：用户未拖动就关闭，关闭
    // 位置才有据可记；重启恢复也不会因现存贴图数量（index）变化而漂移。
    if !had_saved_bounds {
        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
            persist_bounds(app, id, pos.x, pos.y, size.width, size.height);
        }
    }

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
            store.update(|s| {
                // 先把关闭时的位置记为「上次位置」（下次新建贴图回到这里），再移除记录。
                if let Some(closed) = s
                    .stickers
                    .iter()
                    .find(|item| item.id == id_owned)
                    .and_then(|item| item.bounds.clone())
                {
                    s.last_sticker_bounds = Some(closed);
                }
                s.stickers.retain(|item| item.id != id_owned);
            });
        }
        _ => {}
    });
    Ok(())
}

fn current_size(app: &AppHandle, id: &str) -> (u32, u32) {
    app.get_webview_window(&sticker_label(id))
        .and_then(|w| w.inner_size().ok())
        .map(|s| (s.width, s.height))
        .unwrap_or((STICKER_DEFAULT_W as u32, STICKER_DEFAULT_H as u32))
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
///
/// 必须是 async 命令：Windows 上 WebView2 的 IPC 回调在主线程内联执行，
/// 同步命令里 `WebviewWindowBuilder::build()` 会等控制器创建完成而死锁
/// 主线程（wry#583，tauri 文档明确标注）。async 命令在运行时线程上执行，
/// build() 经事件代理回到空闲的主线程完成，不会重入死锁。
#[tauri::command]
pub async fn sticker_create(
    app: AppHandle,
    window: tauri::WebviewWindow,
    project_id: Option<String>,
) -> Result<(), String> {
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
/// 同 sticker_create，建窗必须离开主线程（async 命令体）。
#[tauri::command]
pub async fn sticker_duplicate(
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
        .unwrap_or((80, 80, STICKER_DEFAULT_W as u32, STICKER_DEFAULT_H as u32));

    let store = app.state::<WindowStateStore>();
    let new_id = uuid::Uuid::new_v4().to_string();
    // 错开 28 逻辑像素，按源窗口缩放折算物理坐标（bounds 存的是物理口径）
    let offset = (28.0 * source.scale_factor().unwrap_or(1.0)) as i32;
    store.update(|s| {
        // 同步源贴图当前项目
        if let Some(src) = s.stickers.iter_mut().find(|item| item.id == source_id) {
            src.project_id = project_id.clone();
        }
        s.stickers.push(StickerState {
            id: new_id.clone(),
            project_id,
            bounds: Some(WindowRect {
                x: offset_x + offset,
                y: offset_y + offset,
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

#[cfg(test)]
mod tests {
    use super::*;

    /// 1920×1080、任务栏 48px 的工作区。
    const WORK: (f64, f64, f64, f64) = (0.0, 0.0, 1920.0, 1032.0);

    #[test]
    fn default_origin_clears_taskbar_with_margin() {
        // 底边距工作区底 40px（2.x 按全屏高度摆放会压进任务栏）
        let (x, y) = workarea_default_origin(WORK, 0);
        assert_eq!(x, 1920.0 - STICKER_DEFAULT_W - 24.0);
        assert_eq!(y, 1032.0 - STICKER_DEFAULT_H - 40.0);
    }

    #[test]
    fn default_origin_uses_workarea_origin() {
        // 副显示器（工作区原点非 0）：位置相对工作区原点计算
        let work = (2560.0, 0.0, 1920.0, 1032.0);
        let (x, y) = workarea_default_origin(work, 0);
        assert_eq!(x, 2560.0 + 1920.0 - STICKER_DEFAULT_W - 24.0);
        assert_eq!(y, 0.0 + 1032.0 - STICKER_DEFAULT_H - 40.0);
    }

    #[test]
    fn default_origin_cascades_left() {
        let (x0, y0) = workarea_default_origin(WORK, 0);
        let (x2, y2) = workarea_default_origin(WORK, 2);
        assert!((x0 - x2 - 56.0).abs() < f64::EPSILON);
        assert_eq!(y0, y2);
    }

    #[test]
    fn physical_to_builder_scales_position_and_size() {
        // 150% 缩放：物理 (300,450,510,690) 是 340×460 逻辑贴图的物理口径，
        // 换算回逻辑后位置 (200,300)、尺寸 (340,460)——不换算尺寸则恢复时
        // 逐次放大（510 逻辑 × 1.5 = 765 物理，如此循环直到撞上限）
        let (x, y, w, h) = physical_to_builder(300.0, 450.0, 510.0, 690.0, 1.5);
        assert!((x - 200.0).abs() < f64::EPSILON);
        assert!((y - 300.0).abs() < f64::EPSILON);
        assert!((w - 340.0).abs() < f64::EPSILON);
        assert!((h - 460.0).abs() < f64::EPSILON);
    }

    #[test]
    fn physical_to_builder_passthrough_and_clamp() {
        // 100% 缩放直通；尺寸超贴图范围时夹取
        let (x, y, w, h) = physical_to_builder(10.0, 20.0, 800.0, 200.0, 1.0);
        assert!((x - 10.0).abs() < f64::EPSILON);
        assert!((y - 20.0).abs() < f64::EPSILON);
        assert!((w - STICKER_MAX_W).abs() < f64::EPSILON);
        assert!((h - STICKER_MIN_H).abs() < f64::EPSILON);
    }
}
