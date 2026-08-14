//! CLI → 桌面端写后通知。
//!
//! 桌面端在 `<db 同目录>/cli-notify.json` 发布 `{port, token}`（见
//! apps/desktop/src-tauri/src/cli_notify.rs）。CLI 在每次写命令成功后发送
//! 一行 JSON；桌面校验 token 后以 `source: "cli"` 广播 data-changed，
//! 打开中的主窗口/贴图窗口即时刷新。
//!
//! 桌面未运行 / 文件缺失 / 连接失败一律静默忽略 —— 数据已落盘，
//! 下次桌面启动自然可见。

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::path::Path;
use std::time::Duration;

const IO_TIMEOUT: Duration = Duration::from_millis(500);

#[derive(Deserialize)]
struct Discovery {
    port: u16,
    token: String,
}

/// 一次写操作的变更范围（与桌面 DataChangedEvent 的变更位对齐）。
#[derive(Debug, Clone, Default, Serialize)]
pub struct ChangeNotice {
    #[serde(rename = "todosChanged")]
    pub todos_changed: bool,
    #[serde(rename = "projectIds")]
    pub project_ids: Vec<String>,
    #[serde(rename = "projectsChanged")]
    pub projects_changed: bool,
    #[serde(rename = "settingsChanged")]
    pub settings_changed: bool,
    #[serde(rename = "archiveChanged")]
    pub archive_changed: bool,
}

#[derive(Serialize)]
struct Payload<'a> {
    token: &'a str,
    #[serde(flatten)]
    notice: &'a ChangeNotice,
}

/// 通知桌面（db_dir 为数据库所在目录，与桌面 appData 一致）。失败静默。
pub fn notify_desktop(db_dir: &Path, notice: &ChangeNotice) {
    let file = db_dir.join("cli-notify.json");
    let Ok(bytes) = std::fs::read(&file) else { return };
    let Ok(discovery) = serde_json::from_slice::<Discovery>(&bytes) else { return };

    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", discovery.port)) else { return };
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));

    let Ok(line) = serde_json::to_string(&Payload {
        token: &discovery.token,
        notice,
    }) else {
        return;
    };
    let _ = stream.write_all(line.as_bytes());
    let _ = stream.write_all(b"\n");
    let _ = stream.flush();
    // 半关闭写端，桌面的 read_line 才能返回；等回执确保对端处理完再退出
    let _ = stream.shutdown(std::net::Shutdown::Write);
    let _ = BufReader::new(&mut stream).read_line(&mut String::new());
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;

    #[test]
    fn notice_payload_shape() {
        let notice = ChangeNotice {
            todos_changed: true,
            project_ids: vec!["p1".into()],
            ..Default::default()
        };
        let json = serde_json::to_string(&Payload {
            token: "t",
            notice: &notice,
        })
        .unwrap();
        assert!(json.contains("\"token\":\"t\""));
        assert!(json.contains("\"todosChanged\":true"));
        assert!(json.contains("\"projectIds\":[\"p1\"]"));
        assert!(json.contains("\"projectsChanged\":false"));
    }

    #[test]
    fn notify_roundtrip_against_fake_desktop() {
        // 假桌面：监听回环 + 读一行 JSON 后回执
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("cli-notify.json"),
            serde_json::json!({"port": port, "token": "secret"}).to_string(),
        )
        .unwrap();

        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            BufReader::new(&mut stream).read_line(&mut line).unwrap();
            stream.write_all(b"{\"ok\":true}\n").unwrap();
            line
        });

        notify_desktop(
            dir.path(),
            &ChangeNotice {
                todos_changed: true,
                project_ids: vec!["p9".into()],
                archive_changed: true,
                ..Default::default()
            },
        );

        let received = server.join().unwrap();
        let parsed: serde_json::Value = serde_json::from_str(received.trim()).unwrap();
        assert_eq!(parsed["token"], "secret");
        assert_eq!(parsed["todosChanged"], true);
        assert_eq!(parsed["projectIds"][0], "p9");
        assert_eq!(parsed["archiveChanged"], true);
    }

    #[test]
    fn notify_missing_file_is_silent() {
        let dir = tempfile::tempdir().unwrap();
        notify_desktop(
            dir.path(),
            &ChangeNotice {
                todos_changed: true,
                ..Default::default()
            },
        );
        // 无发现文件 → 静默返回，无 panic
    }
}
