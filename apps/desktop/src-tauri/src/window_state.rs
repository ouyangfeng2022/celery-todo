//! 窗口状态持久化：主窗口 bounds + 贴图窗口清单（id/项目/位置）。
//!
//! 与 2.x 的 userData/window-state.json 同职责但格式独立（v3 数据目录不同，
//! 两套应用可并存）。写入经单一 debounce 线程合并 —— 拖动/缩放期间事件高频，
//! 逐事件落盘既浪费又可能截断。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickerState {
    pub id: String,
    #[serde(default)]
    pub project_id: String,
    #[serde(default)]
    pub bounds: Option<WindowRect>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowStateFile {
    #[serde(default)]
    pub main: Option<WindowRect>,
    #[serde(default)]
    pub main_maximized: bool,
    #[serde(default)]
    pub stickers: Vec<StickerState>,
}

/// 持久化调度器：channel + debounce 线程合并高频窗口事件；退出前 flush。
pub struct WindowStateStore {
    path: PathBuf,
    state: Arc<Mutex<WindowStateFile>>,
    tx: mpsc::Sender<()>,
    dirty: Arc<AtomicBool>,
}

const SAVE_DEBOUNCE: Duration = Duration::from_millis(400);

impl WindowStateStore {
    pub fn new(app: &AppHandle) -> Self {
        let dir = app.path().app_data_dir().expect("appData 目录不可用");
        let path = dir.join("window-state.json");
        let state = std::fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<WindowStateFile>(&bytes).ok())
            .unwrap_or_default();

        let (tx, rx) = mpsc::channel::<()>();
        let shared = Arc::new(Mutex::new(state));
        let dirty = Arc::new(AtomicBool::new(false));
        let write_path = path.clone();
        let store = Self {
            path,
            state: Arc::clone(&shared),
            tx,
            dirty: Arc::clone(&dirty),
        };

        // debounce 线程：收到首个信号后等 400ms，期间合并后续信号再落盘。
        std::thread::spawn(move || {
            while rx.recv().is_ok() {
                while rx.recv_timeout(SAVE_DEBOUNCE).is_ok() {}
                if dirty.swap(false, Ordering::AcqRel) {
                    let snapshot = shared.lock().map(|s| s.clone()).ok();
                    if let Some(current) = snapshot {
                        if let Ok(json) = serde_json::to_vec_pretty(&current) {
                            let _ = std::fs::write(&write_path, json);
                        }
                    }
                }
            }
        });

        store
    }

    /// 读取当前状态快照（启动恢复用）。
    pub fn get(&self) -> WindowStateFile {
        self.state.lock().map(|s| s.clone()).unwrap_or_default()
    }

    /// 修改状态并调度落盘（debounce 合并）。
    pub fn update(&self, f: impl FnOnce(&mut WindowStateFile)) {
        if let Ok(mut guard) = self.state.lock() {
            f(&mut guard);
            self.dirty.store(true, Ordering::Release);
        }
        let _ = self.tx.send(());
    }

    /// 立即落盘（退出前调用）。
    pub fn flush(&self) {
        if let Ok(guard) = self.state.lock() {
            if let Ok(json) = serde_json::to_vec_pretty(&*guard) {
                let _ = std::fs::write(&self.path, json);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_state_roundtrip() {
        let mut file = WindowStateFile {
            main: Some(WindowRect {
                x: 10,
                y: 20,
                width: 1100,
                height: 750,
            }),
            main_maximized: false,
            stickers: vec![StickerState {
                id: "s1".into(),
                project_id: "p1".into(),
                bounds: Some(WindowRect {
                    x: 1,
                    y: 2,
                    width: 340,
                    height: 460,
                }),
            }],
        };
        let bytes = serde_json::to_vec(&file).unwrap();
        let parsed: WindowStateFile = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed.main.unwrap().width, 1100);
        assert_eq!(parsed.stickers.len(), 1);
        // 缺省字段反序列化（旧文件无 stickers 字段）
        let empty: WindowStateFile = serde_json::from_str("{}").unwrap();
        assert!(empty.stickers.is_empty());
        file.stickers.clear();
    }
}
