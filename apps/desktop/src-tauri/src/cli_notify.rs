//! CLI → 桌面刷新桥。
//!
//! 3.0 CLI（apps/cli）与桌面共用同一个 SQLite 文件，写入不经过桌面进程；
//! 桌面无法感知外部写。本模块在本地回环起一个极简 TCP 通知服务：
//!
//! - 启动时把 `{port, token}` 写入 `<appData>/cli-notify.json`（随 db 同目录，
//!   CLI 按 db 路径定位）；退出时删除。
//! - CLI 在每次写命令后连接并发送一行 JSON（带 token 校验）；
//! - 校验通过后以 `source: "cli"` 广播 data-changed —— renderer 的
//!   platform.onDataChanged 不过滤该来源，主窗口/贴图窗口即时刷新。
//!
//! 协议刻意保持一行请求 + 一行应答，无跨版本兼容负担（CLI 与桌面同仓同版本）。

use crate::commands::DataChangedEvent;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const NOTIFY_FILE: &str = "cli-notify.json";
/// 连接/读写超时：CLI 侧同样设置，两端都不会因对端卡死而挂起。
const IO_TIMEOUT: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NotifyFile {
    port: u16,
    token: String,
}

/// CLI 发来的通知载荷（camelCase 字段与 CLI notify.rs 的 ChangeNotice 对齐）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliNotice {
    pub token: String,
    #[serde(default)]
    pub todos_changed: bool,
    #[serde(default)]
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub projects_changed: bool,
    #[serde(default)]
    pub settings_changed: bool,
    #[serde(default)]
    pub archive_changed: bool,
}

fn notify_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(NOTIFY_FILE))
}

/// 启动通知服务并写入发现文件。失败不阻断应用（CLI 刷新退化为下次启动可见）。
pub fn start(app: &AppHandle) {
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            eprintln!("CLI 通知服务启动失败: {e}");
            return;
        }
    };
    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(_) => return,
    };
    let token = uuid::Uuid::new_v4().to_string();
    if let Some(path) = notify_path(app) {
        let content = serde_json::to_vec(&NotifyFile {
            port,
            token: token.clone(),
        })
        .ok();
        if let Some(json) = content {
            if std::fs::write(&path, json).is_err() {
                return;
            }
        }
    }

    let app_handle = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            if stream.set_read_timeout(Some(IO_TIMEOUT)).is_err() {
                continue;
            }
            let mut writer = match stream.try_clone() {
                Ok(w) => w,
                Err(_) => continue,
            };
            let mut reader = BufReader::new(stream);
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() {
                continue;
            }
            let notice: CliNotice = match serde_json::from_str(line.trim()) {
                Ok(n) => n,
                Err(_) => {
                    let _ = writeln!(writer, "{{\"ok\":false,\"error\":\"bad-json\"}}");
                    continue;
                }
            };
            if notice.token != token {
                let _ = writeln!(writer, "{{\"ok\":false,\"error\":\"bad-token\"}}");
                continue;
            }
            let event = DataChangedEvent {
                revision: crate::commands::next_revision(),
                source: "cli".into(),
                todos_changed: notice.todos_changed,
                project_ids: notice.project_ids,
                projects_changed: notice.projects_changed,
                settings_changed: notice.settings_changed,
                archive_changed: notice.archive_changed,
                full_refresh: false,
            };
            let _ = app_handle.emit("data-changed", event);
            let _ = writeln!(writer, "{{\"ok\":true}}");
        }
    });
}

/// 退出清理：删除发现文件（缺失/失败静默）。
pub fn stop(app: &AppHandle) {
    if let Some(path) = notify_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notice_parses_with_defaults() {
        let n: CliNotice = serde_json::from_str(r#"{"token":"t"}"#).unwrap();
        assert_eq!(n.token, "t");
        assert!(!n.todos_changed);
        assert!(n.project_ids.is_empty());
        let full: CliNotice = serde_json::from_str(
            r#"{"token":"t","todosChanged":true,"projectIds":["p1"],"archiveChanged":true}"#,
        )
        .unwrap();
        assert!(full.todos_changed && full.archive_changed);
        assert_eq!(full.project_ids, vec!["p1"]);
    }
}
